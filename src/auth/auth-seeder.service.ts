import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { PredefinedRole } from '../constants/predefined-role';
import { Permission } from './enums/permission.enum';

const SYSTEM_PERMISSIONS = Object.values(Permission);

@Injectable()
export class AuthSeederService implements OnApplicationBootstrap {
  private readonly logger = new Logger(AuthSeederService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) { }

  async onApplicationBootstrap() {
    this.logger.log('Checking if admin setup is required...');

    const adminUsersCount = await this.prisma.userRole.count({
      where: { roleName: PredefinedRole.ADMIN },
    });

    if (adminUsersCount > 0) {
      this.logger.log('Admin user already exists. Skipping auto-provisioning.');
      return;
    }

    const adminEmail = this.configService.get<string>('ADMIN_EMAIL');
    const adminPassword = this.configService.get<string>('ADMIN_PASSWORD');

    if (!adminEmail || !adminPassword) {
      this.logger.warn('ADMIN_EMAIL or ADMIN_PASSWORD not found in environment variables. Skipping admin auto-provisioning.');
      return;
    }

    this.logger.log('Starting admin auto-provisioning...');

    await this.prisma.role.upsert({
      where: { name: PredefinedRole.USER },
      update: {},
      create: { name: PredefinedRole.USER, description: 'Standard user role' },
    });

    await this.prisma.role.upsert({
      where: { name: PredefinedRole.ADMIN },
      update: {},
      create: { name: PredefinedRole.ADMIN, description: 'Administrator role' },
    });

    for (const perm of SYSTEM_PERMISSIONS) {
      await this.prisma.permission.upsert({
        where: { name: perm },
        update: {},
        create: { name: perm, description: `System permission: ${perm}` },
      });

      await this.prisma.rolePermission.upsert({
        where: {
          roleName_permissionName: {
            roleName: PredefinedRole.ADMIN,
            permissionName: perm,
          },
        },
        update: {},
        create: {
          roleName: PredefinedRole.ADMIN,
          permissionName: perm,
        },
      });
    }

    const hashedPassword = await bcrypt.hash(adminPassword, 10);

    await this.prisma.$transaction(async (tx) => {
      const adminUser = await tx.user.upsert({
        where: { email: adminEmail },
        update: { password: hashedPassword },
        create: {
          email: adminEmail,
          password: hashedPassword,
        },
      });

      await tx.userRole.upsert({
        where: {
          userId_roleName: {
            userId: adminUser.id,
            roleName: PredefinedRole.USER,
          },
        },
        update: {},
        create: {
          userId: adminUser.id,
          roleName: PredefinedRole.USER,
        },
      });

      await tx.userRole.upsert({
        where: {
          userId_roleName: {
            userId: adminUser.id,
            roleName: PredefinedRole.ADMIN,
          },
        },
        update: {},
        create: {
          userId: adminUser.id,
          roleName: PredefinedRole.ADMIN,
        },
      });
    });

    this.logger.log(`Successfully provisioned initial admin account: ${adminEmail}`);
  }
}
