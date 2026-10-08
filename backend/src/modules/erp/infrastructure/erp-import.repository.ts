import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, QueryRunner } from 'typeorm';
import {
  ErpImportRepositoryPort, ErpImportUnitOfWork, LocalState,
  CategoryRecord, SectorRecord, AssetRecord,
} from '../domain/erp-import';

/** Linhas por INSERT. assets tem 12 colunas → 6.000 parâmetros (limite do pg: 65.535). */
const BATCH_SIZE = 500;

interface ColumnSpec { name: string; cast: string }

/**
 * INSERT ... ON CONFLICT (id) DO UPDATE em lotes.
 *
 * Os ids de registros novos são gerados pela aplicação, então o mesmo comando
 * cria (id inédito) ou atualiza (id existente). O UPDATE só toca as colunas
 * listadas — campos que nascem no sistema RFID (rfid_tag_id, owner_id, brand,
 * acronym...) ficam intactos — e só age sobre registros de origem ERP: a
 * cláusula WHERE é uma segunda trava contra alterar cadastro manual.
 */
async function upsertBatches(
  qr: QueryRunner, table: string, columns: ColumnSpec[], rows: Record<string, unknown>[],
) {
  const names = columns.map((c) => c.name);
  const updates = names.filter((n) => n !== 'id').map((n) => `${n} = EXCLUDED.${n}`);
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const chunk = rows.slice(i, i + BATCH_SIZE);
    const params: unknown[] = [];
    const tuples = chunk.map((row) =>
      `(${columns.map((c) => { params.push(row[c.name]); return `$${params.length}::${c.cast}`; }).join(', ')})`,
    );
    await qr.query(
      `INSERT INTO ${table} AS t (${names.join(', ')})
       VALUES ${tuples.join(',\n')}
       ON CONFLICT (id) DO UPDATE SET ${updates.join(', ')}, updated_at = now()
       WHERE t.erp_empresa IS NOT NULL`,
      params,
    );
  }
}

const ERP_COLUMNS: ColumnSpec[] = [
  { name: 'erp_synced_at', cast: 'timestamptz' },
  { name: 'erp_hash', cast: 'varchar' },
];

const CATEGORY_COLUMNS: ColumnSpec[] = [
  { name: 'id', cast: 'uuid' },
  { name: 'name', cast: 'varchar' },
  { name: 'status', cast: 'user_status' },
  { name: 'erp_empresa', cast: 'int' },
  { name: 'erp_codigo', cast: 'int' },
  ...ERP_COLUMNS,
];

const SECTOR_COLUMNS: ColumnSpec[] = CATEGORY_COLUMNS;

const ASSET_COLUMNS: ColumnSpec[] = [
  { name: 'id', cast: 'uuid' },
  { name: 'asset_code', cast: 'varchar' },
  { name: 'name', cast: 'varchar' },
  { name: 'category_id', cast: 'uuid' },
  { name: 'sector_id', cast: 'uuid' },
  { name: 'acquisition_date', cast: 'date' },
  { name: 'notes', cast: 'text' },
  { name: 'status', cast: 'asset_status' },
  { name: 'erp_empresa', cast: 'int' },
  { name: 'erp_sequencial', cast: 'bigint' },
  ...ERP_COLUMNS,
];

class PgUnitOfWork implements ErpImportUnitOfWork {
  constructor(private qr: QueryRunner) {}

  async loadState(): Promise<LocalState> {
    // Inclui soft-deleted: asset_code e categories.name são UNIQUE na tabela toda.
    const [categories, sectors, assets] = await Promise.all([
      this.qr.query(
        `SELECT id, name, erp_empresa AS "erpEmpresa", erp_codigo AS "erpCodigo",
                erp_hash AS "erpHash", deleted_at IS NOT NULL AS deleted
           FROM categories`,
      ),
      this.qr.query(
        `SELECT id, name, erp_empresa AS "erpEmpresa", erp_codigo AS "erpCodigo",
                erp_hash AS "erpHash", deleted_at IS NOT NULL AS deleted
           FROM sectors`,
      ),
      this.qr.query(
        `SELECT id, asset_code AS "assetCode", name, erp_empresa AS "erpEmpresa",
                erp_sequencial::text AS "erpSequencial", erp_hash AS "erpHash",
                deleted_at IS NOT NULL AS deleted
           FROM assets`,
      ),
    ]);
    return { categories, sectors, assets };
  }

  upsertCategories(records: CategoryRecord[]) {
    return upsertBatches(this.qr, 'categories', CATEGORY_COLUMNS, records as any);
  }

  upsertSectors(records: SectorRecord[]) {
    return upsertBatches(this.qr, 'sectors', SECTOR_COLUMNS, records as any);
  }

  upsertAssets(records: AssetRecord[]) {
    return upsertBatches(this.qr, 'assets', ASSET_COLUMNS, records as any);
  }
}

@Injectable()
export class ErpImportRepository implements ErpImportRepositoryPort {
  constructor(@InjectDataSource() private dataSource: DataSource) {}

  async run<T>(transactional: boolean, fn: (uow: ErpImportUnitOfWork) => Promise<T>): Promise<T> {
    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    try {
      if (!transactional) return await fn(new PgUnitOfWork(qr));
      await qr.startTransaction();
      try {
        const result = await fn(new PgUnitOfWork(qr));
        await qr.commitTransaction();
        return result;
      } catch (err) {
        await qr.rollbackTransaction();
        throw err;
      }
    } finally {
      await qr.release();
    }
  }
}
