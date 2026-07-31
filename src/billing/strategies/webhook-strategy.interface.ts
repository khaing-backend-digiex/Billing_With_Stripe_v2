import Stripe from 'stripe';

export interface WebhookStrategyInterface {
  supports(eventType: string): boolean;
  handle(event: Stripe.Event): Promise<void>;
}
