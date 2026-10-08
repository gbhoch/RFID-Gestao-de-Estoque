// Domain layer — pure, framework-agnostic.
//
// Planejamento da importação ERP → RFID. Recebe as linhas lidas do Oracle e um
// retrato do estado local (Postgres) e decide, registro a registro, o que
// criar, atualizar, deixar como está ou reportar como problema. Não faz I/O:
// o mesmo plano serve ao dry-run (só relatório) e ao commit (gravação).
import { createHash } from 'crypto';

// ---------------------------------------------------------------------------
// Linhas de origem (já normalizadas pelo leitor do Oracle)
// ---------------------------------------------------------------------------

/** Q1 — MEGAADM.PATGRPBEM */
export interface ErpGroupRow { empresa: number; codigo: number; descricao: string | null }

/** Q2 — MEGAADM.PATLOCALBEM */
export interface ErpLocationRow {
  empresa: number; codigo: number; descricao: string | null; situacao: string | null;
}

/** Q3 — MEGAADM.PATBEM com CODIGO_PATRIMONIAL. sequencial como texto (NUMBER grande). */
export interface ErpAssetRow {
  empresa: number;
  sequencial: string;
  descricao: string | null;
  grupoBem: number;
  situacao: string | null;
  codigoPatrimonial: string | null;
  /** DATA_AQUISICAO como 'YYYY-MM-DD' (coluna DATE, sem fuso). */
  dataAquisicao: string | null;
  observacao: string | null;
}

/** Q4 — última PATBEMHISTLOC de cada bem com código. LOCALIZACAO pode vir NULL. */
export interface ErpAssetLocationRow { empresa: number; bem: string; localizacao: number | null }

export interface ErpSnapshot {
  groups: ErpGroupRow[];
  locations: ErpLocationRow[];
  assets: ErpAssetRow[];
  assetLocations: ErpAssetLocationRow[];
}

// ---------------------------------------------------------------------------
// Estado local relevante (Postgres)
// ---------------------------------------------------------------------------

/** erpEmpresa null = cadastro manual. deleted = soft-deleted (deleted_at preenchido). */
export interface LocalCategory {
  id: string; name: string; erpEmpresa: number | null; erpCodigo: number | null;
  erpHash: string | null; deleted: boolean;
}
export interface LocalSector {
  id: string; name: string; erpEmpresa: number | null; erpCodigo: number | null;
  erpHash: string | null; deleted: boolean;
}
export interface LocalAsset {
  id: string; assetCode: string; name: string; erpEmpresa: number | null;
  erpSequencial: string | null; erpHash: string | null; deleted: boolean;
}

export interface LocalState {
  categories: LocalCategory[];
  sectors: LocalSector[];
  assets: LocalAsset[];
}

// ---------------------------------------------------------------------------
// Regras de mapeamento
// ---------------------------------------------------------------------------

/**
 * PATBEM.SITUACAO → assets.status.
 *   'I' — bem incorporado (ativo no patrimônio) → em uso
 *   'B' — bem baixado                           → baixado
 * Qualquer outro valor é reportado como problema e o bem não é importado.
 */
export const ASSET_STATUS_BY_SITUACAO: Readonly<Record<string, string>> = {
  I: 'in_use',
  B: 'written_off',
};

/** PATLOCALBEM.SITUACAO → sectors.status ('A' ativa, 'I' inativa). */
export const SECTOR_STATUS_BY_SITUACAO: Readonly<Record<string, string>> = {
  A: 'active',
  I: 'inactive',
};

/** Limites das colunas de destino (database/schema.sql). */
export const LIMITS = {
  assetCode: 40,     // assets.asset_code VARCHAR(40)
  assetName: 160,    // assets.name VARCHAR(160)
  categoryName: 80,  // categories.name VARCHAR(80)
  sectorName: 80,    // sectors.name VARCHAR(80)
} as const;

