import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsUUID, IsString, IsNotEmpty, IsArray, ValidateNested, IsOptional,
  IsInt, IsIn, IsDateString, ValidateIf, Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { RESOLUTIONS } from '../../infrastructure/inventory.orm-entity';

export class CreateInventoryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
}

export class SelectSectorDto {
  @ApiProperty() @IsUUID() sectorId: string;
}

export class InventoryReadItemDto {
  @ApiProperty() @IsString() @IsNotEmpty() epc: string;
  @ApiPropertyOptional() @IsOptional() @IsString() deviceId?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() rssi?: number;
  @ApiPropertyOptional() @IsOptional() @IsDateString() readAt?: string;
  // Enviados pelo coletor Android, que já deduplica por EPC antes de subir.
  @ApiPropertyOptional({ description: 'Hits agregados no coletor para este EPC' })
  @IsOptional() @IsInt() @Min(1) readCount?: number;
  @ApiPropertyOptional({ description: 'TID da etiqueta (identidade física, anti-clonagem)' })
  @IsOptional() @IsString() tid?: string;
}

export class AddReadsDto {
  @ApiProperty() @IsUUID() sectorVisitId: string;
  /**
   * Chave de idempotência do lote, gerada pelo coletor. Reenviar o mesmo
   * clientBatchId com os mesmos EPCs é no-op — é isso que permite ao app
   * repetir o envio quando a resposta se perde, sem duplicar leitura.
   * A captura pela web não envia (cada tecla é um lote novo por natureza).
   */
  @ApiPropertyOptional() @IsOptional() @IsUUID() clientBatchId?: string;
  @ApiProperty({ type: [InventoryReadItemDto] })
  @IsArray() @ValidateNested({ each: true }) @Type(() => InventoryReadItemDto)
  reads: InventoryReadItemDto[];
}

export class ResolveDiscrepancyDto {
  @ApiProperty({ enum: RESOLUTIONS })
  @IsIn(RESOLUTIONS as unknown as string[]) resolution: string;

  // Obrigatório apenas para o desfecho 'justified'; opcional nos demais.
  @ApiPropertyOptional()
  @ValidateIf((o) => o.resolution === 'justified')
  @IsString() @IsNotEmpty({ message: 'resolutionNotes é obrigatório para o desfecho justified' })
  resolutionNotes?: string;
}
