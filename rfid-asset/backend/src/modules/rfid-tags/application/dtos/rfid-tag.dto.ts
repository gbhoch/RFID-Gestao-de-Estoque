import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, IsEnum } from 'class-validator';
import { RFID_STATUSES } from '../../infrastructure/rfid-tag.orm-entity';

export class CreateRfidTagDto {
  @ApiProperty() @IsString() @IsNotEmpty() epc: string;
  @ApiPropertyOptional() @IsOptional() @IsString() rfidCode?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() serialNumber?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() manufacturer?: string;
  @ApiPropertyOptional({ enum: RFID_STATUSES }) @IsOptional() @IsEnum(RFID_STATUSES) status?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}
export class UpdateRfidTagDto extends PartialType(CreateRfidTagDto) {}
