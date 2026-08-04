import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import Stripe from 'stripe';
import { PrismaService } from '../prisma/prisma.service';
import { WebhookStrategyFactory } from './strategies/webhook-strategy.factory';
import { WebhookStatus, WebhookEvent } from '../../generated/prisma/client';

import { AppLogger } from '../logger/app-logger';

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
    const events = await this.prisma.$queryRaw<WebhookEvent[]>`
      SELECT 
        id, 
        stripe_event_id AS "stripeEventId", 
        type, 
        payload, 
        status, 
        retry_count AS "retryCount", 
        max_retries AS "maxRetries", 
        last_error AS "lastError", 
        next_retry_at AS "nextRetryAt", 
        processed_at AS "processedAt", 
        created_at AS "createdAt", 
        updated_at AS "updatedAt"
      FROM webhook_events
      WHERE status = ${WebhookStatus.PENDING}::"WebhookStatus"
      AND next_retry_at <= NOW()
      ORDER BY next_retry_at ASC
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

  private async processEvent(event: WebhookEvent) {
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

      const stripeEvent = {
        id: event.stripeEventId,
        object: 'event',
        api_version: '2026-06-24.dahlia',
        created: event.createdAt.getTime(),
        type: event.type,
        data: {
          object: event.payload as any,
        },
      } as Stripe.Event;

      await strategy.handle(stripeEvent);

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

  private async handleFailure(event: WebhookEvent, error: Error) {
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
