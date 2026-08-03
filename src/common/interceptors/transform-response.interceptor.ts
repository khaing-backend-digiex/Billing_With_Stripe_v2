import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { SKIP_TRANSFORM_KEY } from '../decorators/skip-transform.decorator';

@Injectable()
export class TransformResponseInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
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
        const isPaginated =
          data !== null &&
          typeof data === 'object' &&
          data.__paginated === true;

        const baseMeta = {
          requestId: request.headers['x-request-id'] || (request as any).reqId,
          timestamp: new Date().toISOString(),
          path: request.url,
          method: request.method,
        };

        if (isPaginated) {
          const { page, limit, total, ...rest } = data;
          return {
            statusCode: response.statusCode,
            data: rest.data,
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

        return {
          statusCode: response.statusCode,
          data,
          meta: baseMeta,
        };
      }),
    );
  }
}
