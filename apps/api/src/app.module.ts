import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { BullModule } from '@nestjs/bullmq';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { validateEnv, type Env } from './config/env';
import { PrismaModule } from './common/prisma/prisma.module';
import { AuditModule } from './common/audit/audit.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { AuthModule } from './modules/auth/auth.module';
import { OrgsModule } from './modules/orgs/orgs.module';
import { ProjectsModule } from './modules/projects/projects.module';
import { IssuesModule } from './modules/issues/issues.module';
import { RealtimeModule } from './modules/realtime/realtime.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { BillingModule } from './modules/billing/billing.module';
import { HealthModule } from './modules/health/health.module';

function parseRedis(url: string) {
  const u = new URL(url);
  return {
    host: u.hostname,
    port: Number(u.port || 6379),
    ...(u.password ? { password: u.password } : {}),
    ...(u.username ? { username: u.username } : {}),
  };
}

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      // Repo-root .env (turbo runs tasks from each package dir).
      envFilePath: ['.env', '../../.env'],
      validate: validateEnv,
    }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        connection: parseRedis(config.get('REDIS_URL', { infer: true })),
      }),
    }),
    PrismaModule,
    AuditModule,
    AuthModule,
    OrgsModule,
    ProjectsModule,
    IssuesModule,
    RealtimeModule,
    NotificationsModule,
    BillingModule,
    HealthModule,
  ],
  providers: [
    // Secure by default: every route requires a valid JWT unless @Public.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    // Global rate limiting.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
