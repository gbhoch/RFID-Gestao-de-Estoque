import {
  Module, Controller, Get, Query, UseGuards,
} from '@nestjs/common';
import { TypeOrmModule, InjectRepository } from '@nestjs/typeorm';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Repository, Between } from 'typeorm';
import { AuditLogOrmEntity, AuditInterceptor } from './infrastructure/audit.orm-entity';
import { PermissionsGuard, RequirePermission } from '../../common/guards/permissions.guard';

@ApiTags('audit')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), PermissionsGuard)
@Controller({ path: 'audit', version: '1' })
export class AuditController {
  constructor(
    @InjectRepository(AuditLogOrmEntity) private repo: Repository<AuditLogOrmEntity>,
  ) {}

  @Get() @RequirePermission('audit:read')
  async list(
    @Query('skip') skip = 0,
    @Query('take') take = 20,
    @Query('userId') userId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const where: any = {};
    if (userId) where.userId = userId;
    if (from && to) where.occurredAt = Between(new Date(from), new Date(to));
    const [data, total] = await this.repo.findAndCount({
      where,
      skip: Number(skip),
      take: Number(take),
      order: { occurredAt: 'DESC' },
    });
    return { data, total };
  }
}

@Module({
  imports: [TypeOrmModule.forFeature([AuditLogOrmEntity])],
  controllers: [AuditController],
  providers: [{ provide: APP_INTERCEPTOR, useClass: AuditInterceptor }],
})
export class AuditModule {}
