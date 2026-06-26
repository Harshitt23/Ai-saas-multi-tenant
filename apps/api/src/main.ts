import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
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

  // `rawBody: true` (above) makes Nest's body parsers expose `req.rawBody` on
  // every route, which the Stripe webhook uses for signature verification —
  // no extra body-parser middleware needed (a manual one shadows the global
  // JSON parser and leaves req.body empty on other routes).

  app.enableCors({
    origin: config.get('WEB_ORIGIN', { infer: true }),
    credentials: true,
  });

  // Validation is handled per-route via ZodValidationPipe (see common/pipes),
  // so no global class-validator ValidationPipe is registered.
  app.enableShutdownHooks();

  const port = config.get('API_PORT', { infer: true });
  await app.listen(port);
  logger.log(`API listening on http://localhost:${port}/api`);
}

void bootstrap();
