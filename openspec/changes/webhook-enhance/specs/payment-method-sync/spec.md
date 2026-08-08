# Payment Method Sync

## Purpose
Synchronize payment method attachments and detachments from Stripe to local database, enabling users to save cards without making a purchase.

## Requirements

### Requirement: Setup Intent Creation
The system SHALL allow authenticated users to create a SetupIntent for saving a payment method without immediate charge.

#### Scenario: Successful SetupIntent creation
- **GIVEN** authenticated user with Stripe customer ID
- **WHEN** user calls `POST /billing/setup-intent`
- **THEN** system calls Stripe `setupIntents.create()`
- **AND** returns client secret for frontend to confirm card setup

#### Scenario: SetupIntent creation without Stripe customer
- **GIVEN** authenticated user without Stripe customer ID
- **WHEN** user calls `POST /billing/setup-intent`
- **THEN** system returns 400 error with code `STRIPE_CUSTOMER_MISSING`

### Requirement: Setup Intent Succeeded Webhook
The system SHALL handle `setup_intent.succeeded` webhooks to save payment method information to the database.

#### Scenario: Payment method saved successfully
- **GIVEN** `setup_intent.succeeded` event received from Stripe
- **WHEN** webhook processor handles the event
- **THEN** system extracts payment method details (last4, brand, expiration)
- **AND** creates PaymentMethod record in database
- **AND** if this is user's first payment method, sets it as default

#### Scenario: Setup intent with missing payment method
- **GIVEN** `setup_intent.succeeded` event received
- **WHEN** payment method ID is missing from event payload
- **THEN** system logs error
- **AND** marks event as FAILED (no retry)

#### Scenario: Setup intent for unknown user
- **GIVEN** `setup_intent.succeeded` event received
- **WHEN** metadata does not contain valid userId
- **THEN** system logs error
- **AND** marks event as FAILED (no retry)

### Requirement: Payment Method Attached Webhook
The system SHALL handle `payment_method.attached` webhooks to synchronize payment method information.

#### Scenario: Payment method attached to customer
- **GIVEN** `payment_method.attached` event received from Stripe
- **WHEN** webhook processor handles the event
- **THEN** system extracts payment method details
- **AND** creates PaymentMethod record in database
- **AND** if user has no default payment method, sets this as default

#### Scenario: Payment method already exists
- **GIVEN** `payment_method.attached` event received
- **WHEN** payment method already exists in database
- **THEN** system updates existing record with latest details
- **AND** does not create duplicate record

### Requirement: Payment Method Updated Webhook
The system SHALL handle `payment_method.updated` webhooks to synchronize payment method changes.

#### Scenario: Payment method details updated
- **GIVEN** `payment_method.updated` event received from Stripe
- **WHEN** webhook processor handles the event
- **THEN** system finds existing PaymentMethod record by stripePaymentMethodId
- **AND** updates last4, brand, or expiration fields if changed
- **AND** logs the update

#### Scenario: Payment method not found in database
- **GIVEN** `payment_method.updated` event received
- **WHEN** payment method does not exist in database
- **THEN** system logs warning
- **AND** creates new PaymentMethod record

### Requirement: Payment Method Detached Webhook
The system SHALL handle `payment_method.detached` webhooks to remove payment methods from the database.

#### Scenario: Payment method detached from customer
- **GIVEN** `payment_method.detached` event received from Stripe
- **WHEN** webhook processor handles the event
- **THEN** system finds PaymentMethod record by stripePaymentMethodId
- **AND** deletes the record from database
- **AND** if this was the default payment method, sets another as default (if exists)

#### Scenario: Detaching default payment method with no alternatives
- **GIVEN** user has only one payment method (the default)
- **WHEN** that payment method is detached
- **THEN** system deletes the PaymentMethod record
- **AND** user has no default payment method (defaultPaymentMethodId remains null)

#### Scenario: Payment method not found during detach
- **GIVEN** `payment_method.detached` event received
- **WHEN** payment method does not exist in database
- **THEN** system logs warning
- **AND** marks event as DONE (no error)

### Requirement: List Payment Methods
The system SHALL allow authenticated users to list their saved payment methods.

#### Scenario: User with multiple payment methods
- **GIVEN** authenticated user with 3 saved payment methods
- **WHEN** user calls `GET /billing/payment-methods`
- **THEN** system returns array of payment methods with id, brand, last4, expiration, isDefault
- **AND** default payment method is marked with isDefault: true

#### Scenario: User with no payment methods
- **GIVEN** authenticated user with no saved payment methods
- **WHEN** user calls `GET /billing/payment-methods`
- **THEN** system returns empty array

### Requirement: Delete Payment Method
The system SHALL allow authenticated users to delete a saved payment method.

#### Scenario: Successful payment method deletion
- **GIVEN** authenticated user with saved payment method
- **WHEN** user calls `DELETE /billing/payment-methods/:id`
- **THEN** system calls Stripe `paymentMethods.detach()`
- **AND** deletes PaymentMethod record from database
- **AND** if this was the default, sets another as default (if exists)

#### Scenario: Delete non-existent payment method
- **GIVEN** authenticated user
- **WHEN** user calls `DELETE /billing/payment-methods/:id` with invalid id
- **THEN** system returns 404 error with message "Payment method not found"

#### Scenario: Delete payment method owned by another user
- **GIVEN** authenticated user
- **WHEN** user calls `DELETE /billing/payment-methods/:id` with another user's payment method id
- **THEN** system returns 404 error with message "Payment method not found"
- **AND** does not delete the payment method

#### Scenario: Stripe API error during detach
- **GIVEN** authenticated user
- **WHEN** user calls `DELETE /billing/payment-methods/:id`
- **AND** Stripe API returns error
- **THEN** system returns 503 error with message "Payment service temporarily unavailable"
- **AND** does not delete from database

### Requirement: Payment Method Data Model
The system SHALL store payment method information in a PCI-compliant manner.

#### Scenario: Payment method record structure
- **GIVEN** payment method saved to database
- **WHEN** PaymentMethod record is created
- **THEN** record SHALL include:
  - userId: Reference to user
  - stripePaymentMethodId: Stripe payment method ID (unique)
  - brand: Card brand (visa, mastercard, etc.)
  - last4: Last 4 digits of card number
  - expMonth: Expiration month (1-12)
  - expYear: Expiration year (4 digits)
  - isDefault: Boolean indicating if this is user's default payment method
  - createdAt: Timestamp
  - updatedAt: Timestamp

#### Scenario: No raw card data storage
- **GIVEN** payment method saved to database
- **WHEN** PaymentMethod record is created
- **THEN** record SHALL NOT include:
  - Full card number
  - CVV/CVC
  - Cardholder name (unless explicitly required)
  - Any other PCI-sensitive data
