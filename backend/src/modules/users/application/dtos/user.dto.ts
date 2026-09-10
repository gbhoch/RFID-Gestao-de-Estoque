import { ApiProperty, ApiPropertyOptional, PartialType, OmitType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsString, IsNotEmpty, IsOptional, IsUUID, IsEmail, MinLength,
} from 'class-validator';

// Campos de seleção deixados em branco chegam como '' e quebrariam @IsUUID.
const emptyToUndefined = ({ value }: { value: unknown }) =>
  typeof value === 'string' && value.trim() === '' ? undefined : value;

export class CreateUserDto {
  @ApiProperty() @IsString() @IsNotEmpty({ message: 'Informe o nome do usuário.' }) name: string;
  @ApiPropertyOptional() @IsOptional() @IsString() registration?: string;
  // Campo em branco chega como '' e quebraria @IsEmail — vira undefined antes de validar.
  @ApiPropertyOptional()
  @Transform(emptyToUndefined) @IsOptional()
  @IsEmail({}, { message: 'Informe um e-mail válido.' })
  email?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() phone?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() position?: string;
  @ApiPropertyOptional()
  @Transform(emptyToUndefined) @IsOptional()
  @IsUUID('all', { message: 'Selecione um setor válido.' })
  sectorId?: string;
  @ApiProperty() @IsString() @IsNotEmpty({ message: 'Informe o login.' }) login: string;
  @ApiProperty() @IsString() @MinLength(8, { message: 'A senha deve ter no mínimo 8 caracteres.' }) password: string;
  @ApiProperty() @IsUUID('all', { message: 'Selecione um perfil de acesso.' }) roleId: string;
}

// Update não exige senha; se vier, é re-hasheada no service.
export class UpdateUserDto extends PartialType(
  OmitType(CreateUserDto, ['password'] as const),
) {
  @ApiPropertyOptional() @IsOptional() @IsString() @MinLength(8) password?: string;
}
