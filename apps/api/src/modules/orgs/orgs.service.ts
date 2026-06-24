import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { CreateOrgInput, Role } from '@pm/types';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';

@Injectable()
export class OrgsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

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
   * Add an existing user to the org, or record an invite for an unknown email.
   * (A production flow would email a signed invite link; we keep the row and
   * the membership creation here for brevity.)
   */
  async addMember(
    organizationId: string,
    actorId: string,
    email: string,
    role: Exclude<Role, 'OWNER'>,
  ) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      throw new NotFoundException('No user with that email (invite-by-email flow is TODO)');
    }

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
      metadata: { email, role },
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
