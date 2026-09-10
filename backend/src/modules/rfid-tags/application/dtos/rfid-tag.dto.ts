import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsString, IsNotEmpty, IsOptional, IsEnum, IsInt, IsBoolean, Min, Matches, MaxLength,
} from 'class-validator';
import { RFID_STATUSES } from '../../infrastructure/rfid-tag.orm-entity';
import { HEX_WORDS, HEX_PASSWORD, EPC_MAX_HEX, Gen2Bank } from '../../domain/gen2';

const WORD_MSG = 'Valor deve ser hexadecimal alinhado a word (múltiplo de 4 dígitos)';
const PWD_MSG = 'Senha deve ter 32 bits (8 dígitos hexadecimais)';

export class CreateRfidTagDto {
  @ApiProperty()
  @IsString() @IsNotEmpty()
  @Matches(HEX_WORDS, { message: `EPC: ${WORD_MSG}` })
  @MaxLength(EPC_MAX_HEX, { message: 'EPC excede 512 bits (128 dígitos hex)' })
  epc: string;

  @ApiPropertyOptional() @IsOptional() @IsString() rfidCode?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() serialNumber?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() manufacturer?: string;

  @ApiPropertyOptional() @IsOptional()
  @Matches(HEX_WORDS, { message: `TID: ${WORD_MSG}` })
  tid?: string;

  @ApiPropertyOptional() @IsOptional()
  @Matches(/^[0-9A-Fa-f]{4}$/, { message: 'PC deve ter 1 word (4 dígitos hex)' })
  pcWord?: string;

  @ApiPropertyOptional() @IsOptional()
  @Matches(HEX_WORDS, { message: `User memory: ${WORD_MSG}` })
  userMemory?: string;

  @ApiPropertyOptional() @IsOptional()
  @Matches(HEX_PASSWORD, { message: `Senha de acesso: ${PWD_MSG}` })
  accessPassword?: string;

  @ApiPropertyOptional() @IsOptional()
  @Matches(HEX_PASSWORD, { message: `Senha de kill: ${PWD_MSG}` })
  killPassword?: string;

  @ApiPropertyOptional({ enum: RFID_STATUSES })
  @IsOptional() @IsEnum(RFID_STATUSES) status?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}

export class UpdateRfidTagDto extends PartialType(CreateRfidTagDto) {}

// ---- Operações físicas de banco (encaminhadas ao leitor via RfidReaderPort) ----

export class ReadBankDto {
  @ApiProperty({ enum: Gen2Bank }) @IsEnum(Gen2Bank) bank: Gen2Bank;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) wordPtr?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) wordCount?: number;
  @ApiPropertyOptional() @IsOptional() @Matches(HEX_PASSWORD, { message: PWD_MSG }) accessPassword?: string;
}

export class WriteBankDto {
  @ApiProperty({ enum: Gen2Bank }) @IsEnum(Gen2Bank) bank: Gen2Bank;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) wordPtr?: number;
  @ApiProperty()
  @IsString() @IsNotEmpty()
  @Matches(HEX_WORDS, { message: WORD_MSG })
  dataHex: string;
  @ApiPropertyOptional() @IsOptional() @Matches(HEX_PASSWORD, { message: PWD_MSG }) accessPassword?: string;
}

export class LockBankDto {
  @ApiProperty({ enum: Gen2Bank }) @IsEnum(Gen2Bank) bank: Gen2Bank;
  @ApiProperty() @IsBoolean() lock: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() permanent?: boolean;
  @ApiPropertyOptional() @IsOptional() @Matches(HEX_PASSWORD, { message: PWD_MSG }) accessPassword?: string;
}
