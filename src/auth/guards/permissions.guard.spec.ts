import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionsGuard } from '@/auth/guards/permissions.guard';

describe('PermissionsGuard', () => {
  let guard: PermissionsGuard;
  let reflector: Reflector;

  const mockReflector = {
    getAllAndOverride: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PermissionsGuard,
        {
          provide: Reflector,
          useValue: mockReflector,
        },
      ],
    }).compile();

    guard = module.get<PermissionsGuard>(PermissionsGuard);
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
    it('should return true if no permissions required', () => {
      mockReflector.getAllAndOverride.mockReturnValue(null);
      const context = createMockContext({ sub: 'user-id', permissions: [] });

      const result = guard.canActivate(context);

      expect(result).toBe(true);
    });

    it('should throw UnauthorizedException if user not authenticated', () => {
      mockReflector.getAllAndOverride.mockReturnValue(['GETUSER']);
      const context = createMockContext(null);

      expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
    });

    it('should throw ForbiddenException if user has no permissions in token', () => {
      mockReflector.getAllAndOverride.mockReturnValue(['GETUSER']);
      const context = createMockContext({ sub: 'user-id', permissions: [] });

      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    });

    it('should return true if user has required permissions', () => {
      mockReflector.getAllAndOverride.mockReturnValue(['GETUSER']);
      const context = createMockContext({ sub: 'user-id', permissions: ['GETUSER'] });

      const result = guard.canActivate(context);

      expect(result).toBe(true);
    });

    it('should throw ForbiddenException if user lacks required permissions', () => {
      mockReflector.getAllAndOverride.mockReturnValue(['CREATEUSER']);
      const context = createMockContext({ sub: 'user-id', permissions: ['GETUSER'] });

      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    });
  });
});
