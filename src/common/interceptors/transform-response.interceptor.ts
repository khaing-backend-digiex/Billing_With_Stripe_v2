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
        const baseMeta = this.buildBaseMeta(request);

        if (data?.__paginated) {
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

  private buildBaseMeta(request: any) {
    return {
      requestId: request.headers['x-request-id'] || request.reqId,
      timestamp: new Date().toISOString(),
      path: request.url,
      method: request.method,
    };
  }

  private formatPaginatedResponse(data: any, statusCode: number, baseMeta: any) {
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
