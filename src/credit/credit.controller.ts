import { Controller, Post, Get, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { CreditService } from '@/credit/credit.service';
import { ConsumeCreditsDto } from '@/credit/dto/consume-credits.dto';
import { CreditBalanceResponseDto } from '@/credit/dto/credit-response.dto';
import { AuthGuard } from '@/auth/guards/auth.guard';
import { PermissionsGuard } from '@/auth/guards/permissions.guard';
import { RequirePermissions } from '@/auth/decorators/require-permissions.decorator';
import { CurrentUser } from '@/auth/decorators/current-user.decorator';
import { Permission } from '@/auth/enums/permission.enum';

@ApiTags('Credits')
@Controller('credits')
@UseGuards(AuthGuard)
@ApiBearerAuth()
export class CreditController {
  constructor(private readonly creditService: CreditService) {}

  @Post('consume')
  @UseGuards(PermissionsGuard)
  @RequirePermissions(Permission.CREDIT_ACCESS)
  @ApiOperation({ summary: 'Consume credits' })
  @ApiResponse({ status: 200, description: 'Credits consumed', type: CreditBalanceResponseDto })
  async consumeCredits(
    @CurrentUser('sub') userId: string,
    @Body() dto: ConsumeCreditsDto,
  ) {
    return this.creditService.consumeCredits(userId, dto.amount);
  }

  @Get('balance')
  @UseGuards(PermissionsGuard)
  @RequirePermissions(Permission.CREDIT_ACCESS)
  @ApiOperation({ summary: 'Get credit balance' })
  @ApiResponse({ status: 200, description: 'Credit balance', type: CreditBalanceResponseDto })
  async getCreditBalance(@CurrentUser('sub') userId: string) {
    return this.creditService.getCreditBalance(userId);
  }
}
