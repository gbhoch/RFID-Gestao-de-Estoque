import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, IsUUID, IsEnum } from 'class-validator';
import { MOVEMENT_TYPES } from '../../infrastructure/movement.orm-entity';

export class CreateMovementDto {
  @ApiProperty() @IsUUID() assetId: string;
  @ApiProperty({ enum: MOVEMENT_TYPES }) @IsEnum(MOVEMENT_TYPES) type: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() toSectorId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() toOwnerId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}
