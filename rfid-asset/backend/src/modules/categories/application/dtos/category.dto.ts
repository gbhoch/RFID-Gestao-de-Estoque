import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, IsEnum } from 'class-validator';

const STATUS = ['active', 'blocked', 'inactive'];

export class CreateCategoryDto {
  @ApiProperty() @IsString() @IsNotEmpty() name: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional({ enum: STATUS }) @IsOptional() @IsEnum(STATUS) status?: string;
}
export class UpdateCategoryDto extends PartialType(CreateCategoryDto) {}
