import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import {
  AssetMovementOrmEntity, AssetLocationHistoryOrmEntity,
} from '../infrastructure/movement.orm-entity';
import { AssetOrmEntity } from '../../assets/infrastructure/asset.orm-entity';
import { CreateMovementDto } from './dtos/movement.dto';

// Mapeia o tipo de movimentação para o status resultante do ativo.
const STATUS_BY_TYPE: Record<string, string | undefined> = {
  sector_transfer: undefined,      // mantém status
  owner_change: undefined,
  loan: 'loaned',
  write_off: 'written_off',
  maintenance_return: 'available',
};

@Injectable()
export class MovementService {
  constructor(
    @InjectRepository(AssetMovementOrmEntity)
    private movements: Repository<AssetMovementOrmEntity>,
    private dataSource: DataSource,
  ) {}

  async register(dto: CreateMovementDto, userId: string) {
    return this.dataSource.transaction(async (m) => {
      const asset = await m.findOne(AssetOrmEntity, { where: { id: dto.assetId } });
      if (!asset) throw new NotFoundException('Patrimônio não encontrado');

      const fromSectorId = asset.sectorId;
      const fromOwnerId = asset.ownerId;

      // Aplica mudanças no ativo
      if (dto.toSectorId) asset.sectorId = dto.toSectorId;
      if (dto.toOwnerId) asset.ownerId = dto.toOwnerId;
      const newStatus = STATUS_BY_TYPE[dto.type];
      if (newStatus) asset.status = newStatus;
      await m.save(asset);

      // Grava movimentação (histórico imutável)
      const movement = await m.save(
        m.create(AssetMovementOrmEntity, {
          assetId: dto.assetId,
          type: dto.type,
          userId,
          fromSectorId,
          toSectorId: dto.toSectorId ?? fromSectorId,
          fromOwnerId,
          toOwnerId: dto.toOwnerId ?? fromOwnerId,
          notes: dto.notes,
        }),
      );

      // Atualiza histórico de localização se o setor mudou
      if (dto.toSectorId && dto.toSectorId !== fromSectorId) {
        await m.save(
          m.create(AssetLocationHistoryOrmEntity, {
            assetId: dto.assetId,
            sectorId: dto.toSectorId,
            userId,
          }),
        );
      }
      return movement;
    });
  }

  async listByAsset(assetId: string) {
    return this.movements.find({
      where: { assetId },
      order: { occurredAt: 'DESC' },
    });
  }

  async list(params: { skip?: number; take?: number }) {
    const [data, total] = await this.movements.findAndCount({
      skip: Number(params.skip ?? 0),
      take: Number(params.take ?? 20),
      order: { occurredAt: 'DESC' },
    });
    return { data, total };
  }

  async locationHistory(assetId: string) {
    return this.dataSource.getRepository(AssetLocationHistoryOrmEntity).find({
      where: { assetId },
      order: { recordedAt: 'ASC' },
    });
  }
}
