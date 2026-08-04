import { WebhookEvent } from '../payments/types/payment.types';

export interface WebhookStrategy {
  supports(eventType: string): boolean;
  handle(event: WebhookEvent): Promise<void>;
}
