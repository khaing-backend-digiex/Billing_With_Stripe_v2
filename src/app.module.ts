import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '@/prisma/prisma.module';
import { AuthModule } from '@/auth/auth.module';
import { BillingModule } from '@/billing/billing.module';
import { CatalogModule } from '@/catalog/catalog.module';
import { CreditModule } from '@/credit/credit.module';
import { LoggerModule } from '@/logger/logger.module';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { GlobalExceptionFilter } from '@/common/filters/global-exception.filter';
import { TransformResponseInterceptor } from '@/common/interceptors/transform-response.interceptor';
import { CorrelationIdMiddleware } from '@/common/middleware/correlation-id.middleware';
import { THROTTLER_TTL_MS, THROTTLER_LIMIT } from '@/common/constants/http.constants';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ThrottlerModule.forRoot([{
      ttl: THROTTLER_TTL_MS,
      limit: THROTTLER_LIMIT,
    }]),
    LoggerModule,
    PrismaModule,
    AuthModule,
    BillingModule,
    CatalogModule,
    CreditModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_FILTER,
      useClass: GlobalExceptionFilter,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: TransformResponseInterceptor,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(CorrelationIdMiddleware).forRoutes('*');
  }
}
