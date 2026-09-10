import {
  Injectable, NotFoundException, BadRequestException, ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, Like, DataSource, Not, IsNull } from 'typeorm';
import {
  InventoryOrmEntity, InventorySectorVisitOrmEntity,
  InventoryReadOrmEntity, InventoryDiscrepancyOrmEntity,
} from '../infrastructure/inventory.orm-entity';
import { AssetOrmEntity } from '../../assets/infrastructure/asset.orm-entity';
import { RfidTagOrmEntity } from '../../rfid-tags/infrastructure/rfid-tag.orm-entity';
import {
  AssetMovementOrmEntity, AssetLocationHistoryOrmEntity,
} from '../../movements/infrastructure/movement.orm-entity';
import { reconcile, ExpectedAsset, ReadFact } from '../domain/reconciliation';
import {
  CreateInventoryDto, SelectSectorDto, AddReadsDto, ResolveDiscrepancyDto,
} from './dtos/inventory.dto';

const OPEN_STATUSES = ['in_progress', 'paused'];

// Desfechos aplicáveis a cada tipo de divergência ('justified' vale para todos).
const RESOLUTIONS_BY_TYPE: Record<string, string[]> = {
  location_mismatch: ['accept_location', 'justified'],
  not_found: ['mark_missing', 'justified'],
  unknown_tag: ['register_tag', 'justified'],
};

@Injectable()
export class InventoryService {
  constructor(
    @InjectRepository(InventoryOrmEntity) private inventories: Repository<InventoryOrmEntity>,
    @InjectRepository(InventorySectorVisitOrmEntity) private visits: Repository<InventorySectorVisitOrmEntity>,
    @InjectRepository(InventoryReadOrmEntity) private reads: Repository<InventoryReadOrmEntity>,
    @InjectRepository(InventoryDiscrepancyOrmEntity) private discrepancies: Repository<InventoryDiscrepancyOrmEntity>,
    @InjectRepository(AssetOrmEntity) private assets: Repository<AssetOrmEntity>,
    @InjectRepository(RfidTagOrmEntity) private tags: Repository<RfidTagOrmEntity>,
    private dataSource: DataSource,
  ) {}

  // ---- Ciclo de vida ----
  async create(dto: CreateInventoryDto, userId: string) {
    // Regra: só pode existir UM inventário aberto (in_progress ou paused) por vez.
    const open = await this.inventories.findOne({ where: { status: In(OPEN_STATUSES) } });
    if (open) throw new ConflictException('Já existe um inventário aberto (in_progress ou paused)');
    const code = await this.nextCode();
    return this.inventories.save(this.inventories.create({
      code,
      description: dto.description ?? null,
      status: 'in_progress',
      createdByUserId: userId,
    }));
  }

  current() {
    return this.inventories.findOne({
      where: { status: In(OPEN_STATUSES) }, order: { startedAt: 'DESC' },
    });
  }

  async list(params: { skip?: number; take?: number }) {
    // Number(x)||default protege contra NaN (query ausente com transform:true).
    const [rows, total] = await this.inventories.findAndCount({
      skip: Number(params.skip) || 0,
      take: Number(params.take) || 20,
      order: { startedAt: 'DESC' },
    });
    // Enriquecer a página com contadores (setores e divergências) para o histórico.
    const ids = rows.map((r) => r.id);
    const sectorCount = new Map<string, number>();
    const discCount = new Map<string, number>();
    const unresolvedCount = new Map<string, number>();
    if (ids.length) {
      for (const r of await this.visits.createQueryBuilder('v')
        .select('v.inventory_id', 'id').addSelect('COUNT(*)', 'c')
        .where('v.inventory_id IN (:...ids)', { ids }).groupBy('v.inventory_id').getRawMany()) {
        sectorCount.set(r.id, Number(r.c));
      }
      for (const r of await this.discrepancies.createQueryBuilder('d')
        .select('d.inventory_id', 'id').addSelect('COUNT(*)', 'c')
        .addSelect('COUNT(*) FILTER (WHERE d.resolution IS NULL)', 'u')
        .where('d.inventory_id IN (:...ids)', { ids }).groupBy('d.inventory_id').getRawMany()) {
        discCount.set(r.id, Number(r.c));
        unresolvedCount.set(r.id, Number(r.u));
      }
    }
    const data = rows.map((r) => ({
      ...r,
      sectorCount: sectorCount.get(r.id) ?? 0,
      discrepancyCount: discCount.get(r.id) ?? 0,
      unresolvedCount: unresolvedCount.get(r.id) ?? 0,
    }));
    return { data, total };
  }

