import { Module } from '@nestjs/common';
import { CatalogController } from './catalog.controller';
import { CatalogService } from './catalog.service';
import { AuthModule } from '../auth/auth.module';
import { ExchangeRateService } from './exchange-rate.service';
import { BillingModule } from '../billing/billing.module';
import { PrismaService } from '../prisma/prisma.service';

@Module({
  imports: [AuthModule, BillingModule],
  controllers: [CatalogController],
  providers: [CatalogService, ExchangeRateService, PrismaService],
  exports: [CatalogService, ExchangeRateService],
})
export class CatalogModule {}
