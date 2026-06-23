import {
  Controller, Get, Post, Put, Delete, Param, Body, Query, UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { CategoryService } from '../application/category.service';
import { CreateCategoryDto, UpdateCategoryDto } from '../application/dtos/category.dto';
import { PermissionsGuard, RequirePermission } from '../../../common/guards/permissions.guard';

@ApiTags('categories')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), PermissionsGuard)
@Controller({ path: 'categories', version: '1' })
export class CategoryController {
  constructor(private service: CategoryService) {}

  @Get() @RequirePermission('categories:read')
  list(@Query('skip') skip?: number, @Query('take') take?: number, @Query('search') search?: string) {
    return this.service.list({ skip, take, search, searchField: 'name' });
  }
  @Get(':id') @RequirePermission('categories:read')
  findOne(@Param('id') id: string) { return this.service.findOne(id); }
  @Post() @RequirePermission('categories:write')
  create(@Body() dto: CreateCategoryDto) { return this.service.create(dto as any); }
  @Put(':id') @RequirePermission('categories:write')
  update(@Param('id') id: string, @Body() dto: UpdateCategoryDto) { return this.service.update(id, dto as any); }
  @Delete(':id') @RequirePermission('categories:delete')
  remove(@Param('id') id: string) { return this.service.remove(id); }
}
