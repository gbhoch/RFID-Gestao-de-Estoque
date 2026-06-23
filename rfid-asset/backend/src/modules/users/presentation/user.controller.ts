import {
  Controller, Get, Post, Put, Patch, Delete, Param, Body, Query, UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { UserService } from '../application/user.service';
import { CreateUserDto, UpdateUserDto } from '../application/dtos/user.dto';
import { PermissionsGuard, RequirePermission } from '../../../common/guards/permissions.guard';

@ApiTags('users')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), PermissionsGuard)
@Controller({ path: 'users', version: '1' })
export class UserController {
  constructor(private service: UserService) {}

  @Get() @RequirePermission('users:read')
  list(@Query('skip') skip?: number, @Query('take') take?: number, @Query('search') search?: string) {
    return this.service.list({ skip, take, search });
  }

  @Get(':id') @RequirePermission('users:read')
  findOne(@Param('id') id: string) { return this.service.findOne(id); }

  @Post() @RequirePermission('users:write')
  create(@Body() dto: CreateUserDto) { return this.service.create(dto); }

  @Put(':id') @RequirePermission('users:write')
  update(@Param('id') id: string, @Body() dto: UpdateUserDto) { return this.service.update(id, dto); }

  @Patch(':id/block') @RequirePermission('users:write')
  block(@Param('id') id: string) { return this.service.setStatus(id, 'blocked'); }

  @Patch(':id/activate') @RequirePermission('users:write')
  activate(@Param('id') id: string) { return this.service.setStatus(id, 'active'); }

  @Delete(':id') @RequirePermission('users:delete')
  remove(@Param('id') id: string) { return this.service.remove(id); }
}
