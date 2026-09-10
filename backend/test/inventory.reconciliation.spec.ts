import {
  reconcile, ReconcileInput,
} from '../src/modules/inventory/domain/reconciliation';

// IDs fictícios de setores.
const TI = 'sector-ti';
const MKT = 'sector-mkt';
const GER = 'sector-ger';

const at = (s: number) => new Date(2026, 6, 8, 10, 0, s);

function build(over: Partial<ReconcileInput>): ReconcileInput {
  return {
    visitedSectorIds: [],
    expectedAssets: [],
    reads: [],
    epcToAsset: new Map(),
    ...over,
  };
}

describe('reconcile — conciliação adiada (coleta × julgamento)', () => {
  it('Cenário A: ativo de TI lido em Marketing → 1 location_mismatch (não dois)', () => {
    const epc = 'E1';
    const res = reconcile(build({
      visitedSectorIds: [TI, MKT],
      expectedAssets: [{ assetId: 'a1', epc, sectorId: TI }],
      reads: [{ epc, sectorId: MKT, readAt: at(1) }],
      epcToAsset: new Map([[epc, { assetId: 'a1', sectorId: TI }]]),
    }));
    expect(res.discrepancies).toHaveLength(1);
    expect(res.discrepancies[0]).toMatchObject({
      type: 'location_mismatch', assetId: 'a1', expectedSectorId: TI, foundSectorId: MKT,
    });
    expect(res.conformCount).toBe(0);
    expect(res.expectedCount).toBe(1);
  });

  it('Cenário B: tag de Marketing lida por engano na TI e depois no Marketing → nenhuma divergência', () => {
    const epc = 'E2';
    const res = reconcile(build({
      visitedSectorIds: [TI, MKT],
      expectedAssets: [{ assetId: 'a2', epc, sectorId: MKT }],
      reads: [
        { epc, sectorId: TI, readAt: at(1) },  // engano na varredura da TI
        { epc, sectorId: MKT, readAt: at(2) }, // correto no Marketing
      ],
      epcToAsset: new Map([[epc, { assetId: 'a2', sectorId: MKT }]]),
    }));
    expect(res.discrepancies).toHaveLength(0);
    expect(res.conformCount).toBe(1);
  });

  it('Cenário C: ativo da Gerência (em manutenção) lido na TI → location_mismatch', () => {
    const epc = 'E3';
    const res = reconcile(build({
      visitedSectorIds: [TI, GER],
      expectedAssets: [{ assetId: 'a3', epc, sectorId: GER }], // maintenance também é esperado
      reads: [{ epc, sectorId: TI, readAt: at(1) }],
      epcToAsset: new Map([[epc, { assetId: 'a3', sectorId: GER }]]),
    }));
    expect(res.discrepancies).toHaveLength(1);
    expect(res.discrepancies[0]).toMatchObject({
      type: 'location_mismatch', assetId: 'a3', expectedSectorId: GER, foundSectorId: TI,
    });
  });

  it('Setor NÃO visitado: ativo fora do escopo não vira not_found', () => {
    // Só TI foi visitado; ativos de outros setores não entram na conciliação.
    const res = reconcile(build({
      visitedSectorIds: [TI],
      expectedAssets: [{ assetId: 'a1', epc: 'E1', sectorId: TI }],
      reads: [{ epc: 'E1', sectorId: TI, readAt: at(1) }],
      epcToAsset: new Map([['E1', { assetId: 'a1', sectorId: TI }]]),
    }));
    expect(res.discrepancies).toHaveLength(0);
    expect(res.expectedCount).toBe(1); // apenas os de TI
    expect(res.conformCount).toBe(1);
  });

  it('not_found: esperado que não foi lido em nenhum setor visitado', () => {
    const res = reconcile(build({
      visitedSectorIds: [TI],
      expectedAssets: [{ assetId: 'a9', epc: 'E9', sectorId: TI }],
      reads: [],
      epcToAsset: new Map(),
    }));
    expect(res.discrepancies).toHaveLength(1);
    expect(res.discrepancies[0]).toMatchObject({
      type: 'not_found', assetId: 'a9', expectedSectorId: TI, foundSectorId: null,
    });
  });

  it('unknown_tag: EPC lido sem asset correspondente (uma vez por EPC, ignora duplicatas)', () => {
    const res = reconcile(build({
      visitedSectorIds: [TI],
      reads: [
        { epc: 'EX', sectorId: TI, readAt: at(1) },
        { epc: 'EX', sectorId: TI, readAt: at(2) }, // duplicada
      ],
      epcToAsset: new Map(), // EX não corresponde a nenhum asset
    }));
    expect(res.discrepancies).toHaveLength(1);
    expect(res.discrepancies[0]).toMatchObject({ type: 'unknown_tag', epc: 'EX', foundSectorId: TI });
  });

  it('EPC de asset fora do escopo lido em setor visitado NÃO é unknown_tag', () => {
    // Tag de um ativo de GER (não visitado) capturada na TI: corresponde a um asset,
    // logo não é desconhecida; e o ativo não é esperado → nenhuma divergência.
    const res = reconcile(build({
      visitedSectorIds: [TI],
      reads: [{ epc: 'EZ', sectorId: TI, readAt: at(1) }],
      epcToAsset: new Map([['EZ', { assetId: 'aZ', sectorId: GER }]]),
    }));
    expect(res.discrepancies).toHaveLength(0);
  });

  it('location_mismatch usa o setor da leitura MAIS RECENTE como foundSector', () => {
    const epc = 'E5';
    const res = reconcile(build({
      visitedSectorIds: [TI, MKT, GER],
      expectedAssets: [{ assetId: 'a5', epc, sectorId: TI }],
      reads: [
        { epc, sectorId: GER, readAt: at(1) },
        { epc, sectorId: MKT, readAt: at(5) }, // mais recente
      ],
      epcToAsset: new Map([[epc, { assetId: 'a5', sectorId: TI }]]),
    }));
    expect(res.discrepancies[0]).toMatchObject({ type: 'location_mismatch', foundSectorId: MKT });
  });
});
