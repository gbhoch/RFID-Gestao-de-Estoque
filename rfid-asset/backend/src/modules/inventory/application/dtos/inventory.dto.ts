import { ApiProperty } from '@nestjs/swagger';
import {
  IsUUID, IsString, IsNotEmpty, IsArray, ValidateNested, IsOptional, IsInt,
} from 'class-validator';
import { Type } from 'class-transformer';

export class StartInventoryDto {
  @ApiProperty() @IsUUID() sectorId: string;
}

export class InventoryReadItemDto {
  @ApiProperty() @IsString() @IsNotEmpty() epc: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() deviceId?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsInt() rssi?: number;
}

export class SubmitReadsDto {
  @ApiProperty({ type: [InventoryReadItemDto] })
  @IsArray() @ValidateNested({ each: true }) @Type(() => InventoryReadItemDto)
  reads: InventoryReadItemDto[];
}
