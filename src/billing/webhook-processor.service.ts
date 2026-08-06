import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '@/prisma/prisma.service';
import { WebhookStrategyFactory } from '@/billing/strategies/webhook-strategy.factory';
import { WebhookStatus, WebhookEvent as PrismaWebhookEvent } from '../../generated/prisma/client';
import { WebhookEvent as GenericWebhookEvent } from '@/billing/payments/types/payment.types';
import { AppLogger } from '@/logger/app-logger';
import { WEBHOOK_BATCH_SIZE } from '@/common/constants/billing.constants';

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
      LIMIT ${WEBHOOK_BATCH_SIZE}
      FOR UPDATE SKIP LOCKED
    `;

    if (!Array.isArray(events) || events.length === 0) {
      return;
    }

    this.logger.log(`Processing ${events.length} pending webhook events`);

    for (const event of events) {
      this.logger.log(`Processing event: ${event.stripeEventId} (${event.type})`);
      await this.processEvent(event);
    }
  }

  private async processEvent(event: PrismaWebhookEvent) {
    const strategy = this.strategyFactory.getStrategy(event.type);

    if (!strategy) {
      this.logger.warn(` UNHANDLED EVENT: ${event.type} (id: ${event.stripeEventId}) - No strategy registered`);
      this.logger.warn(`Event payload keys: ${event.payload ? Object.keys(event.payload as object).join(', ') : 'null'}`);
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

      this.logger.log(`Successfully processed event: ${event.stripeEventId} (${event.type})`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Event processing failed: ${event.stripeEventId} (${event.type}) - ${errorMessage}`);
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

    const nextRetryAt = this.calculateNextRetry(newRetryCount);

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

  private calculateNextRetry(retryCount: number): Date {
    const now = new Date();
    const delayHours = Math.pow(2, retryCount);
    now.setHours(now.getHours() + delayHours);
    return now;
  }

  @Cron(CronExpression.EVERY_HOUR)
  async logWebhookStatistics() {
    const twentyFourHoursAgo = new Date();
    twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);

    try {
      const statistics = await this.prisma.$queryRaw<
        Array<{
          type: string;
          status: string;
          count: number;
        }>
      >`
        SELECT type, status::text, COUNT(*)::int as count
        FROM webhook_events
        WHERE "createdAt" >= ${twentyFourHoursAgo}
        GROUP BY type, status
        ORDER BY type, status
      `;

      if (statistics.length === 0) {
        this.logger.log(' Webhook Event Statistics (last 24h): No events received');
        return;
      }

      this.logger.log('Webhook Event Statistics (last 24h):');
      this.logger.log('─'.repeat(80));

      const byType = statistics.reduce(
        (acc, stat) => {
          if (!acc[stat.type]) {
            acc[stat.type] = { total: 0, byStatus: {} };
          }
          acc[stat.type].total += stat.count;
          acc[stat.type].byStatus[stat.status] = stat.count;
          return acc;
        },
        {} as Record<string, { total: number; byStatus: Record<string, number> }>,
      );

      Object.entries(byType)
        .sort((a, b) => b[1].total - a[1].total)
        .forEach(([type, data]) => {
          const statusBreakdown = Object.entries(data.byStatus)
            .map(([status, count]) => `${status}:${count}`)
            .join(', ');
          this.logger.log(`  ${type}: ${data.total} total (${statusBreakdown})`);
        });

      this.logger.log('─'.repeat(80));
      const totalEvents = statistics.reduce((sum, stat) => sum + stat.count, 0);
      this.logger.log(`Total: ${totalEvents} events`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to generate webhook statistics: ${errorMessage}`);
    }
  }
}
