import { BadRequestException, ConflictException } from '@nestjs/common';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { InventoryService } from '../src/modules/inventory/application/inventory.service';

/**
 * Contrato do coletor Android (RfidInventory) com o inventário.
 *
 * Os três comportamentos cobertos aqui existem porque o coletor lê offline e
 * sincroniza depois — e cada um deles, se quebrar, custa coleta de campo:
 *  - reenvio do mesmo lote não pode duplicar leitura;
 *  - setor já concluído tem de reabrir, não recusar;
 *  - inventário encerrado tem de responder 409 (segure para revisão), nunca
 *    400 (que o app trata como rejeição definitiva e descarta).
 */
describe('InventoryService — ingestão do coletor', () => {
  const VISIT = 'visit-1';
  const INV = 'inv-1';

  let inventory: any;
  let visit: any;
  let insertBuilder: any;
  let service: InventoryService;

  beforeEach(() => {
    inventory = { id: INV, code: 'INV-2026-001', status: 'in_progress' };
    visit = { id: VISIT, inventoryId: INV, sectorId: 'sector-ti', status: 'in_progress' };

    insertBuilder = {
      insert: jest.fn().mockReturnThis(),
      values: jest.fn().mockReturnThis(),
      orIgnore: jest.fn().mockReturnThis(),
      execute: jest.fn(async () => ({ raw: insertBuilder.values.mock.calls.at(-1)[0] })),
    };

    const inventories = { findOne: jest.fn(async () => inventory) };
    const visits = { findOne: jest.fn(async () => visit), save: jest.fn(async (v: any) => v) };
    const reads = {
      create: jest.fn((row: any) => row),
      createQueryBuilder: jest.fn(() => insertBuilder),
    };
    const tags = { find: jest.fn(async () => []) };
    const assets = { find: jest.fn(async () => []) };

    service = new InventoryService(
      inventories as any, visits as any, reads as any, {} as any,
      assets as any, tags as any, {} as any,
    );
  });

  const batch = (over: any = {}) => ({
    sectorVisitId: VISIT,
    clientBatchId: '11111111-1111-4111-8111-111111111111',
    reads: [{ epc: 'E280110000', rssi: -55, readCount: 42, tid: 'E2003412' }],
    ...over,
  });

  it('grava com ON CONFLICT DO NOTHING e propaga clientBatchId/readCount/tid', async () => {
    const result = await service.addReads(INV, batch() as any, 'op-1');

    expect(insertBuilder.orIgnore).toHaveBeenCalled();
    expect(result).toEqual({ received: 1, inserted: 1 });

    const [row] = insertBuilder.values.mock.calls.at(-1)![0];
    expect(row).toMatchObject({
      epc: 'E280110000',
      clientBatchId: '11111111-1111-4111-8111-111111111111',
      readCount: 42,
      tid: 'E2003412',
      operatorId: 'op-1',
      sectorVisitId: VISIT,
    });
  });

  it('reenvio do mesmo lote é no-op: nada inserido, nenhum erro', async () => {
    insertBuilder.execute.mockResolvedValueOnce({ raw: [] }); // tudo em conflito
    const result = await service.addReads(INV, batch() as any, 'op-1');
    expect(result).toEqual({ received: 1, inserted: 0 });
  });

  it('captura pela web (sem clientBatchId) continua gravando normalmente', async () => {
    const result = await service.addReads(
      INV, { sectorVisitId: VISIT, reads: [{ epc: 'E2801100FF' }] } as any, 'op-1',
    );
    expect(result.inserted).toBe(1);
    const [row] = insertBuilder.values.mock.calls.at(-1)![0];
    expect(row.clientBatchId).toBeNull();
    expect(row.readCount).toBe(1);
  });

  it('coleta tardia REABRE o setor concluído em vez de recusar', async () => {
    visit.status = 'completed';
    visit.completedAt = new Date();

    await service.addReads(INV, batch() as any, 'op-1');

    expect(visit.status).toBe('in_progress');
    expect(visit.completedAt).toBeNull();
  });

  it('inventário pausado aceita leitura (leitura é fato bruto)', async () => {
    inventory.status = 'paused';
    await expect(service.addReads(INV, batch() as any, 'op-1')).resolves.toMatchObject({ received: 1 });
  });

  it('inventário encerrado responde 409 INVENTORY_FINISHED, não 400', async () => {
    inventory.status = 'finished';

    const err = await service.addReads(INV, batch() as any, 'op-1').catch((e) => e);
    expect(err).toBeInstanceOf(ConflictException);
    expect(err.getResponse()).toMatchObject({ code: 'INVENTORY_FINISHED' });
  });

  it('lote vazio não monta insert', async () => {
    const result = await service.addReads(INV, batch({ reads: [] }) as any, 'op-1');
    expect(result).toEqual({ received: 0, inserted: 0 });
    expect(insertBuilder.execute).not.toHaveBeenCalled();
  });
});

