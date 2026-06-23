import { ApiProperty, ApiPropertyOptional, PartialType, OmitType } from '@nestjs/swagger';
import {
  IsString, IsNotEmpty, IsOptional, IsUUID, IsEmail, MinLength,
} from 'class-validator';

export class CreateUserDto {
  @ApiProperty() @IsString() @IsNotEmpty() name: string;
  @ApiPropertyOptional() @IsOptional() @IsString() registration?: string;
  @ApiProperty() @IsEmail() email: string;
  @ApiPropertyOptional() @IsOptional() @IsString() phone?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() position?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() sectorId?: string;
  @ApiProperty() @IsString() @IsNotEmpty() login: string;
  @ApiProperty() @IsString() @MinLength(8) password: string;
  @ApiProperty() @IsUUID() roleId: string;
}

// Update não exige senha; se vier, é re-hasheada no service.
export class UpdateUserDto extends PartialType(
  OmitType(CreateUserDto, ['password'] as const),
) {
  @ApiPropertyOptional() @IsOptional() @IsString() @MinLength(8) password?: string;
}
