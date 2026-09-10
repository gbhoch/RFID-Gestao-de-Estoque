import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AssetOrmEntity } from '../../assets/infrastructure/asset.orm-entity';
import { RfidTagOrmEntity } from '../../rfid-tags/infrastructure/rfid-tag.orm-entity';
import { InventoryOrmEntity } from '../../inventory/infrastructure/inventory.orm-entity';
import { SectorOrmEntity } from '../../sectors/infrastructure/sector.orm-entity';

// Rótulos PT dos status de patrimônio — espelham os usados em assets.component.ts.
const ASSET_STATUS_LABELS: Record<string, string> = {
  available: 'Disponível',
  in_use: 'Em uso',
  maintenance: 'Em manutenção',
  reserved: 'Reservado',
  missing: 'Extraviado',
  loaned: 'Emprestado',
  written_off: 'Baixado',
  scrapped: 'Sucateado',
};

/**
 * Agrega indicadores reais para o dashboard a partir dos dados cadastrados.
 * Substitui os números ilustrativos que existiam no frontend.
 */
@Injectable()
export class DashboardService {
  constructor(
    @InjectRepository(AssetOrmEntity) private assets: Repository<AssetOrmEntity>,
    @InjectRepository(RfidTagOrmEntity) private tags: Repository<RfidTagOrmEntity>,
    @InjectRepository(InventoryOrmEntity)
    private inventories: Repository<InventoryOrmEntity>,
    @InjectRepository(SectorOrmEntity) private sectors: Repository<SectorOrmEntity>,
  ) {}

  async summary() {
    // count() respeita o soft delete automaticamente (coluna deleted_at).
    const [
      totalAssets, inUse, maintenance, missing,
      activeTags, inventoriesThisMonth, bySector, byStatus,
    ] = await Promise.all([
      this.assets.count(),
      this.assets.count({ where: { status: 'in_use' } }),
      this.assets.count({ where: { status: 'maintenance' } }),
      this.assets.count({ where: { status: 'missing' } }),
      this.tags.count({ where: [{ status: 'active' }, { status: 'in_use' }] }),
      this.countInventoriesThisMonth(),
      this.assetsBySector(),
      this.assetsByStatus(),
    ]);

    return {
      metrics: { totalAssets, inUse, maintenance, missing, activeTags, inventoriesThisMonth },
      bySector,
      byStatus,
    };
  }

  private countInventoriesThisMonth(): Promise<number> {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    return this.inventories
      .createQueryBuilder('s')
      .where('s.started_at >= :start', { start })
      .getCount();
  }

  private async assetsBySector(): Promise<Array<{ sector: string; count: number }>> {
    // QueryBuilder não aplica soft delete sozinho → filtro explícito de deleted_at.
    const rows = await this.assets
      .createQueryBuilder('a')
      .leftJoin(SectorOrmEntity, 's', 's.id = a.sector_id')
      .select(`COALESCE(s.name, 'Sem setor')`, 'sector')
      .addSelect('COUNT(a.id)', 'count')
      .where('a.deleted_at IS NULL')
      .groupBy('s.name')
      .orderBy('count', 'DESC')
      .getRawMany();
    return rows.map((r) => ({ sector: r.sector, count: Number(r.count) }));
  }

  private async assetsByStatus(): Promise<Array<{ status: string; count: number }>> {
    const rows = await this.assets
      .createQueryBuilder('a')
      .select('a.status', 'status')
      .addSelect('COUNT(a.id)', 'count')
      .where('a.deleted_at IS NULL')
      .groupBy('a.status')
      .getRawMany();
    return rows.map((r) => ({
      status: ASSET_STATUS_LABELS[r.status] ?? r.status,
      count: Number(r.count),
    }));
  }
}
