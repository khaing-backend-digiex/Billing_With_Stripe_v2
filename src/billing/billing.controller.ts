import { Controller, Post, Get, Delete, Body, Query, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { BillingService } from '@/billing/billing.service';
import { CreateSubscriptionCheckoutDto } from '@/billing/dto/create-subscription-checkout.dto';
import { CreateAddonCheckoutDto } from '@/billing/dto/create-addon-checkout.dto';
import { SubscriptionListQueryDto } from '@/billing/dto/billing-query.dto';
import { CheckoutUrlResponseDto, SubscriptionResponseDto } from '@/billing/dto/billing-response.dto';
import { AuthGuard } from '@/auth/guards/auth.guard';
import { PermissionsGuard } from '@/auth/guards/permissions.guard';
import { RequirePermissions } from '@/auth/decorators/require-permissions.decorator';
import { CurrentUser } from '@/auth/decorators/current-user.decorator';
import { Permission } from '@/auth/enums/permission.enum';

@ApiTags('Billing')
@Controller('billing')
@UseGuards(AuthGuard)
@ApiBearerAuth()
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  @Post('checkout/subscription')
  @UseGuards(PermissionsGuard)
  @RequirePermissions(Permission.BILLING_ACCESS)
  @ApiOperation({ summary: 'Create subscription checkout session' })
  @ApiResponse({ status: 201, description: 'Checkout session created', type: CheckoutUrlResponseDto })
  async createSubscriptionCheckout(
    @CurrentUser('sub') userId: string,
    @Body() dto: CreateSubscriptionCheckoutDto,
  ): Promise<CheckoutUrlResponseDto> {
    return this.billingService.createSubscriptionCheckout(userId, dto.priceId, dto.currency);
  }

  @Post('checkout/addon')
  @UseGuards(PermissionsGuard)
  @RequirePermissions(Permission.BILLING_ACCESS)
  @ApiOperation({ summary: 'Create addon checkout session' })
  @ApiResponse({ status: 201, description: 'Checkout session created', type: CheckoutUrlResponseDto })
  async createAddonCheckout(
    @CurrentUser('sub') userId: string,
    @Body() dto: CreateAddonCheckoutDto,
  ): Promise<CheckoutUrlResponseDto> {
    return this.billingService.createAddonCheckout(userId, dto.priceId);
  }

  @Post('setup-intent')
  @UseGuards(PermissionsGuard)
  @RequirePermissions(Permission.BILLING_ACCESS)
  @ApiOperation({ summary: 'Create setup intent for saving payment method' })
  @ApiResponse({ status: 201, description: 'Setup intent created' })
  async createSetupIntent(@CurrentUser('sub') userId: string) {
    return this.billingService.createSetupIntent(userId);
  }

  @Get('payment-methods')
  @UseGuards(PermissionsGuard)
  @RequirePermissions(Permission.BILLING_ACCESS)
  @ApiOperation({ summary: 'List user payment methods' })
  @ApiResponse({ status: 200, description: 'List of payment methods' })
  async listPaymentMethods(@CurrentUser('sub') userId: string) {
    return this.billingService.listPaymentMethods(userId);
  }

  @Delete('payment-methods/:id')
  @UseGuards(PermissionsGuard)
  @RequirePermissions(Permission.BILLING_ACCESS)
  @ApiOperation({ summary: 'Delete payment method' })
  @ApiResponse({ status: 200, description: 'Payment method deleted' })
  async deletePaymentMethod(
    @CurrentUser('sub') userId: string,
    @Param('id') id: string,
  ) {
    return this.billingService.deletePaymentMethod(userId, id);
  }

  @Get('subscriptions')
  @UseGuards(PermissionsGuard)
  @RequirePermissions(Permission.GETUSERSUB)
  @ApiOperation({ summary: 'Get user subscriptions' })
  @ApiResponse({ status: 200, description: 'List of subscriptions', type: [SubscriptionResponseDto] })
  async getUserSubscriptions(
    @CurrentUser('sub') userId: string,
    @Query() query: SubscriptionListQueryDto,
  ) {
    return this.billingService.getUserSubscriptions(userId, query);
  }

  @Get('preview')
  @UseGuards(PermissionsGuard)
  @RequirePermissions(Permission.BILLING_ACCESS)
  @ApiOperation({ summary: 'Preview subscription upgrade costs' })
  @ApiResponse({ status: 200, description: 'Upgrade preview with proration details' })
  async previewUpgrade(
    @CurrentUser('sub') userId: string,
    @Query('priceId') priceId: string,
  ) {
    return this.billingService.previewUpgrade(userId, priceId);
  }
}
