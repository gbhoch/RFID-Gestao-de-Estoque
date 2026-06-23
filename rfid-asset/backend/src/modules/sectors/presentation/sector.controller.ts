import {
  Controller, Get, Post, Put, Delete, Param, Body, Query, UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { SectorService } from '../application/sector.service';
import { CreateSectorDto, UpdateSectorDto } from '../application/dtos/sector.dto';
import { PermissionsGuard, RequirePermission } from '../../../common/guards/permissions.guard';

@ApiTags('sectors')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), PermissionsGuard)
@Controller({ path: 'sectors', version: '1' })
export class SectorController {
  constructor(private service: SectorService) {}

  @Get() @RequirePermission('sectors:read')
  list(
    @Query('skip') skip?: number,
    @Query('take') take?: number,
    @Query('search') search?: string,
  ) {
    return this.service.list({ skip, take, search, searchField: 'name' });
  }

  @Get(':id') @RequirePermission('sectors:read')
  findOne(@Param('id') id: string) { return this.service.findOne(id); }

  @Post() @RequirePermission('sectors:write')
  create(@Body() dto: CreateSectorDto) { return this.service.create(dto as any); }

  @Put(':id') @RequirePermission('sectors:write')
  update(@Param('id') id: string, @Body() dto: UpdateSectorDto) {
    return this.service.update(id, dto as any);
  }

  @Delete(':id') @RequirePermission('sectors:delete')
  remove(@Param('id') id: string) { return this.service.remove(id); }
}
