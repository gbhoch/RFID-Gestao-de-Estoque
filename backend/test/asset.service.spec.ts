import { Test } from '@nestjs/testing';
import { AssetService } from '../src/modules/assets/application/asset.service';
import { ASSET_REPOSITORY, Asset } from '../src/modules/assets/domain/asset';

describe('AssetService', () => {
  let service: AssetService;
  const repo = {
    create: jest.fn(async (a: Asset) => ({ ...a, id: 'uuid-1' })),
    findById: jest.fn(),
    update: jest.fn(),
    softDelete: jest.fn(),
    list: jest.fn(),
  };

  beforeEach(async () => {
    const mod = await Test.createTestingModule({
      providers: [AssetService, { provide: ASSET_REPOSITORY, useValue: repo }],
    }).compile();
    service = mod.get(AssetService);
    jest.clearAllMocks();
  });

  it('cria patrimônio e associa tag mudando status para in_use', async () => {
    const result = await service.create({
      assetCode: 'PAT-001', name: 'Notebook', categoryId: 'cat-1', rfidTagId: 'tag-1',
    } as any);
    expect(result.rfidTagId).toBe('tag-1');
    expect(result.status).toBe('in_use');
  });

  it('lança erro ao buscar patrimônio inexistente', async () => {
    repo.findById.mockResolvedValueOnce(null);
    await expect(service.findOne('x')).rejects.toThrow('não encontrado');
  });

  it('regra de domínio impede dupla associação de tag', () => {
    const asset = new Asset();
    asset.attachTag('tag-1');
    expect(() => asset.attachTag('tag-2')).toThrow();
  });
});
