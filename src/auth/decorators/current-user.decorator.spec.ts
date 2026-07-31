import { ExecutionContext } from '@nestjs/common';
import { extractUser } from './current-user.decorator';

describe('CurrentUser Decorator', () => {
  const mockUser = {
    sub: 'user-123',
    email: 'test@example.com',
    roles: ['USER'],
  };

  const createMockContext = (user?: any): ExecutionContext => {
    return {
      switchToHttp: () => ({
        getRequest: () => ({ user }),
      }),
    } as ExecutionContext;
  };

  it('should return full user object when no property specified', () => {
    const ctx = createMockContext(mockUser);
    const result = extractUser(undefined, ctx);
    expect(result).toEqual(mockUser);
  });

  it('should extract sub property', () => {
    const ctx = createMockContext(mockUser);
    const result = extractUser('sub', ctx);
    expect(result).toBe('user-123');
  });

  it('should extract email property', () => {
    const ctx = createMockContext(mockUser);
    const result = extractUser('email', ctx);
    expect(result).toBe('test@example.com');
  });

  it('should extract roles property', () => {
    const ctx = createMockContext(mockUser);
    const result = extractUser('roles', ctx);
    expect(result).toEqual(['USER']);
  });

  it('should return undefined for non-existent property', () => {
    const ctx = createMockContext(mockUser);
    const result = extractUser('nonexistent' as any, ctx);
    expect(result).toBeUndefined();
  });
});
