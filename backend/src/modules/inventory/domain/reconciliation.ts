// ============================================================================
//  Conciliação de inventário — FUNÇÃO PURA (sem dependência de banco).
// ----------------------------------------------------------------------------
//  Princípio central: SEPARAR COLETA DE JULGAMENTO.
//  Durante o levantamento, o sistema só grava fatos brutos ("EPC X lido no
//  setor Y em Z"). O JULGAMENTO (esta função) é ADIADO para o momento em que o
//  inventário é finalizado, quando já temos TODAS as leituras de TODOS os
//  setores visitados.
//
//  Por que adiar? Porque "faltar em TI" e "sobrar em Marketing" são o MESMO
//  fato (o ativo se moveu) e só é possível reconhecê-los como um só com a visão
//  completa. Calcular na hora produziria divergências duplicadas e falsos
//  positivos de setores vizinhos. Adiando, os cenários se resolvem sozinhos,
//  sem qualquer lógica de "desfazer inconsistência anterior".
// ============================================================================

export type DiscrepancyType = 'location_mismatch' | 'not_found' | 'unknown_tag';

export interface ExpectedAsset {
  assetId: string;
  epc: string | null; // ativo pode não ter etiqueta associada
  sectorId: string;   // setor de cadastro do ativo
}

export interface ReadFact {
  epc: string;
  sectorId: string; // setor (da visita) onde foi lido — já restrito a setores 'completed'
  readAt: Date;
}

export interface ReconcileInput {
  visitedSectorIds: string[];      // setores com visita status='completed'
  expectedAssets: ExpectedAsset[]; // assets nesses setores, deleted_at null (INCLUI maintenance/loaned)
  reads: ReadFact[];               // leituras em setores 'completed'
  // Qualquer asset (mesmo fora do escopo) indexado por EPC — para classificar unknown_tag.
  epcToAsset: Map<string, { assetId: string; sectorId: string }>;
}

export interface DiscrepancyOut {
  type: DiscrepancyType;
  assetId: string | null;
  epc: string | null;
  expectedSectorId: string | null;
  foundSectorId: string | null;
}

export interface ReconcileResult {
  discrepancies: DiscrepancyOut[];
  expectedCount: number;
  conformCount: number;
}

export function reconcile(input: ReconcileInput): ReconcileResult {
  const visited = new Set(input.visitedSectorIds);

  // Agrega leituras por EPC: em quais setores foi lido e qual a leitura mais recente.
  interface Agg { sectors: Set<string>; lastSector: string; lastAt: Date; }
  const byEpc = new Map<string, Agg>();
  for (const r of input.reads) {
    if (!visited.has(r.sectorId)) continue; // segurança: só setores visitados contam
    const a = byEpc.get(r.epc);
    if (!a) {
      byEpc.set(r.epc, { sectors: new Set([r.sectorId]), lastSector: r.sectorId, lastAt: r.readAt });
    } else {
      a.sectors.add(r.sectorId);
      if (r.readAt >= a.lastAt) { a.lastAt = r.readAt; a.lastSector = r.sectorId; }
    }
  }

  const discrepancies: DiscrepancyOut[] = [];
  let conformCount = 0;

  // 1) Ativos esperados: conforme, location_mismatch ou not_found.
  for (const asset of input.expectedAssets) {
    const agg = asset.epc ? byEpc.get(asset.epc) : undefined;
    const sectorsRead = agg?.sectors ?? new Set<string>();

    if (sectorsRead.has(asset.sectorId)) {
      // Lido no próprio setor de cadastro → conforme.
      conformCount++;
    } else if (sectorsRead.size > 0) {
      // Lido em outro(s) setor(es) visitado(s), mas não no seu → deslocado.
      discrepancies.push({
        type: 'location_mismatch',
        assetId: asset.assetId,
        epc: asset.epc,
        expectedSectorId: asset.sectorId,
        foundSectorId: agg!.lastSector, // setor da leitura mais recente
      });
    } else {
      // Não foi lido em nenhum setor visitado → não encontrado.
      discrepancies.push({
        type: 'not_found',
        assetId: asset.assetId,
        epc: asset.epc,
        expectedSectorId: asset.sectorId,
        foundSectorId: null,
      });
    }
  }

  // 2) EPCs lidos que NÃO correspondem a nenhum asset → unknown_tag (um por EPC).
  //    Obs.: um EPC que corresponde a asset FORA do escopo não é desconhecido e
  //    não gera divergência (o ativo simplesmente não foi inventariado).
  for (const [epc, agg] of byEpc) {
    if (input.epcToAsset.has(epc)) continue;
    discrepancies.push({
      type: 'unknown_tag',
      assetId: null,
      epc,
      expectedSectorId: null,
      foundSectorId: agg.lastSector,
    });
  }

  return {
    discrepancies,
    expectedCount: input.expectedAssets.length,
    conformCount,
  };
}
