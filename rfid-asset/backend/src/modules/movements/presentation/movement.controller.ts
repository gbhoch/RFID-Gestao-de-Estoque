import {
  Controller, Get, Post, Param, Body, Query, Req, UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { MovementService } from '../application/movement.service';
import { CreateMovementDto } from '../application/dtos/movement.dto';
import { PermissionsGuard, RequirePermission } from '../../../common/guards/permissions.guard';

@ApiTags('movements')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), PermissionsGuard)
@Controller({ path: 'movements', version: '1' })
export class MovementController {
  constructor(private service: MovementService) {}

  @Get() @RequirePermission('movements:read')
  list(@Query('skip') skip?: number, @Query('take') take?: number) {
    return this.service.list({ skip, take });
  }

  @Post() @RequirePermission('movements:write')
  register(@Body() dto: CreateMovementDto, @Req() req: any) {
    return this.service.register(dto, req.user.id);
  }

  @Get('asset/:assetId') @RequirePermission('movements:read')
  byAsset(@Param('assetId') assetId: string) {
    return this.service.listByAsset(assetId);
  }

  @Get('asset/:assetId/location-history') @RequirePermission('movements:read')
  locationHistory(@Param('assetId') assetId: string) {
    return this.service.locationHistory(assetId);
  }
}
