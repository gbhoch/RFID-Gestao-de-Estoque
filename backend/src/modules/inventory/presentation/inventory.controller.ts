import {
  Controller, Get, Post, Patch, Param, Body, Query, Req, UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { InventoryService } from '../application/inventory.service';
import {
  CreateInventoryDto, SelectSectorDto, AddReadsDto, ResolveDiscrepancyDto,
} from '../application/dtos/inventory.dto';
import { PermissionsGuard, RequirePermission } from '../../../common/guards/permissions.guard';

@ApiTags('inventory')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), PermissionsGuard)
@Controller({ path: 'inventory', version: '1' })
export class InventoryController {
  constructor(private service: InventoryService) {}

  @Post() @RequirePermission('inventory:write')
  create(@Body() dto: CreateInventoryDto, @Req() req: any) {
    return this.service.create(dto, req.user.id);
  }

  // Declarar 'current' ANTES de ':id' para não ser capturado pela rota paramétrica.
  @Get('current') @RequirePermission('inventory:read')
  current() { return this.service.current(); }

  @Get() @RequirePermission('inventory:read')
  list(@Query('skip') skip?: number, @Query('take') take?: number) {
    return this.service.list({ skip, take });
  }

  @Get(':id') @RequirePermission('inventory:read')
  detail(@Param('id') id: string) { return this.service.detail(id); }

  @Patch(':id/pause') @RequirePermission('inventory:write')
  pause(@Param('id') id: string) { return this.service.pause(id); }

  @Patch(':id/resume') @RequirePermission('inventory:write')
  resume(@Param('id') id: string) { return this.service.resume(id); }

  @Post(':id/finish') @RequirePermission('inventory:write')
  finish(@Param('id') id: string) { return this.service.finish(id); }

  // Reabre um inventário encerrado para absorver coleta que chegou tarde
  // (coletor offline). Recusa se alguma divergência já foi resolvida.
  @Patch(':id/reopen') @RequirePermission('inventory:write')
  reopen(@Param('id') id: string) { return this.service.reopen(id); }

  @Post(':id/sectors') @RequirePermission('inventory:write')
  selectSector(@Param('id') id: string, @Body() dto: SelectSectorDto) {
    return this.service.selectSector(id, dto);
  }

  @Patch(':id/sectors/:visitId/complete') @RequirePermission('inventory:write')
  completeSector(@Param('id') id: string, @Param('visitId') visitId: string) {
    return this.service.completeSector(id, visitId);
  }

  @Post(':id/reads') @RequirePermission('inventory:write')
  addReads(@Param('id') id: string, @Body() dto: AddReadsDto, @Req() req: any) {
    return this.service.addReads(id, dto, req.user.id);
  }

  @Get(':id/sectors/:visitId/panel') @RequirePermission('inventory:read')
  panel(@Param('id') id: string, @Param('visitId') visitId: string) {
    return this.service.panel(id, visitId);
  }

  @Get(':id/discrepancies') @RequirePermission('inventory:read')
  discrepancies(@Param('id') id: string) {
    return this.service.discrepanciesList(id);
  }

  @Patch(':id/discrepancies/:discrepancyId/resolve') @RequirePermission('inventory:write')
  resolve(
    @Param('id') id: string,
    @Param('discrepancyId') discrepancyId: string,
    @Body() dto: ResolveDiscrepancyDto,
    @Req() req: any,
  ) {
    return this.service.resolve(id, discrepancyId, dto, req.user.id);
  }
}
