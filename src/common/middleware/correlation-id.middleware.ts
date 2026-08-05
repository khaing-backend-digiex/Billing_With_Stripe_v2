import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import { PinoLogger } from 'nestjs-pino';
import { HEADER_REQUEST_ID } from '@/common/constants/http.constants';

@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  constructor(private readonly logger: PinoLogger) {}

  use(req: Request, res: Response, next: NextFunction) {
    const correlationId = (req.headers[HEADER_REQUEST_ID] as string) || randomUUID();
    req.headers[HEADER_REQUEST_ID] = correlationId;
    Object.assign(req, { reqId: correlationId });

    this.logger.assign({ reqId: correlationId });

    next();
  }
}
