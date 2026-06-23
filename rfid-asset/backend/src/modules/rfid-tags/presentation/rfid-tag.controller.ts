import {
  Controller, Get, Post, Put, Patch, Delete, Param, Body, Query, UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { RfidTagService } from '../application/rfid-tag.service';
import { CreateRfidTagDto, UpdateRfidTagDto } from '../application/dtos/rfid-tag.dto';
import { PermissionsGuard, RequirePermission } from '../../../common/guards/permissions.guard';

@ApiTags('rfid-tags')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), PermissionsGuard)
@Controller({ path: 'rfid-tags', version: '1' })
export class RfidTagController {
  constructor(private service: RfidTagService) {}

  @Get() @RequirePermission('rfid:read')
  list(@Query('skip') skip?: number, @Query('take') take?: number, @Query('search') search?: string) {
    return this.service.list({ skip, take, search, searchField: 'epc' });
  }
  @Get(':id') @RequirePermission('rfid:read')
  findOne(@Param('id') id: string) { return this.service.findOne(id); }
  @Post() @RequirePermission('rfid:write')
  create(@Body() dto: CreateRfidTagDto) { return this.service.create(dto as any); }
  @Put(':id') @RequirePermission('rfid:write')
  update(@Param('id') id: string, @Body() dto: UpdateRfidTagDto) { return this.service.update(id, dto as any); }
  @Patch(':id/inactivate') @RequirePermission('rfid:write')
  inactivate(@Param('id') id: string) { return this.service.inactivate(id); }
  @Patch(':id/reactivate') @RequirePermission('rfid:write')
  reactivate(@Param('id') id: string) { return this.service.reactivate(id); }
  @Patch(':id/retire') @RequirePermission('rfid:write')
  retire(@Param('id') id: string) { return this.service.retire(id); }
  @Delete(':id') @RequirePermission('rfid:delete')
  remove(@Param('id') id: string) { return this.service.remove(id); }
}
