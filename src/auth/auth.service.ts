import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { StripeService } from '../billing/stripe.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import * as bcrypt from 'bcrypt';
import { PredefinedRole } from '../constants/predefined-role';
import { PlanType, SubStatus } from '../../generated/prisma/client';
import { ServiceError } from '../common/exceptions/service-error.exception';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly stripeService: StripeService,
  ) {}

  async register(dto: RegisterDto) {
    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (existingUser) {
      throw new ServiceError('EMAIL_ALREADY_IN_USE', 'Email already in use');
    }

    const existingUsername = await this.prisma.profile.findFirst({
      where: { username: dto.username },
    });

    if (existingUsername) {
      throw new ServiceError('USERNAME_ALREADY_TAKEN', 'Username already taken');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);

    const user = await this.prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          email: dto.email,
          password: passwordHash,
        },
      });

      await tx.profile.create({
        data: {
          userId: newUser.id,
          username: dto.username,
          firstname: dto.firstname,
          lastname: dto.lastname,
          dateOfBirth: new Date(dto.dateOfBirth),
        },
      });

      await tx.userRole.create({
        data: {
          userId: newUser.id,
          roleName: PredefinedRole.USER,
        },
      });

      const stripeCustomer = await this.stripeService.createCustomer(dto.email, {
        userId: newUser.id,
      });

      await tx.user.update({
        where: { id: newUser.id },
        data: { stripeCustomerId: stripeCustomer.id },
      });

      const freePrice = await tx.stripePrice.findFirst({
        where: {
          product: {
            planType: PlanType.FREE,
          },
          currency: 'VND',
        },
      });

      let stripeSubscriptionId = '';
      if (freePrice) {
        const subscription = await this.stripeService.createSubscription({
          customerId: stripeCustomer.id,
          priceId: freePrice.stripePriceId,
          metadata: { userId: newUser.id, planType: PlanType.FREE },
        });
        stripeSubscriptionId = subscription.id;
      }

      await tx.subscription.create({
        data: {
          userId: newUser.id,
          stripeSubscriptionId,
          plan: PlanType.FREE,
          status: SubStatus.ACTIVE,
        },
      });

      await tx.creditBalance.create({
        data: {
          userId: newUser.id,
          planCredits: 50,
          addonCreditsAvailable: 0,
          addonCreditsFrozen: 0,
          lastResetAt: new Date(),
        },
      });

      return newUser;
    });

    return {
      id: user.id,
      email: user.email,
    };
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      include: {
        userRoles: {
          include: {
            role: true,
          },
        },
      },
    });

    if (!user) {
      throw new ServiceError('INVALID_CREDENTIALS', 'Invalid credentials');
    }

    const isPasswordValid = await bcrypt.compare(dto.password, user.password);

    if (!isPasswordValid) {
      throw new ServiceError('INVALID_CREDENTIALS', 'Invalid credentials');
    }

    const roles = user.userRoles.map((ur) => ur.role.name);

    const payload = {
      sub: user.id,
      email: user.email,
      roles,
    };

    const accessToken = this.jwtService.sign(payload);

    return {
      id: user.id,
      email: user.email,
      roles,
      accessToken,
    };
  }
}
