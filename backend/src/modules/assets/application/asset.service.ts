import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  Asset, AssetRepositoryPort, ASSET_REPOSITORY,
} from '../domain/asset';
import { CreateAssetDto, UpdateAssetDto, ListAssetQuery } from './dtos/asset.dto';

@Injectable()
export class AssetService {
  constructor(
    @Inject(ASSET_REPOSITORY) private readonly repo: AssetRepositoryPort,
  ) {}

  async create(dto: CreateAssetDto): Promise<Asset> {
    // Não copiar rfidTagId no assign: attachTag é quem associa a etiqueta (e faz
    // a transição de status), aplicando a regra de negócio "só associa se não houver".
    const { rfidTagId, ...rest } = dto;
    const asset = Object.assign(new Asset(), rest);
    if (rfidTagId) asset.attachTag(rfidTagId);
    return this.repo.create(asset);
  }

  async update(id: string, dto: UpdateAssetDto): Promise<Asset> {
    const existing = await this.repo.findById(id);
    if (!existing) throw new NotFoundException('Patrimônio não encontrado');
    return this.repo.update(id, dto);
  }

  async findOne(id: string): Promise<Asset> {
    const a = await this.repo.findById(id);
    if (!a) throw new NotFoundException('Patrimônio não encontrado');
    return a;
  }

  list(q: ListAssetQuery) {
    return this.repo.list({
      skip: Number(q.skip ?? 0),
      take: Number(q.take ?? 20),
      sectorId: q.sectorId,
      status: q.status,
      search: q.search,
    });
  }

  async remove(id: string): Promise<void> {
    await this.findOne(id);
    await this.repo.softDelete(id);
  }
}