  async findOne(id: string) {
    const inv = await this.inventories.findOne({ where: { id } });
    if (!inv) throw new NotFoundException('Inventário não encontrado');
    return inv;
  }

  /** Detalhe com visitas e resumo de divergências (para a tela de conciliação). */
  async detail(id: string) {
    const inv = await this.findOne(id);
    const visits = await this.visits.find({ where: { inventoryId: id }, order: { startedAt: 'ASC' } });
    const readCount = await this.reads.count({ where: { inventoryId: id } });
    const discs = await this.discrepancies.find({ where: { inventoryId: id } });
    const byType = discs.reduce((acc, d) => {
      acc[d.type] = (acc[d.type] ?? 0) + 1; return acc;
    }, {} as Record<string, number>);
    const unresolved = discs.filter((d) => !d.resolution).length;
    const accuracyRate = inv.expectedCount
      ? Number((((inv.conformCount ?? 0) / inv.expectedCount) * 100).toFixed(2))
      : null;
    return {
      ...inv,
      visits,
      readCount,
      discrepancies: { total: discs.length, byType, unresolved },
      accuracyRate,
    };
  }

  async pause(id: string) {
    const inv = await this.getOpen(id);
    inv.status = 'paused';                // nenhum cálculo ao pausar
    return this.inventories.save(inv);
  }

  async resume(id: string) {
    const inv = await this.findOne(id);
    if (inv.status !== 'paused')
      throw new BadRequestException('Só é possível retomar um inventário pausado');
    inv.status = 'in_progress';           // startedAt NÃO muda ao retomar
    return this.inventories.save(inv);
  }

  // ---- Setores visitados (escopo aberto) ----
  async selectSector(id: string, dto: SelectSectorDto) {
    const inv = await this.getOpen(id);
    let visit = await this.visits.findOne({ where: { inventoryId: inv.id, sectorId: dto.sectorId } });
    if (!visit) {
      visit = this.visits.create({ inventoryId: inv.id, sectorId: dto.sectorId, status: 'in_progress' });
    } else if (visit.status === 'completed') {
      visit.status = 'in_progress';       // reabrir para leituras adicionais
      visit.completedAt = null;
    }
    return this.visits.save(visit);
  }

  async completeSector(id: string, visitId: string) {
    await this.getOpen(id);
    const visit = await this.getVisit(id, visitId);
    visit.status = 'completed';
    visit.completedAt = new Date();
    return this.visits.save(visit);
  }

