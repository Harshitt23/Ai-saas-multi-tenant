import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import type { Prisma } from '@pm/db';
import { PrismaService } from '../../common/prisma/prisma.service';
import { NOTIFICATIONS_QUEUE, type NotificationJob } from './notifications.constants';

/**
 * Worker that drains the notifications queue: writes the in-app row and (TODO)
 * dispatches email via a provider. Idempotency / dedup would key on
 * (recipient, type, entity) within a short window for a production system.
 */
@Processor(NOTIFICATIONS_QUEUE, { concurrency: 10 })
export class NotificationsProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationsProcessor.name);

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async process(job: Job<NotificationJob>): Promise<void> {
    const { organizationId, recipientId, type, payload } = job.data;

    await this.prisma.notification.create({
      data: {
        organizationId,
        userId: recipientId,
        type,
        payload: payload as Prisma.InputJsonValue,
      },
    });

    // TODO: deliver email through a provider (Resend/SES) + respect user prefs.
    this.logger.debug(`Notified ${recipientId} (${type})`);
  }
}
