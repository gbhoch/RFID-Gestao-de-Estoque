import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Not, Repository } from 'typeorm';
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

export interface SectorCount {
  sectorId: string;
  sector: string;
  count: number;
}

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
      activeTags, inventoriesThisMonth, bySector, byStatus, withoutSector,
    ] = await Promise.all([
      this.assets.count(),
      this.assets.count({ where: { status: 'in_use' } }),
      this.assets.count({ where: { status: 'maintenance' } }),
      this.assets.count({ where: { status: 'missing' } }),
      this.tags.count({ where: [{ status: 'active' }, { status: 'in_use' }] }),
      this.countInventoriesThisMonth(),
      this.assetsBySector(),
      this.assetsByStatus(),
      // Bens ativos (não baixados) sem setor — card próprio, fora do gráfico.
      this.assets.count({ where: { sectorId: IsNull(), status: Not('written_off') } }),
    ]);

    return {
      metrics: {
        totalAssets, inUse, maintenance, missing, activeTags, inventoriesThisMonth, withoutSector,
      },
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

  /**
   * Bens ativos por setor — lista COMPLETA, inclusive setores com 0 bens (no
   * fim). O frontend monta o top 10 + "Outros" do gráfico e o popup com ela.
   * Baixados (written_off) não estão fisicamente nos setores e ficam de fora;
   * sem setor vai para o card withoutSector. Agrupa por id porque sectors.name
   * não é único. Setor excluído só aparece se ainda tiver bem ativo apontando
   * para ele — assim a soma da lista + withoutSector fecha com o total ativo.
   */
  private async assetsBySector(): Promise<SectorCount[]> {
    const rows = await this.sectors
      .createQueryBuilder('s')
      .withDeleted() // o filtro de setor excluído é o HAVING abaixo
      .leftJoin(
        AssetOrmEntity, 'a',
        `a.sector_id = s.id AND a.deleted_at IS NULL AND a.status <> 'written_off'`,
      )
      .select('s.id', 'sectorId')
      .addSelect('s.name', 'sector')
      .addSelect('COUNT(a.id)', 'count')
      .groupBy('s.id')
      .addGroupBy('s.name')
      .having('s.deleted_at IS NULL OR COUNT(a.id) > 0')
      .orderBy('count', 'DESC')
      .addOrderBy('s.name', 'ASC') // desempate estável
      .getRawMany();

    return rows.map((r) => ({ sectorId: r.sectorId, sector: r.sector, count: Number(r.count) }));
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