  // ---- Leituras: FATO BRUTO, sem julgamento ----
  async addReads(id: string, dto: AddReadsDto, operatorId: string) {
    const inv = await this.findOne(id);

    // Inventário encerrado responde 409 (não 400) com código legível por máquina:
    // o coletor Android trata 4xx como rejeição definitiva e DESCARTA a coleta.
    // O 409 é o sinal de "segure para revisão" — o gestor pode reopen() e o
    // próximo sync sobe a leitura em vez de perdê-la.
    if (!OPEN_STATUSES.includes(inv.status))
      throw new ConflictException({
        code: 'INVENTORY_FINISHED',
        message: `Inventário ${inv.code} já encerrado`,
      });

    // 'paused' também aceita leitura: leitura é fato bruto, pausa é estado de
    // operação. Uma coleta offline pode chegar depois de o gestor pausar, e
    // recusá-la perderia trabalho de campo já feito.
    const visit = await this.getVisit(id, dto.sectorVisitId);
    if (visit.status === 'completed') {
      // Coleta que chegou tarde reabre o setor — mesma regra de selectSector().
      visit.status = 'in_progress';
      visit.completedAt = null;
      await this.visits.save(visit);
    }

    if (!dto.reads.length) return { received: 0, inserted: 0 };

    const resolved = await this.resolveEpcs(dto.reads.map((r) => r.epc));
    const rows = dto.reads.map((r) => {
      const res = resolved.get(r.epc);
      return this.reads.create({
        inventoryId: inv.id,
        sectorVisitId: visit.id,
        epc: r.epc,
        assetId: res?.assetId ?? null,
        rfidTagId: res?.tagId ?? null,
        deviceId: r.deviceId ?? null,
        rssi: r.rssi ?? null,
        operatorId,
        readAt: r.readAt ? new Date(r.readAt) : new Date(),
        clientBatchId: dto.clientBatchId ?? null,
        readCount: r.readCount ?? 1,
        tid: r.tid ?? null,
      });
    });

    // orIgnore() = ON CONFLICT DO NOTHING sobre o índice único parcial
    // (client_batch_id, epc). É o que torna o reenvio do coletor inofensivo:
    // ele repete o lote quando a resposta se perde, e a segunda vez é no-op.
    const result = await this.reads.createQueryBuilder()
      .insert().values(rows).orIgnore().execute();
    const inserted = Array.isArray(result.raw) ? result.raw.length : rows.length;
    return { received: rows.length, inserted };
  }

  // ---- Painel visual (tempo real; NÃO persiste julgamento) ----
  async panel(id: string, visitId: string) {
    await this.findOne(id);
    const visit = await this.getVisit(id, visitId);

    const expectedAssets = await this.assets.find({ where: { sectorId: visit.sectorId } });
    const tagIds = expectedAssets.map((a) => a.rfidTagId).filter(Boolean) as string[];
    const tagsById = new Map(
      (tagIds.length ? await this.tags.find({ where: { id: In(tagIds) } }) : []).map((t) => [t.id, t]),
    );

    // Onde cada EPC apareceu neste inventário (para marcar "lido em outro setor").
    const allReads = await this.reads.find({ where: { inventoryId: id } });
    const sectorByVisitId = new Map(
      (await this.visits.find({ where: { inventoryId: id } })).map((v) => [v.id, v.sectorId]),
    );
    const sectorsByEpc = new Map<string, Set<string>>();
    for (const r of allReads) {
      const sec = sectorByVisitId.get(r.sectorVisitId);
      if (!sec) continue;
      (sectorsByEpc.get(r.epc) ?? sectorsByEpc.set(r.epc, new Set()).get(r.epc)!).add(sec);
    }

    const expected = expectedAssets.map((a) => {
      const epc = a.rfidTagId ? tagsById.get(a.rfidTagId)?.epc ?? null : null;
      const secs = epc ? sectorsByEpc.get(epc) : undefined;
      let situation: 'read_here' | 'read_elsewhere' | 'not_read';
      let otherSectorId: string | null = null;
      if (secs?.has(visit.sectorId)) situation = 'read_here';
      else if (secs && secs.size > 0) { situation = 'read_elsewhere'; otherSectorId = [...secs][0]; }
      else situation = 'not_read';
      return { assetId: a.id, assetCode: a.assetCode, name: a.name, epc, status: a.status, situation, otherSectorId };
    });

    const hereReads = allReads.filter((r) => r.sectorVisitId === visit.id);
    const epcSet = [...new Set(hereReads.map((r) => r.epc))];
    const assetByEpc = await this.resolveEpcs(epcSet);
    // Código/nome do patrimônio vinculado a cada leitura (para exibição).
    const readAssetIds = [...new Set([...assetByEpc.values()].map((v) => v.assetId).filter(Boolean))] as string[];
    const assetById = new Map(
      (readAssetIds.length ? await this.assets.find({ where: { id: In(readAssetIds) } }) : [])
        .map((a) => [a.id, a]),
    );
    const read = epcSet.map((epc) => {
      const group = hereReads.filter((r) => r.epc === epc);
      const lastReadAt = group.reduce((m, r) => (r.readAt > m ? r.readAt : m), group[0].readAt);
      const res = assetByEpc.get(epc);
      const asset = res?.assetId ? assetById.get(res.assetId) : undefined;
      let flag: 'ok' | 'other_sector' | 'unknown';
      let ownerSectorId: string | null = null;
      if (!res?.assetId) flag = 'unknown';
      else if (res.sectorId === visit.sectorId) flag = 'ok';
      else { flag = 'other_sector'; ownerSectorId = res.sectorId; }
      return {
        epc, assetId: res?.assetId ?? null,
        assetCode: asset?.assetCode ?? null, assetName: asset?.name ?? null,
        count: group.length, lastReadAt, flag, ownerSectorId,
      };
    });

    return { expected, read };
  }

