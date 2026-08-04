import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '@/prisma/prisma.service';
import { WebhookStrategyFactory } from '@/billing/strategies/webhook-strategy.factory';
import { WebhookStatus, WebhookEvent as PrismaWebhookEvent } from '../../generated/prisma/client';
import { WebhookEvent as GenericWebhookEvent } from '@/billing/payments/types/payment.types';

import { AppLogger } from '@/logger/app-logger';

@Injectable()
export class WebhookProcessorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly strategyFactory: WebhookStrategyFactory,
    private readonly logger: AppLogger,
  ) {
    this.logger.setContext('WebhookProcessorService');
  }

  @Cron(CronExpression.EVERY_30_SECONDS)
  async processPendingEvents() {
    const events = await this.prisma.$queryRaw<PrismaWebhookEvent[]>`
      SELECT 
        id, 
        "stripeEventId", 
        type, 
        payload, 
        status, 
        "retryCount", 
        "maxRetries", 
        "lastError", 
        "nextRetryAt", 
        "processedAt", 
        "createdAt"
      FROM webhook_events
      WHERE status = ${WebhookStatus.PENDING}::"WebhookStatus"
      AND "nextRetryAt" <= NOW()
      ORDER BY "nextRetryAt" ASC
      LIMIT 20
      FOR UPDATE SKIP LOCKED
    `;

    if (!Array.isArray(events) || events.length === 0) {
      return;
    }

    this.logger.log(`Processing ${events.length} pending webhook events`);

    for (const event of events) {
      await this.processEvent(event);
    }
  }

  private async processEvent(event: PrismaWebhookEvent) {
    const strategy = this.strategyFactory.getStrategy(event.type);

    if (!strategy) {
      this.logger.warn(`No strategy found for event type: ${event.type}`);
      await this.prisma.webhookEvent.update({
        where: { id: event.id },
        data: { status: WebhookStatus.DONE },
      });
      return;
    }

    try {
      await this.prisma.webhookEvent.update({
        where: { id: event.id },
        data: { status: WebhookStatus.PROCESSING },
      });

      const genericEvent: GenericWebhookEvent = {
        id: event.stripeEventId,
        type: event.type,
        payload: event.payload,
      };

      await strategy.handle(genericEvent);

      await this.prisma.webhookEvent.update({
        where: { id: event.id },
        data: {
          status: WebhookStatus.DONE,
          processedAt: new Date(),
        },
      });

      this.logger.log(`Successfully processed event: ${event.type}`);
    } catch (error) {
      await this.handleFailure(event, error instanceof Error ? error : new Error(String(error)));
    }
  }

  private async handleFailure(event: PrismaWebhookEvent, error: Error) {
    const newRetryCount = event.retryCount + 1;
    const maxRetries = event.maxRetries;

    this.logger.error(
      `Failed to process event ${event.type} (attempt ${newRetryCount}/${maxRetries}): ${error.message}`,
    );

    if (newRetryCount >= maxRetries) {
      await this.prisma.webhookEvent.update({
        where: { id: event.id },
        data: {
          status: WebhookStatus.FAILED,
          retryCount: newRetryCount,
          lastError: error.message,
        },
      });

      this.logger.error(`Event ${event.type} failed after ${maxRetries} attempts`);
      return;
    }

    const nextRetryAt = this.calculateNextRetry();

    await this.prisma.webhookEvent.update({
      where: { id: event.id },
      data: {
        status: WebhookStatus.PENDING,
        retryCount: newRetryCount,
        lastError: error.message,
        nextRetryAt,
      },
    });
  }

  private calculateNextRetry(): Date {
    const now = new Date();
    now.setDate(now.getDate() + 1);
    return now;
  }
}
