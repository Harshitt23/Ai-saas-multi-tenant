import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { json } from 'express';
import { AppModule } from './app.module';
import type { Env } from './config/env';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    // Stripe webhook signature verification needs the raw body; capture it.
    rawBody: true,
  });
  const config = app.get(ConfigService<Env, true>);
  const logger = new Logger('Bootstrap');

  app.setGlobalPrefix('api', { exclude: ['health'] });
  app.use(helmet());
  app.use(cookieParser());

  // Keep the raw body available on the Stripe webhook route only.
  app.use(
    '/api/billing/webhook',
    json({
      verify: (req, _res, buf) => {
        (req as unknown as { rawBody?: Buffer }).rawBody = buf;
      },
    }),
  );

  app.enableCors({
    origin: config.get('WEB_ORIGIN', { infer: true }),
    credentials: true,
  });

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.enableShutdownHooks();

  const port = config.get('API_PORT', { infer: true });
  await app.listen(port);
  logger.log(`API listening on http://localhost:${port}/api`);
}

void bootstrap();