describe('InventoryService.reopen', () => {
  function build(over: { status?: string; resolvedCount?: number; openOther?: any } = {}) {
    const inv = { id: 'inv-1', code: 'INV-2026-001', status: over.status ?? 'finished' };
    const manager = {
      findOne: jest.fn(async (entity: any, opts: any) => {
        // Segunda forma de busca do reopen(): "existe outro inventário aberto?".
        if (opts?.where?.status) return over.openOther ?? null;
        return inv;
      }),
      count: jest.fn(async () => over.resolvedCount ?? 0),
      delete: jest.fn(async () => ({ affected: 0 })),
      save: jest.fn(async (e: any) => e),
    };
    const dataSource = { transaction: jest.fn((cb: any) => cb(manager)) };
    const service = new InventoryService(
      {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, dataSource as any,
    );
    return { service, inv, manager };
  }

  it('reabre e limpa o snapshot da conciliação para o finish() recalcular do zero', async () => {
    const { service, inv, manager } = build();
    const result: any = await service.reopen('inv-1');

    expect(result.status).toBe('in_progress');
    expect(result.finishedAt).toBeNull();
    expect(result.expectedCount).toBeNull();
    expect(result.conformCount).toBeNull();
    expect(manager.delete).toHaveBeenCalled(); // divergências descartadas
    expect(inv.status).toBe('in_progress');
  });

  it('recusa se alguma divergência já foi resolvida (movimentação não é reversível)', async () => {
    const { service } = build({ resolvedCount: 2 });
    await expect(service.reopen('inv-1')).rejects.toThrow(ConflictException);
  });

  it('recusa se já existe outro inventário aberto', async () => {
    const { service } = build({ openOther: { id: 'inv-2', code: 'INV-2026-002' } });
    await expect(service.reopen('inv-1')).rejects.toThrow('INV-2026-002');
  });
});

/**
 * O serviço lança ConflictException com { code, message }, mas quem monta a
 * resposta HTTP é o filtro global. Este teste cobre a emenda entre os dois:
 * sem ele, o serviço passava e o `code` sumia no caminho até o cliente.
 */
describe('AllExceptionsFilter — código legível por máquina', () => {
  function run(exception: unknown) {
    const json = jest.fn();
    const status = jest.fn(() => ({ json }));
    const host: any = {
      switchToHttp: () => ({
        getResponse: () => ({ status }),
        getRequest: () => ({ url: '/api/v1/inventory/x/reads' }),
      }),
    };
    new AllExceptionsFilter().catch(exception, host);
    return { status, body: json.mock.calls[0][0] };
  }

  it('propaga o code de INVENTORY_FINISHED junto do 409', () => {
    const { status, body } = run(
      new ConflictException({ code: 'INVENTORY_FINISHED', message: 'Inventário INV-1 já encerrado' }),
    );
    expect(status).toHaveBeenCalledWith(409);
    expect(body).toMatchObject({
      statusCode: 409,
      code: 'INVENTORY_FINISHED',
      message: 'Inventário INV-1 já encerrado',
    });
  });

  it('não inventa code quando a exceção não traz um', () => {
    const { body } = run(new BadRequestException('Setor não encontrado'));
    expect(body.message).toBe('Setor não encontrado');
    expect(body).not.toHaveProperty('code');
  });

  it('junta as mensagens de validação do class-validator numa string', () => {
    const { body } = run(new BadRequestException({ message: ['epc inválido', 'rssi inválido'] }));
    expect(body.message).toBe('epc inválido; rssi inválido');
  });
});
