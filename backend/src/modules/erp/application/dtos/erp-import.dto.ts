import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';
import { ErpImportMode } from '../erp-import.service';

const MODES: ErpImportMode[] = ['dry-run', 'commit'];

export class ErpImportQuery {
  @ApiPropertyOptional({
    enum: MODES,
    default: 'dry-run',
    description: 'dry-run (padrão): só simula e devolve o relatório. commit: grava numa transação.',
  })
  @IsOptional() @IsIn(MODES) mode?: ErpImportMode = 'dry-run';
}
