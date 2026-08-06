import { Controller, Get, Post, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { AuthGuard } from '@/auth/guards/auth.guard';
import { RolesGuard } from '@/auth/guards/roles.guard';
import { RequireRoles } from '@/auth/decorators/require-roles.decorator';
import { PredefinedRole } from '@/common/constants/predefined-role';

@ApiTags('Admin Users')
@Controller('admin/users')
@UseGuards(AuthGuard, RolesGuard)
@RequireRoles(PredefinedRole.ADMIN)
@ApiBearerAuth()
export class AdminController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @ApiOperation({ summary: 'Get all users' })
  @ApiResponse({ status: 200, description: 'List of all users' })
  async getAllUsers() {
    return this.usersService.getAllUsers();
  }

  @Post(':id/role')
  @ApiOperation({ summary: 'Change user role' })
  @ApiResponse({ status: 200, description: 'User role updated successfully' })
  async changeUserRole(
    @Param('id') id: string,
    @Body('role') role: PredefinedRole,
  ) {
    return this.usersService.changeUserRole(id, role);
  }
}
