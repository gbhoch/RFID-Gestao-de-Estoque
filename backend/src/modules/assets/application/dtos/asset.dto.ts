import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsString, IsNotEmpty, IsOptional, IsUUID, IsNumber, IsEnum, IsInt, Min, IsIn, ValidateIf,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  AssetStatus, AssetStatusFilter, ACTIVE_STATUS_GROUP, NO_SECTOR,
  ASSET_SORT_FIELDS, DEFAULT_ASSET_SORT,
} from '../../domain/asset';

const STATUSES: AssetStatus[] = [
  'available','in_use','maintenance','reserved','missing','loaned','written_off','scrapped',
];

export class CreateAssetDto {
  @ApiProperty() @IsString() @IsNotEmpty() assetCode: string;
  @ApiProperty() @IsString() @IsNotEmpty() name: string;
  @ApiProperty() @IsUUID() categoryId: string;
  @ApiPropertyOptional() @IsOptional() @IsString() brand?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() model?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() serialNumber?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() acquisitionValue?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() invoiceNumber?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() costCenter?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() sectorId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() ownerId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() rfidTagId?: string;
  @ApiPropertyOptional({ enum: STATUSES }) @IsOptional() @IsEnum(STATUSES) status?: AssetStatus;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}

export class UpdateAssetDto extends PartialType(CreateAssetDto) {}

export class ListAssetQuery {
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(0) skip = 0;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(1) take = 20;
  @ApiPropertyOptional({ description: `UUID do setor, ou '${NO_SECTOR}' para bens sem setor` })
  @IsOptional() @ValidateIf((o) => o.sectorId !== NO_SECTOR) @IsUUID()
  sectorId?: string;
  @ApiPropertyOptional({
    enum: [...STATUSES, ACTIVE_STATUS_GROUP],
    description: `Status individual, ou '${ACTIVE_STATUS_GROUP}' para todos exceto 'written_off'`,
  })
  @IsOptional() @IsIn([...STATUSES, ACTIVE_STATUS_GROUP])
  status?: AssetStatusFilter;
  @ApiPropertyOptional({ description: 'Busca em nome e código patrimonial (sem diferenciar maiúsculas)' })
  @IsOptional() @IsString()
  search?: string;
  // Sem validação estrita de propósito: valor fora da lista cai no padrão
  // (assetCode ASC) em vez de devolver 400.
  @ApiPropertyOptional({ enum: ASSET_SORT_FIELDS, default: DEFAULT_ASSET_SORT.field })
  @IsOptional() @IsString()
  sortBy?: string;
  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'asc' })
  @IsOptional() @IsString()
  sortDir?: string;
}
