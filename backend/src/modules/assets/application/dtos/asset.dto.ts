import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsString, IsNotEmpty, IsOptional, IsUUID, IsNumber, IsEnum, IsInt, Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { AssetStatus } from '../../domain/asset';

const STATUSES: AssetStatus[] = [
  'available','in_use','maintenance','reserved','missing','loaned','written_off','scrapped',
];

export class CreateAssetDto {
  @ApiProperty() @IsString() @IsNotEmpty() assetCode: string;
  @ApiProperty() @IsString() @IsNotEmpty() name: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
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
  @ApiPropertyOptional() @IsOptional() @IsUUID() sectorId?: string;
  @ApiPropertyOptional({ enum: STATUSES }) @IsOptional() @IsEnum(STATUSES) status?: AssetStatus;
  @ApiPropertyOptional() @IsOptional() @IsString() search?: string;
}
