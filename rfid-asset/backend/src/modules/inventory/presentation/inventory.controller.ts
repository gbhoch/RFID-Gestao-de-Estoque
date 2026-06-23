import {
  Controller, Get, Post, Param, Body, Query, Req, UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { InventoryService } from '../application/inventory.service';
import { StartInventoryDto, SubmitReadsDto } from '../application/dtos/inventory.dto';
import { PermissionsGuard, RequirePermission } from '../../../common/guards/permissions.guard';

@ApiTags('inventory')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), PermissionsGuard)
@Controller({ path: 'inventory', version: '1' })
export class InventoryController {
  constructor(private service: InventoryService) {}

  @Get() @RequirePermission('inventory:read')
  list(@Query('skip') skip?: number, @Query('take') take?: number) {
    return this.service.list({ skip, take });
  }

  @Post('start') @RequirePermission('inventory:write')
  start(@Body() dto: StartInventoryDto, @Req() req: any) {
    return this.service.start(dto, req.user.id);
  }

  @Post(':id/reads') @RequirePermission('inventory:write')
  submitReads(@Param('id') id: string, @Body() dto: SubmitReadsDto, @Req() req: any) {
    return this.service.submitReads(id, dto, req.user.id);
  }

  @Post(':id/finish') @RequirePermission('inventory:write')
  finish(@Param('id') id: string) {
    return this.service.finish(id);
  }

  @Get(':id/report') @RequirePermission('inventory:read')
  report(@Param('id') id: string) {
    return this.service.report(id);
  }
}
