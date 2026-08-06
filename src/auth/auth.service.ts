import { Injectable } from '@nestjs/common';
import { AppLogger } from '@/logger/app-logger';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '@/prisma/prisma.service';
import { PaymentService } from '@/billing/payment.service';
import { RegisterDto } from '@/auth/dto/register.dto';
import { LoginDto } from '@/auth/dto/login.dto';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { PredefinedRole } from '@/common/constants/predefined-role';
import { PLAN_CREDIT_LIMITS } from '@/common/constants/plan.constants';
import { ErrorCode } from '@/common/enums/error-code.enum';
import { ServiceError } from '@/common/exceptions/service-error.exception';
import { PlanType, SubStatus } from '../../generated/prisma/client';
import { CURRENCY_VND } from '@/common/constants/currency.constants';
import { REFRESH_TOKEN_BYTES, HASH_ALGORITHM } from '@/common/constants/auth.constants';

const BCRYPT_SALT_ROUNDS = 10;
const REFRESH_TOKEN_EXPIRY_DAYS = 7;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly paymentService: PaymentService,
    private readonly logger: AppLogger,
  ) {
    this.logger.setContext('AuthService');
  }

  async register(dto: RegisterDto) {
    await this.validateUniqueUser(dto.email, dto.username);

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_SALT_ROUNDS);
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
    const customer = await this.paymentService.createCustomer(email);

    const freePrice = await this.prisma.stripePrice.findFirst({
      where: {
        product: { planType: PlanType.FREE },
        currency: CURRENCY_VND,
      },
    });

    if (!freePrice) {
      return { customerId: customer.id, subscriptionId: '' };
    }

    const subscription = await this.paymentService.createSubscription({
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

      if (stripeSubscriptionId) {
        await tx.subscription.create({
          data: {
            userId: user.id,
            stripeSubscriptionId,
            plan: PlanType.FREE,
            status: SubStatus.ACTIVE,
          },
        });
      }

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
      await this.paymentService.cancelSubscription(subscriptionId);
    } catch (cleanupError) {
      this.logger.error(
        `Failed to cleanup Stripe subscription ${subscriptionId} — orphaned resource may exist`,
        cleanupError instanceof Error ? cleanupError.stack : undefined,
      );
    }
  }

  private async getUserPermissions(userId: string): Promise<string[]> {
    const userRoles = await this.prisma.userRole.findMany({
      where: { userId },
      include: {
        role: {
          include: {
            rolePermissions: {
              include: { permission: true },
            },
          },
        },
      },
    });

    const userPermissions = new Set<string>();
    for (const userRole of userRoles) {
      for (const rolePermission of userRole.role.rolePermissions) {
        userPermissions.add(rolePermission.permission.name);
      }
    }

    return Array.from(userPermissions);
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      include: { userRoles: { include: { role: true } } },
    });
    if (!user) throw new ServiceError(ErrorCode.INVALID_CREDENTIALS, 'Invalid credentials');

    const isPasswordValid = await bcrypt.compare(dto.password, user.password);
    if (!isPasswordValid) throw new ServiceError(ErrorCode.INVALID_CREDENTIALS, 'Invalid credentials');

    const roles = user.userRoles.map((userRole) => userRole.role.name);
    const permissions = await this.getUserPermissions(user.id);
    
    const accessToken = this.jwtService.sign({ sub: user.id, email: user.email, roles, permissions });
    
    const refreshToken = crypto.randomBytes(REFRESH_TOKEN_BYTES).toString('hex');
    await this.storeRefreshToken(user.id, refreshToken, REFRESH_TOKEN_EXPIRY_DAYS);

    return { id: user.id, email: user.email, roles, accessToken, refreshToken };
  }

  private hashToken(token: string): string {
    return crypto.createHash(HASH_ALGORITHM).update(token).digest('hex');
  }

  private async storeRefreshToken(userId: string, token: string, expiresInDays: number) {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + expiresInDays);
    const hashedToken = this.hashToken(token);

    await this.prisma.refreshToken.create({
      data: {
        token: hashedToken,
        userId,
        expiresAt,
      },
    });
  }

  async revokeRefreshToken(token: string) {
    const hashedToken = this.hashToken(token);
    await this.prisma.refreshToken.deleteMany({
      where: { token: hashedToken },
    });
  }

  async refreshAccessToken(oldToken: string) {
    const hashedToken = this.hashToken(oldToken);
    const refreshTokenRecord = await this.prisma.refreshToken.findUnique({
      where: { token: hashedToken },
      include: { user: { include: { userRoles: { include: { role: true } } } } },
    });

    if (!refreshTokenRecord) {
      throw new ServiceError(ErrorCode.INVALID_CREDENTIALS, 'Invalid refresh token');
    }

    if (refreshTokenRecord.expiresAt < new Date()) {
      await this.revokeRefreshToken(oldToken);
      throw new ServiceError(ErrorCode.INVALID_CREDENTIALS, 'Refresh token expired');
    }

    const user = refreshTokenRecord.user;
    const roles = user.userRoles.map((ur) => ur.role.name);
    const permissions = await this.getUserPermissions(user.id);

    const accessToken = this.jwtService.sign({ sub: user.id, email: user.email, roles, permissions });

    const newRefreshToken = crypto.randomBytes(REFRESH_TOKEN_BYTES).toString('hex');
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_EXPIRY_DAYS);

    await this.prisma.$transaction([
      this.prisma.refreshToken.delete({ where: { id: refreshTokenRecord.id } }),
      this.prisma.refreshToken.create({
        data: {
          token: newRefreshToken,
          userId: user.id,
          expiresAt,
        },
      }),
    ]);

    return { accessToken, refreshToken: newRefreshToken };
  }
}
