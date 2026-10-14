import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike, IsNull, Not, FindOptionsWhere } from 'typeorm';
import {
  Asset, AssetRepositoryPort, AssetStatusFilter, ACTIVE_STATUS_GROUP, NO_SECTOR,
  AssetSortField, SortDirection,
} from '../domain/asset';
import { AssetOrmEntity } from './asset.orm-entity';

@Injectable()
export class AssetRepository implements AssetRepositoryPort {
  constructor(
    @InjectRepository(AssetOrmEntity)
    private repo: Repository<AssetOrmEntity>,
  ) {}

  private toDomain(o: AssetOrmEntity): Asset {
    return Object.assign(new Asset(), o);
  }

  async create(asset: Asset): Promise<Asset> {
    const entity = this.repo.create(asset as any);
    const saved = await this.repo.save(entity as any);
    return this.toDomain(saved);
  }

  async update(id: string, patch: Partial<Asset>): Promise<Asset> {
    await this.repo.update(id, patch as any);
    return this.toDomain(await this.repo.findOneByOrFail({ id }));
  }

  async findById(id: string): Promise<Asset | null> {
    const o = await this.repo.findOneBy({ id });
    return o ? this.toDomain(o) : null;
  }

  async findByEpc(epc: string): Promise<Asset | null> {
    const o = await this.repo
      .createQueryBuilder('a')
      .innerJoin('rfid_tags', 't', 't.id = a.rfid_tag_id')
      .where('t.epc = :epc', { epc })
      .getOne();
    return o ? this.toDomain(o) : null;
  }

  async softDelete(id: string): Promise<void> {
    await this.repo.softDelete(id);
  }

  async list(params: {
    skip: number; take: number; sectorId?: string;
    status?: AssetStatusFilter; search?: string;
    sortBy: AssetSortField; sortDir: SortDirection;
  }) {
    const base: FindOptionsWhere<AssetOrmEntity> = {};
    if (params.sectorId === NO_SECTOR) base.sectorId = IsNull();
    else if (params.sectorId) base.sectorId = params.sectorId;
    if (params.status === ACTIVE_STATUS_GROUP) base.status = Not('written_off');
    else if (params.status) base.status = params.status;

    // Busca em nome OU código: array de where = OR (cada ramo repete os filtros).
    // Escapa os curingas do LIKE para o texto digitado ser literal.
    const term = params.search?.trim();
    const like = term ? ILike(`%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`) : undefined;
    const where = like ? [{ ...base, name: like }, { ...base, assetCode: like }] : base;

    // find* aplica o soft delete (deleted_at IS NULL) automaticamente.
    // findAndCount: o total é um COUNT com os mesmos filtros, sem skip/take.
    // O id desempata (status/nome repetem) para a paginação não pular nem
    // repetir linhas entre páginas.
    const [rows, total] = await this.repo.findAndCount({
      where,
      skip: params.skip,
      take: params.take,
      order: { [params.sortBy]: params.sortDir, id: 'ASC' },
    });
    return { data: rows.map((r) => this.toDomain(r)), total };
  }
}