export type ProblemCode =
  | 'CODE_CONFLICT'        // asset_code já pertence a outro ativo (manual, excluído ou outro bem do ERP)
  | 'NAME_CONFLICT'        // categories.name já pertence a outra categoria
  | 'CATEGORY_NOT_FOUND'   // grupo do bem não existe/não foi importado
  | 'UNKNOWN_STATUS'       // SITUACAO fora do mapa
  | 'CODE_TOO_LONG'        // CODIGO_PATRIMONIAL > 40 caracteres
  | 'NAME_TOO_LONG'        // DESCRICAO maior que a coluna de destino
  | 'EMPTY_VALUE';         // campo obrigatório vazio

export interface ImportProblem {
  /** Chave de origem no ERP, ex.: "1/42" (EMPRESA/CODIGO ou EMPRESA/SEQUENCIAL). */
  erpKey: string;
  code: ProblemCode;
  message: string;
  details?: Record<string, unknown>;
}

/** Bem importado, mas com ressalva (ex.: localização sem setor correspondente). */
export interface ImportWarning { erpKey: string; code: 'SECTOR_NOT_FOUND'; message: string }

// Registros como serão gravados (nomes = colunas do Postgres) --------------

export interface CategoryRecord {
  id: string; name: string; status: string;
  erp_empresa: number; erp_codigo: number; erp_synced_at: Date; erp_hash: string;
}
export interface SectorRecord {
  id: string; name: string; status: string;
  erp_empresa: number; erp_codigo: number; erp_synced_at: Date; erp_hash: string;
}
export interface AssetRecord {
  id: string; asset_code: string; name: string; category_id: string;
  sector_id: string | null; acquisition_date: string | null; notes: string | null;
  status: string; erp_empresa: number; erp_sequencial: string;
  erp_synced_at: Date; erp_hash: string;
}

export interface EntityPlan<R> {
  create: R[];
  update: R[];
  unchanged: number;
  problems: ImportProblem[];
}

export interface ImportPlan {
  categories: EntityPlan<CategoryRecord>;
  sectors: EntityPlan<SectorRecord>;
  assets: EntityPlan<AssetRecord> & {
    warnings: ImportWarning[];
    /** Bens processados (criados/atualizados/sem alteração) que ficaram sem setor. */
    withoutSector: number;
    /** ...por não terem registro em PATBEMHISTLOC (ausentes de Q4). */
    withoutLocationHistory: number;
    /** ...por estarem em Q4 com LOCALIZACAO NULL no último movimento. */
    withNullLocation: number;
  };
  /** Rótulos para o relatório: id → nome da categoria/setor resolvido. */
  labels: { categories: Map<string, string>; sectors: Map<string, string> };
}

// ---------------------------------------------------------------------------
// Utilitários
// ---------------------------------------------------------------------------

/** SHA-256 (hex, 64 chars) dos campos vindos do ERP, em ordem fixa. */
export function erpHash(fields: unknown[]): string {
  return createHash('sha256').update(JSON.stringify(fields)).digest('hex');
}

const key = (empresa: number | string, codigo: number | string) => `${empresa}/${codigo}`;

/** Trim; string vazia vira null. */
function clean(v: string | null | undefined): string | null {
  if (v === null || v === undefined) return null;
  const t = String(v).trim();
  return t === '' ? null : t;
}

function describeOwner(o: { id: string; erpEmpresa: number | null; deleted: boolean }) {
  if (o.deleted) return 'registro excluído (soft-delete)';
  return o.erpEmpresa === null ? 'cadastro manual' : 'outro registro do ERP';
}

// ---------------------------------------------------------------------------
// Planejamento
// ---------------------------------------------------------------------------

export function planImport(
  erp: ErpSnapshot,
  local: LocalState,
  now: Date,
  newId: () => string,
): ImportPlan {
  const labels = { categories: new Map<string, string>(), sectors: new Map<string, string>() };

  const { plan: categories, idByKey: categoryIdByKey, problemByKey: categoryProblemByKey } =
    planCategories(erp.groups, local.categories, now, newId, labels.categories);
  const { plan: sectors, idByKey: sectorIdByKey } =
    planSectors(erp.locations, local.sectors, now, newId, labels.sectors);
  const assets = planAssets(
    erp.assets, erp.assetLocations, local.assets, now, newId,
    categoryIdByKey, categoryProblemByKey, sectorIdByKey,
  );

  return { categories, sectors, assets, labels };
}

