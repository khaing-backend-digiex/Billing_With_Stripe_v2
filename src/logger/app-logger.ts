import { Injectable, LoggerService } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';

@Injectable()
export class AppLogger implements LoggerService {
  private context?: string;

  constructor(private readonly pinoLogger: PinoLogger) { }

  setContext(context: string) {
    this.context = context;
    this.pinoLogger.setContext(context);
  }

  log(message: any, context?: string) {
    this.pinoLogger.info(message, context || this.context);
  }

  error(message: any, trace?: string, context?: string) {
    this.pinoLogger.error({ trace, context: context || this.context }, message);
  }

  warn(message: any, context?: string) {
    this.pinoLogger.warn(message, context || this.context);
  }

  debug(message: any, context?: string) {
    this.pinoLogger.debug(message, context || this.context);
  }

  verbose(message: any, context?: string) {
    this.pinoLogger.trace(message, context || this.context);
  }
}
