import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { AppModule } from '@/app.module';
import { AppLogger } from '@/logger/app-logger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { API_PREFIX, WEBHOOK_PATH, SWAGGER_TITLE, SWAGGER_DESCRIPTION, SWAGGER_VERSION, SWAGGER_PATH, DEFAULT_PORT } from '@/common/constants/http.constants';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    rawBody: true,
    bufferLogs: true,
  });

  app.useLogger(app.get(AppLogger));
  app.use(helmet());
  app.use(cookieParser());

  app.setGlobalPrefix(API_PREFIX, {
    exclude: ['webhooks/stripe'],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const config = new DocumentBuilder()
    .setTitle(SWAGGER_TITLE)
    .setDescription(SWAGGER_DESCRIPTION)
    .setVersion(SWAGGER_VERSION)
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup(SWAGGER_PATH, app, document);

  const configService = app.get(ConfigService);
  const port = configService.get<number>('PORT', DEFAULT_PORT);
  await app.listen(port);
}
bootstrap();
