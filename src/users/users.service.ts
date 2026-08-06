import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { PredefinedRole } from '@/common/constants/predefined-role';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async getMyProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        profile: true,
        userRoles: true,
        creditBalance: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const { password, ...result } = user;
    return result;
  }

  async getAllUsers() {
    const users = await this.prisma.user.findMany({
      include: {
        profile: true,
        userRoles: true,
      },
    });

    return users.map((user) => {
      const { password, ...result } = user;
      return result;
    });
  }

  async changeUserRole(userId: string, roleName: PredefinedRole) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const role = await this.prisma.role.findUnique({ where: { name: roleName } });
    if (!role) {
      throw new NotFoundException('Role not found');
    }

    await this.prisma.userRole.deleteMany({
      where: { userId },
    });

    await this.prisma.userRole.create({
      data: {
        userId,
        roleName,
      },
    });

    return { success: true, message: `User role updated to ${roleName}` };
  }
}
