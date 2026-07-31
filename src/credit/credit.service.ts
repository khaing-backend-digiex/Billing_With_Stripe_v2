import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '../../generated/prisma/client';

@Injectable()
export class CreditService {
  private readonly logger = new Logger(CreditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async consumeCredits(userId: string, amount: number) {
    return this.prisma.$transaction(async (tx) => {
      const balance = await tx.creditBalance.findUnique({
        where: { userId },
      });

      if (!balance) {
        throw new NotFoundException('Credit balance not found');
      }

      let remaining = amount;
      const updates: any = {};

      if (balance.planCredits > 0) {
        const planDeduction = Math.min(balance.planCredits, remaining);
        updates.planCredits = balance.planCredits - planDeduction;
        remaining -= planDeduction;
      }

      if (remaining > 0 && balance.addonCreditsAvailable > 0) {
        const addonDeduction = Math.min(balance.addonCreditsAvailable, remaining);
        updates.addonCreditsAvailable = balance.addonCreditsAvailable - addonDeduction;
        remaining -= addonDeduction;
      }

      if (remaining > 0) {
        throw new BadRequestException('Insufficient credits');
      }

      await tx.creditBalance.update({
        where: { userId },
        data: updates,
      });

      return this.getCreditBalance(userId);
    });
  }

  async getCreditBalance(userId: string) {
    const balance = await this.prisma.creditBalance.findUnique({
      where: { userId },
    });

    if (!balance) {
      throw new NotFoundException('Credit balance not found');
    }

    return balance;
  }

  async resetPlanCredits(userId: string, amount: number, tx?: Prisma.TransactionClient) {
    const client = tx || this.prisma;
    
    await client.creditBalance.update({
      where: { userId },
      data: {
        planCredits: amount,
        lastResetAt: new Date(),
      },
    });
  }

  async addAddonCredits(userId: string, amount: number, tx?: Prisma.TransactionClient) {
    const client = tx || this.prisma;
    
    await client.creditBalance.update({
      where: { userId },
      data: {
        addonCreditsAvailable: { increment: amount },
      },
    });
  }

  async freezeAddonCredits(userId: string, tx?: Prisma.TransactionClient) {
    const client = tx || this.prisma;
    
    const balance = await client.creditBalance.findUnique({
      where: { userId },
    });

    if (!balance) {
      throw new NotFoundException('Credit balance not found');
    }

    await client.creditBalance.update({
      where: { userId },
      data: {
        addonCreditsFrozen: balance.addonCreditsAvailable,
        addonCreditsAvailable: 0,
      },
    });
  }

  async unfreezeAddonCredits(userId: string, tx?: Prisma.TransactionClient) {
    const client = tx || this.prisma;
    
    const balance = await client.creditBalance.findUnique({
      where: { userId },
    });

    if (!balance) {
      throw new NotFoundException('Credit balance not found');
    }

    await client.creditBalance.update({
      where: { userId },
      data: {
        addonCreditsAvailable: { increment: balance.addonCreditsFrozen },
        addonCreditsFrozen: 0,
      },
    });
  }
}
