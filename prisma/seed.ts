import { PrismaClient } from '../generated/prisma/client.js';
import { PrismaPg } from '@prisma/adapter-pg';
import { PredefinedRole } from '../src/common/constants/predefined-role.js';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('Seeding database...');

  await prisma.role.upsert({
    where: { name: PredefinedRole.ADMIN },
    update: {},
    create: {
      name: PredefinedRole.ADMIN,
      description: 'Administrator with full system access',
    },
  });

  await prisma.role.upsert({
    where: { name: PredefinedRole.USER },
    update: {},
    create: {
      name: PredefinedRole.USER,
      description: 'Standard user with basic access',
    },
  });

  console.log('Roles seeded successfully');

  const permissions = [
    { name: 'CREATEUSER', description: 'Create new users' },
    { name: 'GETUSER', description: 'Read user information' },
    { name: 'GETUSERPROFILE', description: 'Read user profile information' },
    { name: 'GETUSERSUB', description: 'Read user subscription information' },
    { name: 'BILLING_ACCESS', description: 'Access billing and checkout endpoints' },
    { name: 'CREDIT_ACCESS', description: 'Access credit consumption and balance endpoints' },
    { name: 'CATALOG_MANAGE', description: 'Manage product catalog and pricing' },
  ];

  for (const permission of permissions) {
    await prisma.permission.upsert({
      where: { name: permission.name },
      update: {},
      create: permission,
    });
  }

  console.log('Permissions seeded successfully');

  const adminRole = await prisma.role.findUnique({
    where: { name: PredefinedRole.ADMIN },
  });

  const userRole = await prisma.role.findUnique({
    where: { name: PredefinedRole.USER },
  });

  if (adminRole) {
    const allPermissions = await prisma.permission.findMany();
    for (const permission of allPermissions) {
      await prisma.rolePermission.upsert({
        where: {
          roleName_permissionName: {
            roleName: adminRole.name,
            permissionName: permission.name,
          },
        },
        update: {},
        create: {
          roleName: adminRole.name,
          permissionName: permission.name,
        },
      });
    }
    console.log('Admin role permissions assigned');
  }

  if (userRole) {
    const userPermissionNames = ['GETUSERPROFILE', 'GETUSERSUB', 'BILLING_ACCESS', 'CREDIT_ACCESS'];
    const userPermissions = await prisma.permission.findMany({
      where: { name: { in: userPermissionNames } },
    });
    for (const permission of userPermissions) {
      await prisma.rolePermission.upsert({
        where: {
          roleName_permissionName: {
            roleName: userRole.name,
            permissionName: permission.name,
          },
        },
        update: {},
        create: {
          roleName: userRole.name,
          permissionName: permission.name,
        },
      });
    }
    console.log('User role permissions assigned');
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

