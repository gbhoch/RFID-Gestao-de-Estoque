import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsString, IsNotEmpty, IsOptional, IsUUID, IsEnum, MaxLength,
} from 'class-validator';

const STATUS = ['active', 'blocked', 'inactive'];

export class CreateSectorDto {
  @ApiProperty()
  @IsString({ message: 'O nome deve ser um texto.' })
  @IsNotEmpty({ message: 'Informe o nome do setor.' })
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString({ message: 'A sigla deve ser um texto.' })
  @MaxLength(10, { message: 'A sigla deve ter no máximo 10 caracteres.' })
  acronym?: string;

  // '' (nenhum responsável selecionado) vira undefined antes de validar o UUID.
  @ApiPropertyOptional()
  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsOptional()
  @IsUUID('all', { message: 'Selecione um responsável válido.' })
  managerId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString({ message: 'A localização deve ser um texto.' })
  @MaxLength(120, { message: 'A localização deve ter no máximo 120 caracteres.' })
  location?: string;

  @ApiPropertyOptional({ enum: STATUS })
  @IsOptional()
  @IsEnum(STATUS, { message: 'Status inválido. Use ativo, bloqueado ou inativo.' })
  status?: string;
}
export class UpdateSectorDto extends PartialType(CreateSectorDto) {}