  // ---- Finalização: dispara a CONCILIAÇÃO (transacional) ----
  async finish(id: string) {
    return this.dataSource.transaction(async (m) => {
      const inv = await m.findOne(InventoryOrmEntity, { where: { id } });
      if (!inv) throw new NotFoundException('Inventário não encontrado');
      if (!OPEN_STATUSES.includes(inv.status)) throw new BadRequestException('Inventário já encerrado');

      // SETORES_VISITADOS = visitas 'completed'.
      const completedVisits = await m.find(InventorySectorVisitOrmEntity, {
        where: { inventoryId: id, status: 'completed' },
      });
      const visitedSectorIds = [...new Set(completedVisits.map((v) => v.sectorId))];
      const completedVisitIds = new Set(completedVisits.map((v) => v.id));
      const sectorByVisitId = new Map(completedVisits.map((v) => [v.id, v.sectorId]));

      // ATIVOS_ESPERADOS = assets nesses setores (deleted_at null; inclui maintenance/loaned).
      const expectedAssetsRaw = visitedSectorIds.length
        ? await m.find(AssetOrmEntity, { where: { sectorId: In(visitedSectorIds) } })
        : [];

      // LEITURAS restritas a setores completed.
      const allReads = await m.find(InventoryReadOrmEntity, { where: { inventoryId: id } });
      const reads: ReadFact[] = allReads
        .filter((r) => completedVisitIds.has(r.sectorVisitId))
        .map((r) => ({ epc: r.epc, sectorId: sectorByVisitId.get(r.sectorVisitId)!, readAt: r.readAt }));

      // Resolve EPCs -> tag -> asset.
      const readEpcs = [...new Set(reads.map((r) => r.epc))];
      const tagsByEpc = readEpcs.length
        ? new Map((await m.find(RfidTagOrmEntity, { where: { epc: In(readEpcs) } })).map((t) => [t.epc, t]))
        : new Map<string, RfidTagOrmEntity>();
      const expectedTagIds = expectedAssetsRaw.map((a) => a.rfidTagId).filter(Boolean) as string[];
      const epcByTagId = new Map(
        (expectedTagIds.length ? await m.find(RfidTagOrmEntity, { where: { id: In(expectedTagIds) } }) : [])
          .map((t) => [t.id, t.epc]),
      );
      const readTagIds = [...tagsByEpc.values()].map((t) => t.id);
      const assetsByTagId = new Map(
        (readTagIds.length ? await m.find(AssetOrmEntity, { where: { rfidTagId: In(readTagIds) } }) : [])
          .map((a) => [a.rfidTagId, a]),
      );
      const epcToAsset = new Map<string, { assetId: string; sectorId: string }>();
      for (const [epc, tag] of tagsByEpc) {
        const asset = assetsByTagId.get(tag.id);
        if (asset) epcToAsset.set(epc, { assetId: asset.id, sectorId: asset.sectorId });
      }

      const expectedAssets: ExpectedAsset[] = expectedAssetsRaw.map((a) => ({
        assetId: a.id,
        epc: a.rfidTagId ? epcByTagId.get(a.rfidTagId) ?? null : null,
        sectorId: a.sectorId,
      }));

      const result = reconcile({ visitedSectorIds, expectedAssets, reads, epcToAsset });

      if (result.discrepancies.length) {
        await m.save(result.discrepancies.map((d) =>
          m.create(InventoryDiscrepancyOrmEntity, {
            inventoryId: id, type: d.type, assetId: d.assetId, epc: d.epc,
            expectedSectorId: d.expectedSectorId, foundSectorId: d.foundSectorId,
          }),
        ));
      }

      // Ativos fora do escopo: vivos, cujo setor não foi visitado (ou sem setor).
      const oosQb = m.createQueryBuilder(AssetOrmEntity, 'a').where('a.deleted_at IS NULL');
      if (visitedSectorIds.length)
        oosQb.andWhere('(a.sector_id IS NULL OR a.sector_id NOT IN (:...v))', { v: visitedSectorIds });
      const outOfScopeCount = await oosQb.getCount();

      inv.status = 'finished';
      inv.finishedAt = new Date();
      inv.expectedCount = result.expectedCount;
      inv.conformCount = result.conformCount;
      inv.outOfScopeCount = outOfScopeCount;
      await m.save(inv);

      return {
        ...inv,
        discrepancyCount: result.discrepancies.length,
        conformCount: result.conformCount,
        expectedCount: result.expectedCount,
        outOfScopeCount,
      };
    });
  }

