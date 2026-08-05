import { Module } from '@nestjs/common';
import { CatalogController } from '@/catalog/catalog.controller';
import { CatalogService } from '@/catalog/catalog.service';
import { AuthModule } from '@/auth/auth.module';
import { ExchangeRateService } from '@/catalog/exchange-rate.service';
import { BillingModule } from '@/billing/billing.module';
@Module({
  imports: [AuthModule, BillingModule],
  controllers: [CatalogController],
  providers: [CatalogService, ExchangeRateService],
  exports: [CatalogService, ExchangeRateService],
})
export class CatalogModule {}
