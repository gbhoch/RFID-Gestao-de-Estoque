import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RoleController } from './presentation/role.controller';
import { RoleService } from './application/role.service';
import { RoleEntity } from '../auth/infrastructure/auth.orm-entity';

@Module({
  imports: [TypeOrmModule.forFeature([RoleEntity])],
  controllers: [RoleController],
  providers: [RoleService],
})
export class RolesModule {}
