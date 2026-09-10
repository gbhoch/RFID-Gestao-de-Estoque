import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { RoleService } from '../application/role.service';
import { PermissionsGuard, RequirePermission } from '../../../common/guards/permissions.guard';

@ApiTags('roles')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), PermissionsGuard)
@Controller({ path: 'roles', version: '1' })
export class RoleController {
  constructor(private service: RoleService) {}

  // Somente leitura — usado para o dropdown de perfil no cadastro de usuários.
  @Get() @RequirePermission('users:read')
  list(@Query('skip') skip?: number, @Query('take') take?: number, @Query('search') search?: string) {
    return this.service.list({ skip, take, search });
  }

  // O lookup do frontend chama esta rota (byKey) para exibir o NOME do perfil a
  // partir do id gravado no usuário.
  @Get(':id') @RequirePermission('users:read')
  findOne(@Param('id') id: string) { return this.service.findOne(id); }
}
