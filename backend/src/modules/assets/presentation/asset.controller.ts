import {
  Controller, Get, Post, Put, Delete, Param, Body, Query, UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { AssetService } from '../application/asset.service';
import {
  CreateAssetDto, UpdateAssetDto, ListAssetQuery,
} from '../application/dtos/asset.dto';
import { PermissionsGuard, RequirePermission } from '../../../common/guards/permissions.guard';

@ApiTags('assets')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), PermissionsGuard)
@Controller({ path: 'assets', version: '1' })
export class AssetController {
  constructor(private service: AssetService) {}

  @Get()
  @RequirePermission('assets:read')
  list(@Query() q: ListAssetQuery) {
    return this.service.list(q);
  }

  @Get(':id')
  @RequirePermission('assets:read')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post()
  @RequirePermission('assets:write')
  create(@Body() dto: CreateAssetDto) {
    return this.service.create(dto);
  }

  @Put(':id')
  @RequirePermission('assets:write')
  update(@Param('id') id: string, @Body() dto: UpdateAssetDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @RequirePermission('assets:delete')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