function planCategories(
  rows: ErpGroupRow[], local: LocalCategory[], now: Date, newId: () => string,
  labels: Map<string, string>,
) {
  const plan: EntityPlan<CategoryRecord> = { create: [], update: [], unchanged: 0, problems: [] };
  const idByKey = new Map<string, string>();
  const problemByKey = new Map<string, ImportProblem>();

  const byKey = new Map<string, LocalCategory>();
  // name é UNIQUE na tabela inteira (inclusive excluídos)
  const byName = new Map<string, { id: string; erpEmpresa: number | null; deleted: boolean; erpKey?: string }>();
  for (const c of local) {
    if (c.erpEmpresa !== null && !c.deleted) byKey.set(key(c.erpEmpresa, c.erpCodigo!), c);
    byName.set(c.name, c);
  }

  for (const r of rows) {
    const k = key(r.empresa, r.codigo);
    const name = clean(r.descricao);
    const existing = byKey.get(k);
    // Categoria já importada continua válida para os bens mesmo se a
    // atualização desta rodada for barrada.
    if (existing) { idByKey.set(k, existing.id); labels.set(existing.id, existing.name); }

    const fail = (p: Omit<ImportProblem, 'erpKey'>) => {
      const problem = { erpKey: k, ...p };
      plan.problems.push(problem);
      problemByKey.set(k, problem);
    };

    if (!name) { fail({ code: 'EMPTY_VALUE', message: 'DESCRICAO vazia' }); continue; }
    if (name.length > LIMITS.categoryName) {
      fail({
        code: 'NAME_TOO_LONG',
        message: `DESCRICAO com ${name.length} caracteres (máximo ${LIMITS.categoryName})`,
        details: { descricao: name },
      });
      continue;
    }

    const hash = erpHash(['PATGRPBEM', r.empresa, r.codigo, name]);
    if (existing && existing.erpHash === hash) { plan.unchanged++; continue; }

    const owner = byName.get(name);
    if (owner && owner.id !== existing?.id) {
      fail({
        code: 'NAME_CONFLICT',
        message: owner.erpKey
          ? `Nome "${name}" repetido no ERP (também usado pelo grupo ${owner.erpKey})`
          : `Nome "${name}" já pertence a uma categoria (${describeOwner(owner)})`,
        details: {
          erp: { empresa: r.empresa, codigo: r.codigo, descricao: name },
          local: { id: owner.id, name, origem: owner.erpKey ? `ERP ${owner.erpKey}` : describeOwner(owner) },
        },
      });
      continue;
    }

    const rec: CategoryRecord = {
      id: existing?.id ?? newId(),
      name,
      status: 'active',
      erp_empresa: r.empresa,
      erp_codigo: r.codigo,
      erp_synced_at: now,
      erp_hash: hash,
    };
    (existing ? plan.update : plan.create).push(rec);
    byName.set(name, { id: rec.id, erpEmpresa: r.empresa, deleted: false, erpKey: k });
    idByKey.set(k, rec.id);
    labels.set(rec.id, name);
  }
  return { plan, idByKey, problemByKey };
}

