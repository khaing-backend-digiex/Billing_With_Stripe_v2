import { Injectable } from '@nestjs/common';
import { AppLogger } from '../logger/app-logger';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { StripeService } from '../billing/stripe.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import * as bcrypt from 'bcrypt';
import { PredefinedRole } from '../constants/predefined-role';
import { PLAN_CREDIT_LIMITS } from '../constants/plan.constants';
import { PlanType, SubStatus } from '../../generated/prisma/client';
import { ErrorCode } from '../common/enums/error-code.enum';
import { ServiceError } from '../common/exceptions/service-error.exception';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly stripeService: StripeService,
    private readonly logger: AppLogger,
  ) {
    this.logger.setContext('AuthService');
  }

  async register(dto: RegisterDto) {
    await this.validateUniqueUser(dto.email, dto.username);

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const { customerId, subscriptionId } = await this.provisionStripeResources(dto.email);

    try {
      const user = await this.createUserRecord(dto, passwordHash, customerId, subscriptionId);
      return { id: user.id, email: user.email };
    } catch (error) {
      await this.cleanupStripeResources(subscriptionId);
      throw error;
    }
  }

  private async validateUniqueUser(email: string, username: string) {
    const existingUser = await this.prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      throw new ServiceError(ErrorCode.EMAIL_ALREADY_IN_USE, 'Email already in use');
    }

    const existingUsername = await this.prisma.profile.findFirst({ where: { username } });
    if (existingUsername) {
      throw new ServiceError(ErrorCode.USERNAME_ALREADY_TAKEN, 'Username already taken');
    }
  }

  private async provisionStripeResources(email: string) {
    const customer = await this.stripeService.createCustomer(email);

    const freePrice = await this.prisma.stripePrice.findFirst({
      where: {
        product: { planType: PlanType.FREE },
        currency: 'VND',
      },
    });

    if (!freePrice) {
      return { customerId: customer.id, subscriptionId: '' };
    }

    const subscription = await this.stripeService.createSubscription({
      customerId: customer.id,
      priceId: freePrice.stripePriceId,
      metadata: { planType: PlanType.FREE },
    });

    return { customerId: customer.id, subscriptionId: subscription.id };
  }

  private async createUserRecord(
    dto: RegisterDto,
    passwordHash: string,
    stripeCustomerId: string,
    stripeSubscriptionId: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: dto.email,
          password: passwordHash,
          stripeCustomerId,
        },
      });

      await tx.profile.create({
        data: {
          userId: user.id,
          username: dto.username,
          firstname: dto.firstname,
          lastname: dto.lastname,
          dateOfBirth: new Date(dto.dateOfBirth),
        },
      });

      await tx.userRole.create({
        data: { userId: user.id, roleName: PredefinedRole.USER },
      });

      await tx.subscription.create({
        data: {
          userId: user.id,
          stripeSubscriptionId,
          plan: PlanType.FREE,
          status: SubStatus.ACTIVE,
        },
      });

      await tx.creditBalance.create({
        data: {
          userId: user.id,
          planCredits: PLAN_CREDIT_LIMITS[PlanType.FREE],
          addonCreditsAvailable: 0,
          addonCreditsFrozen: 0,
          lastResetAt: new Date(),
        },
      });

      return user;
    });
  }

  private async cleanupStripeResources(subscriptionId: string) {
    if (!subscriptionId) return;
    try {
      await this.stripeService.cancelSubscription(subscriptionId);
    } catch (cleanupError) {
      this.logger.error(
        `Failed to cleanup Stripe subscription ${subscriptionId} — orphaned resource may exist`,
        cleanupError instanceof Error ? cleanupError.stack : undefined,
      );
    }
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      include: { userRoles: { include: { role: true } } },
    });
    if (!user) throw new ServiceError(ErrorCode.INVALID_CREDENTIALS, 'Invalid credentials');

    const isPasswordValid = await bcrypt.compare(dto.password, user.password);
    if (!isPasswordValid) throw new ServiceError(ErrorCode.INVALID_CREDENTIALS, 'Invalid credentials');

    const roles = user.userRoles.map((ur) => ur.role.name);
    const accessToken = this.jwtService.sign({ sub: user.id, email: user.email, roles });

    return { id: user.id, email: user.email, roles, accessToken };
  }
}
