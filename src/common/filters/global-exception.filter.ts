import { Catch, ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import { Prisma } from '../../../generated/prisma/client';
import { ServiceError } from '../exceptions/service-error.exception';
import { AppLogger } from '../../logger/app-logger';

@Catch()
export class GlobalExceptionFilter extends BaseExceptionFilter {
  constructor(private readonly logger: AppLogger) {
    super();
    this.logger.setContext('GlobalExceptionFilter');
  }

  catch(exception: any, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    const request = ctx.getRequest();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | object;
    let error: string;
    let details: any;

    switch (true) {
      case exception instanceof ServiceError:
        status = this.mapServiceErrorToStatus(exception.code);
        message = exception.message;
        error = exception.code;
        details = exception.details;
        break;

      case exception instanceof HttpException:
        status = exception.getStatus();
        const exceptionResponse = exception.getResponse();
        message = typeof exceptionResponse === 'string' ? exceptionResponse : (exceptionResponse as any).message;
        error = exception.name;
        break;

      case exception instanceof Prisma.PrismaClientKnownRequestError:
        status = HttpStatus.BAD_REQUEST;
        message = 'Database operation failed';
        error = 'DATABASE_ERROR';
        details = {
          code: exception.code,
          meta: exception.meta,
        };
        break;

      case exception instanceof Prisma.PrismaClientValidationError:
        status = HttpStatus.BAD_REQUEST;
        message = 'Database validation failed';
        error = 'VALIDATION_ERROR';
        details = exception.message;
        break;

      default:
        message = 'Internal server error';
        error = 'INTERNAL_ERROR';
    }

    const errorResponse = {
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      method: request.method,
      message,
      error,
      ...(details && { details }),
    };

    this.logger.error(
      `${request.method} ${request.url} ${status} - ${JSON.stringify(errorResponse)}`,
      exception?.stack
    );

    response.status(status).json(errorResponse);
  }

  private mapServiceErrorToStatus(code: string): number {
    const notFoundCodes = ['USER_NOT_FOUND', 'PRICE_NOT_FOUND', 'SUBSCRIPTION_NOT_FOUND', 'CREDIT_BALANCE_NOT_FOUND'];
    const validationCodes = ['INSUFFICIENT_CREDITS', 'INVALID_WEBHOOK_SIGNATURE', 'ADDON_REQUIRES_PRO', 'CROSS_TIER_UPGRADE_DENIED'];

    if (notFoundCodes.includes(code)) return HttpStatus.NOT_FOUND;
    if (validationCodes.includes(code)) return HttpStatus.BAD_REQUEST;
    if (code === 'STRIPE_API_ERROR') return HttpStatus.BAD_GATEWAY;

    return HttpStatus.BAD_REQUEST;
  }
}
