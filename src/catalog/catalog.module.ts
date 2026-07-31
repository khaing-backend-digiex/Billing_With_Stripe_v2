import { Module } from '@nestjs/common';
import { CatalogController } from './catalog.controller';
import { CatalogService } from './catalog.service';
import { ExchangeRateService } from './exchange-rate.service';
import { StripeService } from '../billing/stripe.service';
import { PrismaService } from '../prisma/prisma.service';

@Module({
  controllers: [CatalogController],
  providers: [CatalogService, ExchangeRateService, StripeService, PrismaService],
  exports: [CatalogService, ExchangeRateService],
})
export class CatalogModule {}