  /**
   * Reabre um inventário encerrado para absorver coleta que chegou tarde —
   * tipicamente um coletor que ficou offline e sincronizou depois do fechamento.
   *
   * Só é permitido enquanto NENHUMA divergência foi resolvida: `accept_location`
   * move o ativo e cria AssetMovement + histórico, `mark_missing` altera o status
   * do ativo. Nada disso é reversível, então depois da primeira resolução o
   * caminho correto é abrir um novo inventário.
   *
   * As divergências são descartadas na reabertura porque a conciliação é uma
   * função pura sem estado intermediário: o próximo finish() recalcula tudo do
   * zero, já com as leituras que chegaram depois.
   */
  async reopen(id: string) {
    return this.dataSource.transaction(async (m) => {
      const inv = await m.findOne(InventoryOrmEntity, { where: { id } });
      if (!inv) throw new NotFoundException('Inventário não encontrado');
      if (OPEN_STATUSES.includes(inv.status))
        throw new BadRequestException('Inventário já está aberto');

      // Mesma regra do create(): só um inventário aberto por vez.
      const open = await m.findOne(InventoryOrmEntity, { where: { status: In(OPEN_STATUSES) } });
      if (open) throw new ConflictException(`Já existe um inventário aberto (${open.code})`);

      const resolved = await m.count(InventoryDiscrepancyOrmEntity, {
        where: { inventoryId: id, resolution: Not(IsNull()) },
      });
      if (resolved)
        throw new ConflictException(
          `${resolved} divergência(s) já resolvida(s) — reabrir desfaria movimentações ` +
          'de ativo já efetivadas. Abra um novo inventário.',
        );

      await m.delete(InventoryDiscrepancyOrmEntity, { inventoryId: id });
      inv.status = 'in_progress';
      inv.finishedAt = null;
      inv.expectedCount = null;
      inv.conformCount = null;
      inv.outOfScopeCount = null;
      return m.save(inv);
    });
  }

  // ---- Divergências ----
  async discrepanciesList(id: string) {
    await this.findOne(id);
    return this.discrepancies.find({ where: { inventoryId: id }, order: { createdAt: 'ASC' } });
  }

