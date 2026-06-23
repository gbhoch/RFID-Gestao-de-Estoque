import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { InventoryService } from '../src/modules/inventory/application/inventory.service';
import {
  InventorySessionOrmEntity, InventoryReadOrmEntity,
} from '../src/modules/inventory/infrastructure/inventory.orm-entity';
import { AssetOrmEntity } from '../src/modules/assets/infrastructure/asset.orm-entity';
import { RfidTagOrmEntity } from '../src/modules/rfid-tags/infrastructure/rfid-tag.orm-entity';

describe('InventoryService.finish', () => {
  let service: InventoryService;
  const session = { id: 's1', sectorId: 'sec1', status: 'in_progress', expectedCount: 10 };

  const sessions = {
    findOne: jest.fn(async () => ({ ...session })),
    save: jest.fn(async (s: any) => s),
  };
  const reads = {
    find: jest.fn(),
  };

  beforeEach(async () => {
    const mod = await Test.createTestingModule({
      providers: [
        InventoryService,
        { provide: getRepositoryToken(InventorySessionOrmEntity), useValue: sessions },
        { provide: getRepositoryToken(InventoryReadOrmEntity), useValue: reads },
        { provide: getRepositoryToken(AssetOrmEntity), useValue: {} },
        { provide: getRepositoryToken(RfidTagOrmEntity), useValue: {} },
      ],
    }).compile();
    service = mod.get(InventoryService);
    jest.clearAllMocks();
  });

  it('calcula 80% de acuracidade com 8 encontrados de 10 esperados', async () => {
    // 8 leituras válidas no setor (assets distintos), 1 fora do setor
    reads.find.mockResolvedValueOnce([
      ...Array.from({ length: 8 }, (_, i) => ({ assetId: `a${i}`, isUnexpected: false })),
      { assetId: 'x', isUnexpected: true },
    ]);
    const result: any = await service.finish('s1');
    expect(result.indicators.accuracyRate).toBe(80);
    expect(result.indicators.notFound).toBe(2);
    expect(result.indicators.foundOutsideSector).toBe(1);
    expect(result.status).toBe('finished');
  });

  it('ignora leituras duplicadas do mesmo asset na contagem de encontrados', async () => {
    reads.find.mockResolvedValueOnce([
      { assetId: 'a1', isUnexpected: false },
      { assetId: 'a1', isUnexpected: false }, // duplicada
      { assetId: 'a2', isUnexpected: false },
    ]);
    const result: any = await service.finish('s1');
    expect(result.foundCount).toBe(2); // a1 conta uma vez
  });
});
