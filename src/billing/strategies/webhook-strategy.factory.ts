import { Injectable, Logger } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { WebhookStrategyInterface } from './webhook-strategy.interface';

@Injectable()
export class WebhookStrategyFactory {
  private readonly logger = new Logger(WebhookStrategyFactory.name);
  private readonly strategies: WebhookStrategyInterface[];

  constructor(
    @Inject('WEBHOOK_STRATEGIES')
    strategies: WebhookStrategyInterface[],
  ) {
    this.strategies = strategies;
    this.validateNoDuplicates();
  }

  getStrategy(eventType: string): WebhookStrategyInterface | null {
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

  private getSupportedTypes(strategy: WebhookStrategyInterface): string[] {
    const knownTypes = [
      'checkout.session.completed',
      'checkout.session.expired',
      'invoice.paid',
      'invoice.payment_failed',
      'customer.subscription.created',
      'customer.subscription.updated',
      'customer.subscription.deleted',
    ];
    return knownTypes.filter((t) => strategy.supports(t));
  }
}
