import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, IsUUID, IsEnum } from 'class-validator';

const STATUS = ['active', 'blocked', 'inactive'];

export class CreateSectorDto {
  @ApiProperty() @IsString() @IsNotEmpty() name: string;
  @ApiProperty() @IsString() @IsNotEmpty() acronym: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() managerId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() location?: string;
  @ApiPropertyOptional({ enum: STATUS }) @IsOptional() @IsEnum(STATUS) status?: string;
}
export class UpdateSectorDto extends PartialType(CreateSectorDto) {}
