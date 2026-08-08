import { Injectable, Inject } from '@nestjs/common';
import { WebhookStrategy } from '@/billing/strategies/webhook-strategy.interface';
import { AppLogger } from '@/logger/app-logger';
import {
  STRIPE_EVENT_CHECKOUT_COMPLETED,
  STRIPE_EVENT_CHECKOUT_EXPIRED,
  STRIPE_EVENT_INVOICE_CREATED,
  STRIPE_EVENT_INVOICE_FINALIZED,
  STRIPE_EVENT_INVOICE_PAID,
  STRIPE_EVENT_INVOICE_VOIDED,
  STRIPE_EVENT_INVOICE_FAILED,
  STRIPE_EVENT_SUBSCRIPTION_CREATED,
  STRIPE_EVENT_SUBSCRIPTION_DELETED,
  STRIPE_EVENT_PRODUCT_DELETED,
  STRIPE_EVENT_PRODUCT_CREATED,
  STRIPE_EVENT_PRODUCT_UPDATED,
  STRIPE_EVENT_PRICE_CREATED,
  STRIPE_EVENT_PRICE_UPDATED,
  STRIPE_EVENT_PRICE_DELETED,
  STRIPE_EVENT_PLAN_CREATED,
  STRIPE_EVENT_PLAN_UPDATED,
  STRIPE_EVENT_PLAN_DELETED,
} from '@/common/constants/stripe-event.constants';

export const WEBHOOK_STRATEGIES_TOKEN = 'WEBHOOK_STRATEGIES';

@Injectable()
export class WebhookStrategyFactory {
  private readonly strategies: WebhookStrategy[];

  constructor(
    @Inject(WEBHOOK_STRATEGIES_TOKEN)
    strategies: WebhookStrategy[],
    private readonly logger: AppLogger,
  ) {
    this.logger.setContext('WebhookStrategyFactory');
    this.strategies = strategies;
    this.validateNoDuplicates();
  }

  getStrategy(eventType: string): WebhookStrategy | null {
    return this.strategies.find((s) => s.supports(eventType)) ?? null;
  }

  supports(eventType: string): boolean {
    return this.strategies.some((s) => s.supports(eventType));
  }

  private validateNoDuplicates(): void {
    const seen = new Set<string>();
    for (const strategy of this.strategies) {
      for (const type of this.getSupportedTypes(strategy)) {
        if (seen.has(type)) {
          throw new Error(`Duplicate webhook strategy registered for event type: ${type}`);
        }
        seen.add(type);
      }
    }
  }

  private getSupportedTypes(strategy: WebhookStrategy): string[] {
    const knownTypes = [
      STRIPE_EVENT_CHECKOUT_COMPLETED,
      STRIPE_EVENT_CHECKOUT_EXPIRED,
      STRIPE_EVENT_INVOICE_CREATED,
      STRIPE_EVENT_INVOICE_FINALIZED,
      STRIPE_EVENT_INVOICE_PAID,
      STRIPE_EVENT_INVOICE_VOIDED,
      STRIPE_EVENT_INVOICE_FAILED,
      STRIPE_EVENT_SUBSCRIPTION_CREATED,
      STRIPE_EVENT_SUBSCRIPTION_DELETED,
      STRIPE_EVENT_PRODUCT_DELETED,
      STRIPE_EVENT_PRODUCT_CREATED,
      STRIPE_EVENT_PRODUCT_UPDATED,
      STRIPE_EVENT_PRICE_CREATED,
      STRIPE_EVENT_PRICE_UPDATED,
      STRIPE_EVENT_PRICE_DELETED,
      STRIPE_EVENT_PLAN_CREATED,
      STRIPE_EVENT_PLAN_UPDATED,
      STRIPE_EVENT_PLAN_DELETED,
    ];
    return knownTypes.filter((t) => strategy.supports(t));
  }
}
