import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Params } from 'nestjs-pino';

@Injectable()
export class LoggerConfig {
  constructor(private configService: ConfigService) {}

  createPinoConfig(): Params {
    const isProduction = this.configService.get<string>('NODE_ENV') === 'production';

    return {
      pinoHttp: {
        level: isProduction ? 'info' : 'debug',
        redact: {
          paths: [
            'req.headers.authorization',
            'req.body.password',
            'req.body.confirmPassword',
            'req.body.currentPassword',
            'req.body.newPassword',
          ],
          censor: '[REDACTED]',
        },
        customLogLevel: (req, res, err) => {
          if (res.statusCode >= 400) return 'error';
          if (res.statusCode >= 300) return 'warn';
          return 'info';
        },
        customSuccessMessage: (req, res) => {
          return `${req.method} ${req.url} ${res.statusCode}`;
        },
        customErrorMessage: (req, res, err) => {
          return `${req.method} ${req.url} ${res.statusCode} - ${err.message}`;
        },
        serializers: {
          req: (req) => ({
            id: req.id,
            method: req.method,
            url: req.url,
            headers: req.headers,
          }),
          res: (res) => ({
            statusCode: res.statusCode,
          }),
          err: (err) => ({
            type: err.type,
            message: err.message,
            stack: err.stack,
            code: err.code,
          }),
        },
        ...(isProduction && {
          timestamp: () => `,"timestamp":"${new Date().toISOString()}"`,
        }),
        ...(!isProduction && {
          transport: {
            target: 'pino-pretty',
            options: {
              colorize: true,
              singleLine: true,
              translateTime: 'yyyy-mm-dd HH:MM:ss.l',
              ignore: 'pid,hostname',
              messageFormat: '{reqId} {msg}',
            },
          },
        }),
      },
    };
  }
}
