import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionsGuard } from './permissions.guard';
import { PrismaService } from '../../prisma/prisma.service';

describe('PermissionsGuard', () => {
  let guard: PermissionsGuard;
  let prisma: PrismaService;
  let reflector: Reflector;

  const mockPrisma = {
    userRole: {
      findMany: jest.fn(),
    },
  };

  const mockReflector = {
    getAllAndOverride: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PermissionsGuard,
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
        {
          provide: Reflector,
          useValue: mockReflector,
        },
      ],
    }).compile();

    guard = module.get<PermissionsGuard>(PermissionsGuard);
    prisma = module.get<PrismaService>(PrismaService);
    reflector = module.get<Reflector>(Reflector);
    jest.clearAllMocks();
  });

  const createMockContext = (user: any) => {
    return {
      switchToHttp: () => ({
        getRequest: () => ({
          user,
        }),
      }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as any;
  };

  describe('canActivate', () => {
    it('should return true if no permissions required', async () => {
      mockReflector.getAllAndOverride.mockReturnValue(null);
      const context = createMockContext({ sub: 'user-id' });

      const result = await guard.canActivate(context);

      expect(result).toBe(true);
    });

    it('should throw UnauthorizedException if user not authenticated', async () => {
      mockReflector.getAllAndOverride.mockReturnValue(['GETUSER']);
      const context = createMockContext(null);

      await expect(guard.canActivate(context)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw ForbiddenException if user has no roles', async () => {
      mockReflector.getAllAndOverride.mockReturnValue(['GETUSER']);
      mockPrisma.userRole.findMany.mockResolvedValue([]);
      const context = createMockContext({ sub: 'user-id' });

      await expect(guard.canActivate(context)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should return true if user has required permissions', async () => {
      mockReflector.getAllAndOverride.mockReturnValue(['GETUSER']);
      mockPrisma.userRole.findMany.mockResolvedValue([
        {
          role: {
            rolePermissions: [
              {
                permission: {
                  name: 'GETUSER',
                },
              },
            ],
          },
        },
      ]);
      const context = createMockContext({ sub: 'user-id' });

      const result = await guard.canActivate(context);

      expect(result).toBe(true);
    });

    it('should throw ForbiddenException if user lacks required permissions', async () => {
      mockReflector.getAllAndOverride.mockReturnValue(['CREATEUSER']);
      mockPrisma.userRole.findMany.mockResolvedValue([
        {
          role: {
            rolePermissions: [
              {
                permission: {
                  name: 'GETUSER',
                },
              },
            ],
          },
        },
      ]);
      const context = createMockContext({ sub: 'user-id' });

      await expect(guard.canActivate(context)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });
});
