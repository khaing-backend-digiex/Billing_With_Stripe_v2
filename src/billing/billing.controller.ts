import { Controller, Post, Get, Body, UseGuards } from '@nestjs/common';
import { BillingService } from './billing.service';
import { CreateSubscriptionCheckoutDto } from './dto/create-subscription-checkout.dto';
import { CreateAddonCheckoutDto } from './dto/create-addon-checkout.dto';
import { AuthGuard } from '../auth/guards/auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Permission } from '../auth/enums/permission.enum';

@Controller('billing')
@UseGuards(AuthGuard)
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  @Post('checkout/subscription')
  @UseGuards(PermissionsGuard)
  @RequirePermissions(Permission.BILLING_ACCESS)
  async createSubscriptionCheckout(
    @CurrentUser('sub') userId: string,
    @Body() dto: CreateSubscriptionCheckoutDto,
  ) {
    return this.billingService.createSubscriptionCheckout(userId, dto.priceId, dto.currency);
  }

  @Post('checkout/addon')
  @UseGuards(PermissionsGuard)
  @RequirePermissions(Permission.BILLING_ACCESS)
  async createAddonCheckout(
    @CurrentUser('sub') userId: string,
    @Body() dto: CreateAddonCheckoutDto,
  ) {
    return this.billingService.createAddonCheckout(userId, dto.priceId);
  }

  @Get('subscriptions')
  @UseGuards(PermissionsGuard)
  @RequirePermissions(Permission.BILLING_ACCESS)
  async getUserSubscriptions(@CurrentUser('sub') userId: string) {
    return this.billingService.getUserSubscriptions(userId);
  }
}