  async resolve(id: string, discrepancyId: string, dto: ResolveDiscrepancyDto, userId: string) {
    return this.dataSource.transaction(async (m) => {
      const inv = await m.findOne(InventoryOrmEntity, { where: { id } });
      if (!inv) throw new NotFoundException('Inventário não encontrado');
      const disc = await m.findOne(InventoryDiscrepancyOrmEntity, {
        where: { id: discrepancyId, inventoryId: id },
      });
      if (!disc) throw new NotFoundException('Divergência não encontrada');
      if (disc.resolution) throw new BadRequestException('Divergência já resolvida');
      if (!RESOLUTIONS_BY_TYPE[disc.type]?.includes(dto.resolution))
        throw new BadRequestException(`Desfecho '${dto.resolution}' não se aplica a '${disc.type}'`);

      switch (dto.resolution) {
        case 'accept_location': {
          // Aceita a nova localização: move o ativo e registra AssetMovement + histórico.
          const asset = await m.findOne(AssetOrmEntity, { where: { id: disc.assetId } });
          if (!asset) throw new NotFoundException('Patrimônio da divergência não encontrado');
          const fromSectorId = asset.sectorId;
          asset.sectorId = disc.foundSectorId;
          await m.save(asset);
          await m.save(m.create(AssetMovementOrmEntity, {
            assetId: asset.id, type: 'sector_transfer', userId,
            fromSectorId, toSectorId: disc.foundSectorId,
            fromOwnerId: asset.ownerId, toOwnerId: asset.ownerId,
            notes: `Ajuste por inventário ${inv.code}`,
          }));
          await m.save(m.create(AssetLocationHistoryOrmEntity, {
            assetId: asset.id, sectorId: disc.foundSectorId, userId,
          }));
          break;
        }
        case 'justified':
          break; // não altera o ativo; notes obrigatório (validado no DTO)
        case 'mark_missing': {
          const asset = await m.findOne(AssetOrmEntity, { where: { id: disc.assetId } });
          if (!asset) throw new NotFoundException('Patrimônio da divergência não encontrado');
          asset.status = 'missing';
          await m.save(asset);
          break;
        }
        case 'register_tag': {
          const existing = await m.findOne(RfidTagOrmEntity, { where: { epc: disc.epc } });
          if (!existing) {
            await m.save(m.create(RfidTagOrmEntity, { epc: disc.epc, status: 'active', source: 'reader' }));
          }
          break;
        }
      }

      disc.resolution = dto.resolution;
      disc.resolutionNotes = dto.resolutionNotes ?? null;
      disc.resolvedByUserId = userId;
      disc.resolvedAt = new Date();
      return m.save(disc);
    });
  }

  // ---- Helpers ----
  private async nextCode() {
    const year = new Date().getFullYear();
    const prefix = `INV-${year}-`;
    const count = await this.inventories.count({ where: { code: Like(`${prefix}%`) } });
    return `${prefix}${String(count + 1).padStart(3, '0')}`;
  }

  private async getOpen(id: string) {
    const inv = await this.findOne(id);
    if (!OPEN_STATUSES.includes(inv.status)) throw new BadRequestException('Inventário já encerrado');
    return inv;
  }

  private async getVisit(inventoryId: string, visitId: string) {
    const visit = await this.visits.findOne({ where: { id: visitId, inventoryId } });
    if (!visit) throw new NotFoundException('Setor (visita) não encontrado neste inventário');
    return visit;
  }

  /** Resolve cada EPC para { assetId, tagId, sectorId } (nulos quando não há tag/ativo). */
  private async resolveEpcs(epcs: string[]) {
    const map = new Map<string, { assetId: string | null; tagId: string | null; sectorId: string | null }>();
    const uniq = [...new Set(epcs)];
    if (!uniq.length) return map;
    const tags = await this.tags.find({ where: { epc: In(uniq) } });
    const tagByEpc = new Map(tags.map((t) => [t.epc, t]));
    const tagIds = tags.map((t) => t.id);
    const assetsForTags = tagIds.length ? await this.assets.find({ where: { rfidTagId: In(tagIds) } }) : [];
    const assetByTagId = new Map(assetsForTags.map((a) => [a.rfidTagId, a]));
    for (const epc of uniq) {
      const tag = tagByEpc.get(epc);
      const asset = tag ? assetByTagId.get(tag.id) : undefined;
      map.set(epc, { assetId: asset?.id ?? null, tagId: tag?.id ?? null, sectorId: asset?.sectorId ?? null });
    }
    return map;
  }
}
