import { Module } from '@nestjs/common';
import { AuthModule } from '@/auth/auth.module';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { AdminController } from '@/users/admin.controller';

@Module({
  imports: [AuthModule],
  controllers: [UsersController, AdminController],
  providers: [UsersService],
})
export class UsersModule {}
