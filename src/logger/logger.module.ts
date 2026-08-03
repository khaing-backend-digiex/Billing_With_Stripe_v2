import { Module, Global } from '@nestjs/common';
import { LoggerModule as PinoLoggerModule } from 'nestjs-pino';
import { LoggerConfig } from './logger-config';
import { AppLogger } from './app-logger';

@Global()
@Module({
  imports: [
    PinoLoggerModule.forRootAsync({
      providers: [LoggerConfig],
      inject: [LoggerConfig],
      useFactory: (loggerConfig: LoggerConfig) => {
        return loggerConfig.createPinoConfig();
      },
    }),
  ],
  providers: [AppLogger, LoggerConfig],
  exports: [AppLogger],
})
export class LoggerModule {}