function planSectors(
  rows: ErpLocationRow[], local: LocalSector[], now: Date, newId: () => string,
  labels: Map<string, string>,
) {
  const plan: EntityPlan<SectorRecord> = { create: [], update: [], unchanged: 0, problems: [] };
  const idByKey = new Map<string, string>();

  const byKey = new Map<string, LocalSector>();
  for (const s of local)
    if (s.erpEmpresa !== null && !s.deleted) byKey.set(key(s.erpEmpresa, s.erpCodigo!), s);

  for (const r of rows) {
    const k = key(r.empresa, r.codigo);
    const name = clean(r.descricao);
    const situacao = clean(r.situacao);
    const existing = byKey.get(k);
    if (existing) { idByKey.set(k, existing.id); labels.set(existing.id, existing.name); }

    const fail = (p: Omit<ImportProblem, 'erpKey'>) => plan.problems.push({ erpKey: k, ...p });

    if (!name) { fail({ code: 'EMPTY_VALUE', message: 'DESCRICAO vazia' }); continue; }
    if (name.length > LIMITS.sectorName) {
      fail({
        code: 'NAME_TOO_LONG',
        message: `DESCRICAO com ${name.length} caracteres (máximo ${LIMITS.sectorName})`,
        details: { descricao: name },
      });
      continue;
    }
    const status = situacao ? SECTOR_STATUS_BY_SITUACAO[situacao] : undefined;
    if (!status) {
      fail({
        code: 'UNKNOWN_STATUS',
        message: `SITUACAO desconhecida: ${situacao === null ? 'NULL' : `'${situacao}'`}`,
        details: { descricao: name },
      });
      continue;
    }

    const hash = erpHash(['PATLOCALBEM', r.empresa, r.codigo, name, situacao]);
    if (existing && existing.erpHash === hash) { plan.unchanged++; continue; }

    // acronym não é tocado: nasce NULL (é UNIQUE) e, se alguém preencher no
    // sistema RFID, a sincronização preserva.
    const rec: SectorRecord = {
      id: existing?.id ?? newId(),
      name,
      status,
      erp_empresa: r.empresa,
      erp_codigo: r.codigo,
      erp_synced_at: now,
      erp_hash: hash,
    };
    (existing ? plan.update : plan.create).push(rec);
    idByKey.set(k, rec.id);
    labels.set(rec.id, name);
  }
  return { plan, idByKey };
}

