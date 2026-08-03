import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { StripeService } from '../billing/stripe.service';
import * as bcrypt from 'bcrypt';

describe('AuthService', () => {
  let service: AuthService;
  let prisma: PrismaService;
  let jwtService: JwtService;
  let stripeService: StripeService;

  const mockPrisma = {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    profile: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
    },
    userRole: {
      create: jest.fn(),
      findMany: jest.fn(),
    },
    stripePrice: {
      findFirst: jest.fn(),
    },
    subscription: {
      create: jest.fn(),
    },
    creditBalance: {
      create: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const mockJwtService = {
    sign: jest.fn(),
    verifyAsync: jest.fn(),
  };

  const mockStripeService = {
    createCustomer: jest.fn(),
    createSubscription: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
        {
          provide: JwtService,
          useValue: mockJwtService,
        },
        {
          provide: StripeService,
          useValue: mockStripeService,
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    prisma = module.get<PrismaService>(PrismaService);
    stripeService = module.get<StripeService>(StripeService);
    jest.clearAllMocks();
  });

  describe('register', () => {
    const registerDto = {
      email: 'test@example.com',
      password: 'password123',
      username: 'testuser',
      firstname: 'Test',
      lastname: 'User',
      dateOfBirth: '1990-01-01',
    };

    it('should successfully register a new user with Stripe customer and Free subscription', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.profile.findUnique.mockResolvedValue(null);
      mockPrisma.$transaction.mockImplementation(async (callback) => {
        return callback(mockPrisma);
      });
      mockPrisma.user.create.mockResolvedValue({
        id: 'user-id',
        email: registerDto.email,
        password: 'hashed-password',
      });
      mockStripeService.createCustomer.mockResolvedValue({
        id: 'cus_123',
      });
      mockPrisma.stripePrice.findFirst.mockResolvedValue({
        stripePriceId: 'price_free_vnd',
      });
      mockStripeService.createSubscription.mockResolvedValue({
        id: 'sub_123',
      });

      const result = await service.register(registerDto);

      expect(result).toEqual({
        id: 'user-id',
        email: registerDto.email,
      });
      expect(mockPrisma.user.create).toHaveBeenCalled();
      expect(mockPrisma.profile.create).toHaveBeenCalled();
      expect(mockPrisma.userRole.create).toHaveBeenCalled();
      expect(mockStripeService.createCustomer).toHaveBeenCalledWith(registerDto.email, {
        userId: 'user-id',
      });
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-id' },
        data: { stripeCustomerId: 'cus_123' },
      });
      expect(mockPrisma.subscription.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-id',
          stripeSubscriptionId: 'sub_123',
          plan: 'FREE',
          status: 'ACTIVE',
        },
      });
      expect(mockPrisma.creditBalance.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-id',
          planCredits: 50,
          addonCreditsAvailable: 0,
          addonCreditsFrozen: 0,
          lastResetAt: expect.any(Date),
        },
      });
    });

    it('should throw ConflictException if email already exists', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'existing-id',
        email: registerDto.email,
      });

      await expect(service.register(registerDto)).rejects.toThrow(
        ConflictException,
      );
    });

    it('should throw ConflictException if username already exists', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.profile.findFirst.mockResolvedValue({
        id: 'existing-id',
        username: registerDto.username,
      });

      await expect(service.register(registerDto)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('login', () => {
    const loginDto = {
      email: 'test@example.com',
      password: 'password123',
    };

    it('should successfully login and return JWT token', async () => {
      const mockUser = {
        id: 'user-id',
        email: loginDto.email,
        password: await bcrypt.hash(loginDto.password, 10),
        userRoles: [
          {
            role: {
              name: 'USER',
            },
          },
        ],
      };

      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockJwtService.sign.mockReturnValue('mock-jwt-token');

      const result = await service.login(loginDto);

      expect(result).toEqual({
        id: 'user-id',
        email: loginDto.email,
        roles: ['USER'],
        accessToken: 'mock-jwt-token',
      });
      expect(mockJwtService.sign).toHaveBeenCalledWith({
        sub: 'user-id',
        email: loginDto.email,
        roles: ['USER'],
      });
    });

    it('should throw UnauthorizedException if user not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(service.login(loginDto)).rejects.toThrow(
        'Invalid credentials',
      );
    });

    it('should throw UnauthorizedException if password is invalid', async () => {
      const mockUser = {
        id: 'user-id',
        email: loginDto.email,
        password: await bcrypt.hash('different-password', 10),
        userRoles: [],
      };

      mockPrisma.user.findUnique.mockResolvedValue(mockUser);

      await expect(service.login(loginDto)).rejects.toThrow(
        'Invalid credentials',
      );
    });
  });
});
