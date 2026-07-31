## ADDED Requirements

### Requirement: Admin creates product with multi-currency prices
The system SHALL allow administrators to create Stripe products with a base price in VND. Upon creation, the system SHALL automatically fetch live exchange rates and generate prices in USD, EUR, and GBP without rounding.

#### Scenario: Successful product creation with VND base price
- **WHEN** admin calls `POST /admin/catalog/products` with `{ name: "Pro Plan - Monthly", basePrice: 300000, currency: "VND", interval: "month" }`
- **THEN** system creates Stripe product, fetches exchange rates from ExchangeRate-API, creates prices in VND/USD/EUR/GBP, and returns product ID with all price IDs

#### Scenario: ExchangeRate-API timeout during product creation
- **WHEN** admin calls `POST /admin/catalog/products` and ExchangeRate-API times out
- **THEN** system uses latest cached exchange rates from `ExchangeRate` table and creates prices with cached rates

#### Scenario: No cached exchange rates available
- **WHEN** admin calls `POST /admin/catalog/products` and ExchangeRate-API fails AND no cached rates exist
- **THEN** system returns 503 error with message "Exchange rate service unavailable"

#### Scenario: Admin provides invalid base price
- **WHEN** admin calls `POST /admin/catalog/products` with `{ basePrice: -100 }`
- **THEN** system returns 400 error with message "Base price must be positive"

### Requirement: Admin refreshes product prices
The system SHALL allow administrators to manually refresh product prices by re-fetching exchange rates and updating Stripe prices.

#### Scenario: Successful price refresh
- **WHEN** admin calls `POST /admin/catalog/products/:id/refresh-prices`
- **THEN** system fetches latest exchange rates, updates all Stripe prices for the product, updates `StripePrice` records, and returns updated product with new prices

#### Scenario: Price refresh with API failure and cached fallback
- **WHEN** admin calls `POST /admin/catalog/products/:id/refresh-prices` and ExchangeRate-API fails
- **THEN** system uses cached rates from DB and updates prices with cached rates

### Requirement: Admin lists products with prices
The system SHALL allow administrators to list all products with their associated prices across all currencies.

#### Scenario: Successful product listing
- **WHEN** admin calls `GET /admin/catalog/products`
- **THEN** system returns array of products with their prices, including product name, plan type, and all currency prices

#### Scenario: Product listing with no products
- **WHEN** admin calls `GET /admin/catalog/products` and no products exist
- **THEN** system returns empty array

### Requirement: Admin updates product
The system SHALL allow administrators to update product metadata (name, active status) without affecting prices.

#### Scenario: Successful product update
- **WHEN** admin calls `PUT /admin/catalog/products/:id` with `{ name: "Pro Plan V2" }`
- **THEN** system updates Stripe product name and DB record, returns updated product

#### Scenario: Admin deactivates product
- **WHEN** admin calls `PUT /admin/catalog/products/:id` with `{ isActive: false }`
- **THEN** system deactivates Stripe product and all associated prices, marks DB records as inactive

### Requirement: Admin views exchange rates
The system SHALL allow administrators to view current exchange rates cached in the database.

#### Scenario: Successful exchange rate retrieval
- **WHEN** admin calls `GET /admin/catalog/exchange-rates`
- **THEN** system returns current exchange rates with base currency (VND), target currencies (USD, EUR, GBP), rates, and last updated timestamps

#### Scenario: No exchange rates cached
- **WHEN** admin calls `GET /admin/catalog/exchange-rates` and no rates exist
- **THEN** system returns empty array with message "No exchange rates available"

### Requirement: Exchange rate caching and fallback
The system SHALL cache exchange rates in the `ExchangeRate` table and use cached rates as fallback when ExchangeRate-API fails.

#### Scenario: Successful rate fetch and cache
- **WHEN** system fetches exchange rates from ExchangeRate-API
- **THEN** system updates `ExchangeRate` table with latest rates and timestamps

#### Scenario: API failure with cached fallback
- **WHEN** ExchangeRate-API fails and cached rates exist (updated within 24 hours)
- **THEN** system uses cached rates and logs warning about stale data

#### Scenario: API failure with stale cache
- **WHEN** ExchangeRate-API fails and cached rates are older than 24 hours
- **THEN** system uses cached rates but logs error about stale data exceeding 24 hours
