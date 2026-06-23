import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike } from 'typeorm';
import { Asset, AssetRepositoryPort, AssetStatus } from '../domain/asset';
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
    status?: AssetStatus; search?: string;
  }) {
    const where: any = {};
    if (params.sectorId) where.sectorId = params.sectorId;
    if (params.status) where.status = params.status;
    if (params.search) where.name = ILike(`%${params.search}%`);

    const [rows, total] = await this.repo.findAndCount({
      where,
      skip: params.skip,
      take: params.take,
      order: { createdAt: 'DESC' },
    });
    return { data: rows.map((r) => this.toDomain(r)), total };
  }
}
