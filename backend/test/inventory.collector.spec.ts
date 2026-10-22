import { BadRequestException, ConflictException } from '@nestjs/common';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { InventoryService } from '../src/modules/inventory/application/inventory.service';

/**
 * Contrato do coletor (fila do sistema web e app Android) com o inventário.
 *
 * Os comportamentos cobertos aqui existem porque o coletor lê offline e
 * sincroniza depois — e cada um deles, se quebrar, custa coleta de campo:
 *  - reenvio do mesmo lote não pode duplicar leitura;
 *  - setor já concluído RECUSA com 409 SECTOR_VISIT_COMPLETED (o cliente retém o
 *    lote) e continua concluído — reabrir em silêncio tirava o setor da
 *    conciliação; reabrir é só pelo POST /:id/sectors;
 *  - inventário encerrado tem de responder 409 (segure para revisão), nunca
 *    400 (que o app trata como rejeição definitiva e descarta).
 *
 * Banco: nenhum. O EntityManager é um dublê em memória (fakeDb abaixo).
 */

/** Dublê em memória do EntityManager, só com o que o InventoryService usa. */
function fakeDb() {
  const state = {
    inventory: { id: 'inv-1', code: 'INV-2026-001', status: 'in_progress' } as any,
    visits: [] as any[],
    reads: [] as any[],
    sectors: [{ id: 'sector-ti', name: 'TI' }, { id: 'sector-mkt', name: 'Marketing' }] as any[],
    locks: [] as [string, string][],
  };
  const matches = (row: any, where: any = {}) =>
    Object.entries(where).every(([k, v]: [string, any]) =>
      v && typeof v === 'object' && Array.isArray(v._value) ? v._value.includes(row[k]) : row[k] === v);
  const table = (E: any): any[] => ({
    InventoryOrmEntity: [state.inventory],
    InventorySectorVisitOrmEntity: state.visits,
    InventoryReadOrmEntity: state.reads,
    SectorOrmEntity: state.sectors,
  } as Record<string, any[]>)[E.name] ?? [];

  const insertBuilder: any = {
    insert: jest.fn(() => insertBuilder),
    into: jest.fn(() => insertBuilder),
    values: jest.fn(() => insertBuilder),
    orIgnore: jest.fn(() => insertBuilder),
    execute: jest.fn(async () => {
      const rows: any[] = insertBuilder.values.mock.calls.at(-1)[0];
      // ON CONFLICT (client_batch_id, epc) DO NOTHING, como o índice parcial.
      const fresh = rows.filter((r) => !r.clientBatchId || !state.reads.some(
        (x) => x.clientBatchId === r.clientBatchId && x.epc === r.epc));
      state.reads.push(...fresh);
      return { raw: fresh.map(() => ({ id: 'x' })) };
    }),
  };
  const countBuilder: any = {
    where: jest.fn(() => countBuilder), andWhere: jest.fn(() => countBuilder),
    getCount: jest.fn(async () => 0),
  };
  const repo = (E: any) => ({ find: jest.fn(async (o: any) => table(E).filter((r) => matches(r, o?.where))) });

  const manager: any = {
    findOne: jest.fn(async (E: any, o: any) => {
      if (o?.lock) state.locks.push([E.name, o.lock.mode]);
      return table(E).find((r) => matches(r, o?.where)) ?? null;
    }),
    find: jest.fn(async (E: any, o: any) => table(E).filter((r) => matches(r, o?.where))),
    exists: jest.fn(async (E: any, o: any) => table(E).some((r) => matches(r, o?.where))),
    create: jest.fn((_E: any, data: any) => ({ ...data })),
    save: jest.fn(async (e: any) => {
      if (Array.isArray(e)) return e;
      if (e.sectorId && e.inventoryId && !state.visits.includes(e)) {
        e.id ??= `visit-${state.visits.length + 1}`;
        state.visits.push(e);
      }
      return e;
    }),
    getRepository: jest.fn(repo),
    createQueryBuilder: jest.fn((E?: any) => (E ? countBuilder : insertBuilder)),
  };
  const dataSource = { transaction: jest.fn((cb: any) => cb(manager)) };
  const service = new InventoryService(
    {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, dataSource as any,
  );
  return { service, state, manager, insertBuilder, dataSource };
}

describe('InventoryService — ingestão do coletor', () => {
  const VISIT = 'visit-1';
  const INV = 'inv-1';

  let db: ReturnType<typeof fakeDb>;
  let service: InventoryService;
  let inventory: any;
  let visit: any;
  let insertBuilder: any;

  beforeEach(() => {
    db = fakeDb();
    ({ service, insertBuilder } = db);
    inventory = db.state.inventory;
    visit = { id: VISIT, inventoryId: INV, sectorId: 'sector-ti', status: 'in_progress', completedAt: null };
    db.state.visits.push(visit);
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
    await service.addReads(INV, batch() as any, 'op-1');
    const result = await service.addReads(INV, batch() as any, 'op-1');
    expect(result).toEqual({ received: 1, inserted: 0 });
    expect(db.state.reads).toHaveLength(1);
  });

  it('trava inventário (FOR SHARE) e visita (FOR UPDATE) na transação', async () => {
    await service.addReads(INV, batch() as any, 'op-1');
    expect(db.dataSource.transaction).toHaveBeenCalled();
    expect(db.state.locks).toEqual([
      ['InventoryOrmEntity', 'pessimistic_read'],
      ['InventorySectorVisitOrmEntity', 'pessimistic_write'],
    ]);
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

  it('setor concluído: 409 SECTOR_VISIT_COMPLETED, nada gravado, visita continua concluída', async () => {
    const completedAt = new Date();
    visit.status = 'completed';
    visit.completedAt = completedAt;

    const err = await service.addReads(INV, batch() as any, 'op-1').catch((e) => e);

    expect(err).toBeInstanceOf(ConflictException);
    expect(err.getResponse()).toMatchObject({
      code: 'SECTOR_VISIT_COMPLETED', sectorVisitId: VISIT, sectorName: 'TI',
    });
    expect(err.getResponse().message).toContain('Setor TI já foi concluído');
    expect(insertBuilder.execute).not.toHaveBeenCalled();
    expect(db.state.reads).toHaveLength(0);
    expect(visit.status).toBe('completed');
    expect(visit.completedAt).toBe(completedAt);
    expect(db.manager.save).not.toHaveBeenCalled();
  });

  it('setor concluído: lote vazio também é recusado (não há o que reabrir por baixo)', async () => {
    visit.status = 'completed';
    await expect(service.addReads(INV, batch({ reads: [] }) as any, 'op-1'))
      .rejects.toThrow(ConflictException);
  });

  it('setor concluído: reenvio de lote JÁ gravado responde sucesso sem duplicar', async () => {
    await service.addReads(INV, batch() as any, 'op-1');   // subiu, resposta se perdeu
    visit.status = 'completed';                            // setor concluído no meio
    visit.completedAt = new Date();

    const result = await service.addReads(INV, batch() as any, 'op-1');

    expect(result).toEqual({ received: 1, inserted: 0 });
    expect(insertBuilder.execute).toHaveBeenCalledTimes(1); // só o primeiro envio
    expect(db.state.reads).toHaveLength(1);
    expect(visit.status).toBe('completed');
  });

  it('setor concluído: clientBatchId gravado em OUTRA visita não libera o lote', async () => {
    db.state.reads.push({ inventoryId: INV, sectorVisitId: 'visit-outra', epc: 'E1',
      clientBatchId: '11111111-1111-4111-8111-111111111111' });
    visit.status = 'completed';
    await expect(service.addReads(INV, batch() as any, 'op-1')).rejects.toThrow(ConflictException);
  });

  it('setor concluído sem clientBatchId (captura direta) é recusado', async () => {
    visit.status = 'completed';
    await expect(service.addReads(
      INV, { sectorVisitId: VISIT, reads: [{ epc: 'E2801100FF' }] } as any, 'op-1',
    )).rejects.toThrow(ConflictException);
  });

  it('reabrir pelo POST /sectors e reenviar: leitura aceita', async () => {
    visit.status = 'completed';
    visit.completedAt = new Date();
    await service.addReads(INV, batch() as any, 'op-1').catch(() => undefined); // retido

    const reopened: any = await service.selectSector(INV, { sectorId: 'sector-ti' } as any);
    expect(reopened.id).toBe(VISIT);
    expect(reopened.status).toBe('in_progress');
    expect(reopened.completedAt).toBeNull();

    const result = await service.addReads(INV, batch() as any, 'op-1');
    expect(result).toEqual({ received: 1, inserted: 1 });
    expect(db.state.reads).toHaveLength(1);
  });

  it('concluir setor trava a mesma visita (FOR UPDATE) que o envio de leituras', async () => {
    await service.completeSector(INV, VISIT);
    expect(visit.status).toBe('completed');
    expect(db.state.locks).toEqual([
      ['InventoryOrmEntity', 'pessimistic_read'],
      ['InventorySectorVisitOrmEntity', 'pessimistic_write'],
    ]);
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

describe('InventoryService.finish — setores em andamento', () => {
  let db: ReturnType<typeof fakeDb>;

  beforeEach(() => {
    db = fakeDb();
    db.state.visits.push(
      { id: 'visit-1', inventoryId: 'inv-1', sectorId: 'sector-ti', status: 'completed' },
      { id: 'visit-2', inventoryId: 'inv-1', sectorId: 'sector-mkt', status: 'in_progress' },
    );
  });

  it('com setor aberto: 409 SECTOR_VISITS_OPEN com a lista, nada conciliado', async () => {
    const err = await db.service.finish('inv-1').catch((e) => e);

    expect(err).toBeInstanceOf(ConflictException);
    expect(err.getResponse()).toMatchObject({
      code: 'SECTOR_VISITS_OPEN',
      sectors: [{ visitId: 'visit-2', sectorId: 'sector-mkt', name: 'Marketing' }],
    });
    expect(err.getResponse().message).toContain('Marketing');
    expect(db.state.inventory.status).toBe('in_progress');
    expect(db.manager.save).not.toHaveBeenCalled(); // nem divergências, nem snapshot
    expect(db.state.locks[0]).toEqual(['InventoryOrmEntity', 'pessimistic_write']);
  });

  it('com tudo concluído: finaliza normalmente', async () => {
    db.state.visits[1].status = 'completed';
    const result: any = await db.service.finish('inv-1');
    expect(result.status).toBe('finished');
    expect(db.state.inventory.status).toBe('finished');
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

  it('propaga os detalhes de SECTOR_VISITS_OPEN (lista de setores)', () => {
    const sectors = [{ visitId: 'v2', sectorId: 's2', name: 'Marketing' }];
    const { body } = run(new ConflictException({ code: 'SECTOR_VISITS_OPEN', message: 'Conclua…', sectors }));
    expect(body).toMatchObject({ statusCode: 409, code: 'SECTOR_VISITS_OPEN', message: 'Conclua…', sectors });
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
