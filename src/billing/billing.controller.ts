import { Controller, Post, Get, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { BillingService } from './billing.service';
import { CreateSubscriptionCheckoutDto } from './dto/create-subscription-checkout.dto';
import { CreateAddonCheckoutDto } from './dto/create-addon-checkout.dto';
import { SubscriptionListQueryDto } from './dto/billing-query.dto';
import { CheckoutUrlResponseDto, SubscriptionResponseDto } from './dto/billing-response.dto';
import { AuthGuard } from '../auth/guards/auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Permission } from '../auth/enums/permission.enum';

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

  @Get('subscriptions')
  @UseGuards(PermissionsGuard)
  @RequirePermissions(Permission.BILLING_ACCESS)
  @ApiOperation({ summary: 'Get user subscriptions' })
  @ApiResponse({ status: 200, description: 'List of subscriptions', type: [SubscriptionResponseDto] })
  async getUserSubscriptions(
    @CurrentUser('sub') userId: string,
    @Query() query: SubscriptionListQueryDto,
  ) {
    return this.billingService.getUserSubscriptions(userId, query);
  }
}
