import { Controller, Post, Get, Body, UseGuards } from '@nestjs/common';
import { CreditService } from './credit.service';
import { ConsumeCreditsDto } from './dto/consume-credits.dto';
import { AuthGuard } from '../auth/guards/auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Permission } from '../auth/enums/permission.enum';

@Controller('credits')
@UseGuards(AuthGuard)
export class CreditController {
  constructor(private readonly creditService: CreditService) {}

  @Post('consume')
  @UseGuards(PermissionsGuard)
  @RequirePermissions(Permission.CREDIT_ACCESS)
  async consumeCredits(
    @CurrentUser('sub') userId: string,
    @Body() dto: ConsumeCreditsDto,
  ) {
    return this.creditService.consumeCredits(userId, dto.amount);
  }

  @Get('balance')
  @UseGuards(PermissionsGuard)
  @RequirePermissions(Permission.CREDIT_ACCESS)
  async getCreditBalance(@CurrentUser('sub') userId: string) {
    return this.creditService.getCreditBalance(userId);
  }
}