function planAssets(
  rows: ErpAssetRow[], locations: ErpAssetLocationRow[], local: LocalAsset[],
  now: Date, newId: () => string,
  categoryIdByKey: Map<string, string>,
  categoryProblemByKey: Map<string, ImportProblem>,
  sectorIdByKey: Map<string, string>,
): ImportPlan['assets'] {
  const plan: ImportPlan['assets'] = {
    create: [], update: [], unchanged: 0, problems: [], warnings: [],
    withoutSector: 0, withoutLocationHistory: 0, withNullLocation: 0,
  };

  const locationByBem = new Map<string, number | null>();
  for (const l of locations) locationByBem.set(key(l.empresa, l.bem), l.localizacao);

  const byKey = new Map<string, LocalAsset>();
  // asset_code é UNIQUE na tabela inteira (inclusive excluídos)
  const byCode = new Map<string, { id: string; name: string; erpEmpresa: number | null; deleted: boolean; erpKey?: string }>();
  for (const a of local) {
    if (a.erpEmpresa !== null && !a.deleted) byKey.set(key(a.erpEmpresa, a.erpSequencial!), a);
    byCode.set(a.assetCode, {
      ...a, erpKey: a.erpEmpresa !== null ? key(a.erpEmpresa, a.erpSequencial!) : undefined,
    });
  }

  for (const r of rows) {
    const k = key(r.empresa, r.sequencial);
    const code = clean(r.codigoPatrimonial);
    const name = clean(r.descricao);
    const situacao = clean(r.situacao);
    const notes = clean(r.observacao);
    const erpRef = { empresa: r.empresa, sequencial: r.sequencial, codigoPatrimonial: code, descricao: name };
    const fail = (p: Omit<ImportProblem, 'erpKey'>) => plan.problems.push({ erpKey: k, ...p });

    if (!code) { fail({ code: 'EMPTY_VALUE', message: 'CODIGO_PATRIMONIAL vazio', details: { erp: erpRef } }); continue; }
    if (code.length > LIMITS.assetCode) {
      fail({
        code: 'CODE_TOO_LONG',
        message: `CODIGO_PATRIMONIAL com ${code.length} caracteres (máximo ${LIMITS.assetCode})`,
        details: { erp: erpRef },
      });
      continue;
    }
    if (!name) { fail({ code: 'EMPTY_VALUE', message: 'DESCRICAO vazia', details: { erp: erpRef } }); continue; }
    if (name.length > LIMITS.assetName) {
      fail({
        code: 'NAME_TOO_LONG',
        message: `DESCRICAO com ${name.length} caracteres (máximo ${LIMITS.assetName})`,
        details: { erp: erpRef },
      });
      continue;
    }
    const status = situacao ? ASSET_STATUS_BY_SITUACAO[situacao] : undefined;
    if (!status) {
      fail({
        code: 'UNKNOWN_STATUS',
        message: `SITUACAO desconhecida: ${situacao === null ? 'NULL' : `'${situacao}'`}`,
        details: { erp: erpRef },
      });
      continue;
    }
    const catKey = key(r.empresa, r.grupoBem);
    const categoryId = categoryIdByKey.get(catKey);
    if (!categoryId) {
      const catProblem = categoryProblemByKey.get(catKey);
      fail({
        code: 'CATEGORY_NOT_FOUND',
        message: catProblem
          ? `Grupo ${catKey} não foi importado (${catProblem.code}: ${catProblem.message})`
          : `Grupo ${catKey} não existe em PATGRPBEM`,
        details: { erp: erpRef },
      });
      continue;
    }

    const localizacao = locationByBem.get(k);
    let sectorId: string | null = null;
    if (localizacao === undefined) {
      plan.withoutLocationHistory++;
    } else if (localizacao === null) {
      plan.withNullLocation++;
    } else {
      sectorId = sectorIdByKey.get(key(r.empresa, localizacao)) ?? null;
      if (!sectorId)
        plan.warnings.push({
          erpKey: k,
          code: 'SECTOR_NOT_FOUND',
          message: `Localização ${key(r.empresa, localizacao)} não importada/inexistente; bem importado sem setor`,
        });
    }

    const hash = erpHash([
      'PATBEM', r.empresa, r.sequencial, name, r.grupoBem, situacao, code,
      r.dataAquisicao, notes, localizacao ?? null,
    ]);
    const existing = byKey.get(k);
    if (existing && existing.erpHash === hash) {
      plan.unchanged++;
      if (!sectorId) plan.withoutSector++;
      continue;
    }

    const owner = byCode.get(code);
    if (owner && owner.id !== existing?.id) {
      fail({
        code: 'CODE_CONFLICT',
        message: `Código "${code}" já pertence a outro ativo (${owner.erpKey && !owner.deleted ? `ERP ${owner.erpKey}` : describeOwner(owner)})`,
        details: {
          erp: erpRef,
          local: {
            id: owner.id, assetCode: code, name: owner.name,
            origem: owner.erpKey ? `ERP ${owner.erpKey}` : 'cadastro manual',
            excluido: owner.deleted,
          },
        },
      });
      continue;
    }

    const rec: AssetRecord = {
      id: existing?.id ?? newId(),
      asset_code: code,
      name,
      category_id: categoryId,
      sector_id: sectorId,
      acquisition_date: r.dataAquisicao,
      notes,
      status,
      erp_empresa: r.empresa,
      erp_sequencial: r.sequencial,
      erp_synced_at: now,
      erp_hash: hash,
    };
    (existing ? plan.update : plan.create).push(rec);
    byCode.set(code, { id: rec.id, name, erpEmpresa: r.empresa, deleted: false, erpKey: k });
    if (!sectorId) plan.withoutSector++;
  }
  return plan;
}

// ---------------------------------------------------------------------------
// Portas
// ---------------------------------------------------------------------------

/** Leitura do ERP: executa Q1–Q4, uma vez cada. */
export interface ErpSourcePort {
  readSnapshot(): Promise<ErpSnapshot>;
}

/** Persistência no sistema RFID. */
export interface ErpImportRepositoryPort {
  /**
   * Abre uma unidade de trabalho. Com `transactional`, tudo dentro de `fn`
   * roda numa transação: commit no sucesso, rollback em qualquer erro.
   */
  run<T>(transactional: boolean, fn: (uow: ErpImportUnitOfWork) => Promise<T>): Promise<T>;
}

export interface ErpImportUnitOfWork {
  loadState(): Promise<LocalState>;
  upsertCategories(records: CategoryRecord[]): Promise<void>;
  upsertSectors(records: SectorRecord[]): Promise<void>;
  upsertAssets(records: AssetRecord[]): Promise<void>;
}

export const ERP_SOURCE = Symbol('ERP_SOURCE');
export const ERP_IMPORT_REPOSITORY = Symbol('ERP_IMPORT_REPOSITORY');
