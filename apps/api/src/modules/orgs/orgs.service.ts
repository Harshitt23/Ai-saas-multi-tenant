import { createHash, randomBytes } from 'node:crypto';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { CreateOrgInput, Role } from '@pm/types';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { MailService } from '../../common/mail/mail.service';
import type { Env } from '../../config/env';

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

@Injectable()
export class OrgsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly mail: MailService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  async create(userId: string, input: CreateOrgInput) {
    const clash = await this.prisma.organization.findUnique({ where: { slug: input.slug } });
    if (clash) throw new BadRequestException('Slug already taken');

    const org = await this.prisma.organization.create({
      data: {
        name: input.name,
        slug: input.slug,
        memberships: { create: { userId, role: 'OWNER' } },
        subscription: { create: { plan: 'FREE', status: 'ACTIVE', seats: 1 } },
      },
    });

    await this.audit.record({
      organizationId: org.id,
      actorId: userId,
      action: 'org.created',
      entityType: 'Organization',
      entityId: org.id,
    });

    return org;
  }

  listForUser(userId: string) {
    return this.prisma.organization.findMany({
      where: { memberships: { some: { userId } } },
      select: {
        id: true,
        slug: true,
        name: true,
        memberships: { where: { userId }, select: { role: true } },
        _count: { select: { projects: true, memberships: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async getBySlug(organizationId: string) {
    return this.prisma.organization.findUniqueOrThrow({
      where: { id: organizationId },
      include: {
        subscription: true,
        _count: { select: { projects: true, memberships: true } },
      },
    });
  }

  listMembers(organizationId: string) {
    return this.prisma.membership.findMany({
      where: { organizationId },
      select: {
        id: true,
        role: true,
        createdAt: true,
        user: { select: { id: true, name: true, email: true, avatarUrl: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * Invite a member by email. If the user already exists they're added to the
   * org immediately; otherwise we persist a tokened Invite row (storing only a
   * hash of the token) and email a one-time accept link. The raw token lives
   * only in the email — same single-use-secret pattern as refresh tokens.
   */
  async addMember(
    organizationId: string,
    actorId: string,
    email: string,
    role: Exclude<Role, 'OWNER'>,
  ) {
    const normalizedEmail = email.toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email: normalizedEmail } });

    if (user) {
      const membership = await this.prisma.membership.upsert({
        where: { userId_organizationId: { userId: user.id, organizationId } },
        update: { role },
        create: { userId: user.id, organizationId, role },
        select: { id: true, role: true, user: { select: { id: true, email: true, name: true } } },
      });

      await this.audit.record({
        organizationId,
        actorId,
        action: 'member.added',
        entityType: 'Membership',
        entityId: membership.id,
        metadata: { email: normalizedEmail, role },
      });

      return { status: 'added' as const, membership };
    }

    // Unknown email -> create/refresh an invite and email a signed link.
    const token = randomBytes(32).toString('base64url');
    const invite = await this.prisma.invite.upsert({
      where: { organizationId_email: { organizationId, email: normalizedEmail } },
      update: {
        role,
        tokenHash: this.hashToken(token),
        invitedById: actorId,
        expiresAt: new Date(Date.now() + INVITE_TTL_MS),
        acceptedAt: null,
      },
      create: {
        organizationId,
        email: normalizedEmail,
        role,
        tokenHash: this.hashToken(token),
        invitedById: actorId,
        expiresAt: new Date(Date.now() + INVITE_TTL_MS),
      },
      select: { id: true, email: true, role: true, expiresAt: true },
    });

    const org = await this.prisma.organization.findUniqueOrThrow({
      where: { id: organizationId },
      select: { name: true },
    });
    const link = `${this.config.get('WEB_ORIGIN', { infer: true })}/invites/accept?token=${token}`;
    await this.mail.send({
      to: normalizedEmail,
      subject: `You've been invited to ${org.name}`,
      text: `You've been invited to join ${org.name} on PM SaaS as ${role}.\n\nAccept your invite:\n${link}\n\nThis link expires in 7 days.`,
    });

    await this.audit.record({
      organizationId,
      actorId,
      action: 'member.invited',
      entityType: 'Invite',
      entityId: invite.id,
      metadata: { email: normalizedEmail, role },
    });

    return { status: 'invited' as const, invite };
  }

  listInvites(organizationId: string) {
    return this.prisma.invite.findMany({
      where: { organizationId, acceptedAt: null },
      select: { id: true, email: true, role: true, expiresAt: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Accept an invite. The authenticated user's email must match the invite, so
   * a leaked token can't be redeemed by a different account. Creates the
   * membership and burns the invite atomically.
   */
  async acceptInvite(userId: string, userEmail: string, token: string) {
    const invite = await this.prisma.invite.findUnique({
      where: { tokenHash: this.hashToken(token) },
      select: {
        id: true,
        organizationId: true,
        email: true,
        role: true,
        expiresAt: true,
        acceptedAt: true,
      },
    });

    if (!invite || invite.acceptedAt || invite.expiresAt < new Date()) {
      throw new BadRequestException('Invite is invalid or has expired');
    }
    if (invite.email.toLowerCase() !== userEmail.toLowerCase()) {
      throw new ForbiddenException('This invite was issued to a different email');
    }

    const membership = await this.prisma.$transaction(async (tx) => {
      const m = await tx.membership.upsert({
        where: { userId_organizationId: { userId, organizationId: invite.organizationId } },
        update: { role: invite.role },
        create: { userId, organizationId: invite.organizationId, role: invite.role },
        select: { id: true, role: true, organizationId: true },
      });
      await tx.invite.update({
        where: { id: invite.id },
        data: { acceptedAt: new Date() },
      });
      return m;
    });

    await this.audit.record({
      organizationId: invite.organizationId,
      actorId: userId,
      action: 'invite.accepted',
      entityType: 'Membership',
      entityId: membership.id,
      metadata: { inviteId: invite.id },
    });

    return membership;
  }

  async updateMemberRole(
    organizationId: string,
    actorId: string,
    targetUserId: string,
    role: Exclude<Role, 'OWNER'>,
  ) {
    const membership = await this.prisma.membership.findUnique({
      where: { userId_organizationId: { userId: targetUserId, organizationId } },
    });
    if (!membership) throw new NotFoundException('Member not found');
    if (membership.role === 'OWNER') {
      throw new ForbiddenException('Cannot change the role of an owner');
    }

    const updated = await this.prisma.membership.update({
      where: { id: membership.id },
      data: { role },
    });

    await this.audit.record({
      organizationId,
      actorId,
      action: 'member.role_updated',
      entityType: 'Membership',
      entityId: membership.id,
      metadata: { from: membership.role, to: role },
    });

    return updated;
  }

  async removeMember(organizationId: string, actorId: string, targetUserId: string) {
    const membership = await this.prisma.membership.findUnique({
      where: { userId_organizationId: { userId: targetUserId, organizationId } },
    });
    if (!membership) throw new NotFoundException('Member not found');
    if (membership.role === 'OWNER') {
      throw new ForbiddenException('Cannot remove an owner');
    }

    await this.prisma.membership.delete({ where: { id: membership.id } });
    await this.audit.record({
      organizationId,
      actorId,
      action: 'member.removed',
      entityType: 'Membership',
      entityId: membership.id,
      metadata: { userId: targetUserId },
    });
  }
}
