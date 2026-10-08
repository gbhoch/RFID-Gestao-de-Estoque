import { Controller, Get, HttpCode, Post, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { ErpConnectionService } from '../infrastructure/erp-connection.service';
import { ErpImportService } from '../application/erp-import.service';
import { ErpImportQuery } from '../application/dtos/erp-import.dto';
import { PermissionsGuard, RequirePermission } from '../../../common/guards/permissions.guard';

@ApiTags('erp')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), PermissionsGuard)
@Controller({ path: 'erp', version: '1' })
export class ErpController {
  constructor(
    private connection: ErpConnectionService,
    private importer: ErpImportService,
  ) {}

  // Diagnóstico de infraestrutura: restrito a quem administra perfis (só admin
  // no seed), sem criar uma permissão nova para um endpoint provisório.
  @Get('test-connection')
  @RequirePermission('roles:write')
  testConnection() {
    return this.connection.testConnection();
  }

  @Post('import')
  @HttpCode(200)
  @RequirePermission('erp:import')
  @ApiOperation({
    summary: 'Importa grupos, localizações e patrimônios do ERP',
    description:
      'dry-run (padrão) executa toda a lógica sem gravar e devolve o relatório. ' +
      'commit grava numa transação. Reexecutar é seguro (upsert pela chave de origem).',
  })
  import(@Query() q: ErpImportQuery) {
    return this.importer.import(q.mode ?? 'dry-run');
  }
}
