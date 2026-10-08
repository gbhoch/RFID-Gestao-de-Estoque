import { Module } from '@nestjs/common';
import { ErpConnectionService } from './infrastructure/erp-connection.service';
import { ErpSourceReader } from './infrastructure/erp-source.reader';
import { ErpImportRepository } from './infrastructure/erp-import.repository';
import { ErpImportService } from './application/erp-import.service';
import { ErpController } from './presentation/erp.controller';
import { ERP_SOURCE, ERP_IMPORT_REPOSITORY } from './domain/erp-import';

@Module({
  controllers: [ErpController],
  providers: [
    ErpConnectionService,
    ErpImportService,
    { provide: ERP_SOURCE, useClass: ErpSourceReader },
    { provide: ERP_IMPORT_REPOSITORY, useClass: ErpImportRepository },
  ],
})
export class ErpModule {}
