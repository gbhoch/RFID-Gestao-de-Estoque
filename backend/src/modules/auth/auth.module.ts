import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './application/auth.service';
import { AuthController } from './presentation/auth.controller';
import { JwtStrategy } from './infrastructure/jwt.strategy';
import {
  UserEntity, RoleEntity, PermissionEntity, RefreshTokenEntity,
} from './infrastructure/auth.orm-entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      UserEntity, RoleEntity, PermissionEntity, RefreshTokenEntity,
    ]),
    PassportModule,
    JwtModule.register({}),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  exports: [AuthService, TypeOrmModule],
})
export class AuthModule {}
