import {
  Injectable, NotFoundException, BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import {
  InventorySessionOrmEntity, InventoryReadOrmEntity,
} from '../infrastructure/inventory.orm-entity';
import { AssetOrmEntity } from '../../assets/infrastructure/asset.orm-entity';
import { RfidTagOrmEntity } from '../../rfid-tags/infrastructure/rfid-tag.orm-entity';
import { StartInventoryDto, SubmitReadsDto } from './dtos/inventory.dto';

@Injectable()
export class InventoryService {
  constructor(
    @InjectRepository(InventorySessionOrmEntity)
    private sessions: Repository<InventorySessionOrmEntity>,
    @InjectRepository(InventoryReadOrmEntity)
    private reads: Repository<InventoryReadOrmEntity>,
    @InjectRepository(AssetOrmEntity)
    private assets: Repository<AssetOrmEntity>,
    @InjectRepository(RfidTagOrmEntity)
    private tags: Repository<RfidTagOrmEntity>,
  ) {}

  // 1. Inicia inventário: calcula quantidade esperada no setor.
  async start(dto: StartInventoryDto, userId: string) {
    const expected = await this.assets.count({ where: { sectorId: dto.sectorId } });
    return this.sessions.save(
      this.sessions.create({
        sectorId: dto.sectorId,
        userId,
        status: 'in_progress',
        expectedCount: expected,
      }),
    );
  }

  // 2-6. Recebe EPCs, resolve patrimônio, marca encontrados, detecta divergências.
  async submitReads(sessionId: string, dto: SubmitReadsDto, operatorId: string) {
    const session = await this.getOpenSession(sessionId);

    const epcs = dto.reads.map((r) => r.epc);
    const tags = await this.tags.find({ where: { epc: In(epcs) } });
    const tagByEpc = new Map(tags.map((t) => [t.epc, t]));

    const tagIds = tags.map((t) => t.id);
    const assetsForTags = tagIds.length
      ? await this.assets.find({ where: { rfidTagId: In(tagIds) } })
      : [];
    const assetByTagId = new Map(assetsForTags.map((a) => [a.rfidTagId, a]));

    const toSave: InventoryReadOrmEntity[] = dto.reads.map((r) => {
      const tag = tagByEpc.get(r.epc);
      const asset = tag ? assetByTagId.get(tag.id) : undefined;
      // Item lido mas que pertence a outro setor = divergência (fora do setor).
      const isUnexpected = !!asset && asset.sectorId !== session.sectorId;
      return this.reads.create({
        sessionId,
        epc: r.epc,
        assetId: asset?.id ?? null,
        rfidTagId: tag?.id ?? null,
        deviceId: r.deviceId,
        rssi: r.rssi,
        operatorId,
        isUnexpected,
      });
    });

    await this.reads.save(toSave);
    return { received: toSave.length };
  }

  // 7-8. Finaliza: consolida encontrados/divergentes e calcula acuracidade.
  async finish(sessionId: string) {
    const session = await this.getOpenSession(sessionId);

    const reads = await this.reads.find({ where: { sessionId } });
    const foundAssetIds = new Set(
      reads.filter((r) => r.assetId && !r.isUnexpected).map((r) => r.assetId),
    );
    const unexpected = reads.filter((r) => r.isUnexpected).length;

    const found = foundAssetIds.size;
    const expected = session.expectedCount;
    const notFound = Math.max(expected - found, 0);
    const divergent = notFound + unexpected;
    const accuracy = expected > 0 ? Number(((found / expected) * 100).toFixed(2)) : 100;

    session.foundCount = found;
    session.divergentCount = divergent;
    session.accuracyRate = accuracy;
    session.status = 'finished';
    session.finishedAt = new Date();
    await this.sessions.save(session);

    return {
      ...session,
      indicators: {
        accuracyRate: accuracy,
        notFound,
        foundOutsideSector: unexpected,
      },
    };
  }

  async report(sessionId: string) {
    const session = await this.sessions.findOne({ where: { id: sessionId } });
    if (!session) throw new NotFoundException('Inventário não encontrado');
    const reads = await this.reads.find({ where: { sessionId } });
    return { session, reads };
  }

  list(params: { skip?: number; take?: number }) {
    return this.sessions
      .findAndCount({
        skip: Number(params.skip ?? 0),
        take: Number(params.take ?? 20),
        order: { startedAt: 'DESC' },
      })
      .then(([data, total]) => ({ data, total }));
  }

  private async getOpenSession(id: string) {
    const session = await this.sessions.findOne({ where: { id } });
    if (!session) throw new NotFoundException('Inventário não encontrado');
    if (session.status === 'finished' || session.status === 'cancelled')
      throw new BadRequestException('Inventário já encerrado');
    return session;
  }
}
