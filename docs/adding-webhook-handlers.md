# Adding New Webhook Event Handlers

## Overview

The webhook system uses a Strategy Pattern to handle different Stripe event types. Each strategy is responsible for processing one specific event type.

## Step-by-Step Guide

### 1. Create Strategy File

Create a new strategy file in `src/billing/strategies/` with the appropriate subdirectory:

```
src/billing/strategies/
├── checkout/          # For checkout.* events
├── invoice/           # For invoice.* events
└── subscription/      # For customer.subscription.* events
```

### 2. Implement the Strategy Interface

```typescript
import { Injectable, Logger } from '@nestjs/common';
import Stripe from 'stripe';
import { WebhookStrategyInterface } from '../webhook-strategy.interface';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class YourNewStrategy implements WebhookStrategyInterface {
  private readonly logger = new Logger(YourNewStrategy.name);

  constructor(private readonly prisma: PrismaService) {}

  supports(eventType: string): boolean {
    return eventType === 'your.event.type';
  }

  async handle(event: Stripe.Event): Promise<void> {
    const data = event.data.object as Stripe.YourEventType;
    
    this.logger.log(`Processing your.event.type: ${data.id}`);
    
    // Your business logic here
    // Use Prisma transactions for multi-step operations
  }
}
```

### 3. Register the Strategy

Add your strategy to the `WEBHOOK_STRATEGIES` array in `src/billing/billing.module.ts`:

```typescript
const webhookStrategies = [
  CheckoutSessionCompletedStrategy,
  InvoicePaidStrategy,
  InvoicePaymentFailedStrategy,
  CustomerSubscriptionUpdatedStrategy,
  CustomerSubscriptionDeletedStrategy,
  YourNewStrategy,  // Add here
];
```

### 4. Key Points

- **Use `event.data.object` directly** - Don't make additional Stripe API calls
- **Handle missing data gracefully** - Log warnings and return early if required data is missing
- **Use Prisma transactions** for multi-step operations to ensure ACID properties
- **Throw errors to trigger retry** - The processor will retry up to 3 times (1-day intervals)
- **Log important actions** - Use the Logger for debugging and monitoring

### 5. Test Your Strategy

Create a unit test in `src/billing/__tests__/strategies/`:

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { YourNewStrategy } from '../../strategies/path/your-new.strategy';
import { PrismaService } from '../../../prisma/prisma.service';

describe('YourNewStrategy', () => {
  let strategy: YourNewStrategy;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        YourNewStrategy,
        {
          provide: PrismaService,
          useValue: {
            // Mock Prisma methods
          },
        },
      ],
    }).compile();

    strategy = module.get<YourNewStrategy>(YourNewStrategy);
  });

  it('should support your.event.type', () => {
    expect(strategy.supports('your.event.type')).toBe(true);
  });

  it('should handle event correctly', async () => {
    const mockEvent = {
      id: 'evt_test',
      type: 'your.event.type',
      data: { object: { /* your data */ } },
    } as Stripe.Event;

    await strategy.handle(mockEvent);
    
    // Assert expected behavior
  });
});
```

### 6. Update Documentation

- Add the event type to `docs/api.md`
- Update this guide if needed
