import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { HttpAdapterHost, NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import * as Sentry from '@sentry/node';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { SentryExceptionFilter } from './common/observability/sentry.filter';
import { RedisIoAdapter } from './common/realtime/redis-io.adapter';
import type { Env } from './config/env';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    // Stripe webhook signature verification needs the raw body; capture it.
    rawBody: true,
  });
  const config = app.get(ConfigService<Env, true>);
  const logger = new Logger('Bootstrap');

  // Error tracking — only active when a DSN is configured (no-op in dev).
  const sentryDsn = config.get('SENTRY_DSN', { infer: true });
  if (sentryDsn) {
    Sentry.init({
      dsn: sentryDsn,
      environment: config.get('NODE_ENV', { infer: true }),
      tracesSampleRate: 0.1,
    });
    logger.log('Sentry initialized');
  }
  // Report unhandled 5xx errors and normalize the error response shape.
  app.useGlobalFilters(new SentryExceptionFilter(app.get(HttpAdapterHost)));

  // Cross-instance realtime fan-out via the socket.io Redis adapter.
  const redisAdapter = new RedisIoAdapter(app, config.get('REDIS_URL', { infer: true }));
  await redisAdapter.connect();
  app.useWebSocketAdapter(redisAdapter);

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
