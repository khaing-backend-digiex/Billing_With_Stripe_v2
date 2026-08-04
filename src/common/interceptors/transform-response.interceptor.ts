import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { SKIP_TRANSFORM_KEY } from '@/common/decorators/skip-transform.decorator';

@Injectable()
export class TransformResponseInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const skipTransform = this.reflector.getAllAndOverride<boolean>(
      SKIP_TRANSFORM_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (skipTransform) {
      return next.handle();
    }

    const ctx = context.switchToHttp();
    const request = ctx.getRequest();
    const response = ctx.getResponse();

    return next.handle().pipe(
      map((data) => {
        const baseMeta = this.buildBaseMeta(request);

        if (this.isPaginated(data)) {
          return this.formatPaginatedResponse(data, response.statusCode, baseMeta);
        }

        return {
          statusCode: response.statusCode,
          data,
          meta: baseMeta,
        };
      }),
    );
  }

  private isPaginated(data: unknown): data is { data: unknown[]; total: number; page: number; limit: number } {
    return (
      typeof data === 'object' &&
      data !== null &&
      'data' in data &&
      Array.isArray((data as Record<string, unknown>).data) &&
      'total' in data &&
      typeof (data as Record<string, unknown>).total === 'number' &&
      'page' in data &&
      typeof (data as Record<string, unknown>).page === 'number' &&
      'limit' in data &&
      typeof (data as Record<string, unknown>).limit === 'number'
    );
  }

  private buildBaseMeta(request: Record<string, unknown> | any) {
    return {
      requestId: request.headers['x-request-id'] || request.reqId,
      timestamp: new Date().toISOString(),
      path: request.url,
      method: request.method,
    };
  }

  private formatPaginatedResponse(
    data: { data: unknown[]; total: number; page: number; limit: number },
    statusCode: number,
    baseMeta: Record<string, unknown>
  ) {
    const { page, limit, total, data: items } = data;
    return {
      statusCode,
      data: items,
      meta: {
        ...baseMeta,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
          hasNext: page * limit < total,
          hasPrev: page > 1,
        },
      },
    };
  }
}
