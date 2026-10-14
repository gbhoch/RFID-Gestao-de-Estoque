// Domain layer — pure, framework-agnostic.

export type AssetStatus =
  | 'available' | 'in_use' | 'maintenance' | 'reserved'
  | 'missing' | 'loaned' | 'written_off' | 'scrapped';

/** Grupo de filtro: todos os status exceto 'written_off' (bens fisicamente presentes). */
export const ACTIVE_STATUS_GROUP = 'active';
export type AssetStatusFilter = AssetStatus | typeof ACTIVE_STATUS_GROUP;
/** Valor de sectorId que filtra bens sem setor. */
export const NO_SECTOR = 'none';

/** Campos aceitos na ordenação da listagem (lista fechada). */
export const ASSET_SORT_FIELDS = ['assetCode', 'name', 'status'] as const;
export type AssetSortField = (typeof ASSET_SORT_FIELDS)[number];
export type SortDirection = 'ASC' | 'DESC';
/** Padrão: código patrimonial ascendente. */
export const DEFAULT_ASSET_SORT: { field: AssetSortField; dir: SortDirection } = {
  field: 'assetCode', dir: 'ASC',
};

export class Asset {
  id?: string;
  assetCode: string;
  name: string;
  categoryId: string;
  brand?: string;
  model?: string;
  serialNumber?: string;
  acquisitionDate?: Date;
  acquisitionValue?: number;
  invoiceNumber?: string;
  costCenter?: string;
  sectorId?: string;
  ownerId?: string;
  warrantyUntil?: Date;
  rfidTagId?: string;
  status: AssetStatus = 'available';
  notes?: string;

  /** Regra de negócio: só pode associar tag se ainda não houver uma. */
  attachTag(tagId: string) {
    if (this.rfidTagId)
      throw new Error('Patrimônio já possui etiqueta RFID associada');
    this.rfidTagId = tagId;
    if (this.status === 'available') this.status = 'in_use';
  }

  writeOff() {
    this.status = 'written_off';
    this.rfidTagId = undefined;
  }
}

export interface AssetRepositoryPort {
  create(asset: Asset): Promise<Asset>;
  update(id: string, patch: Partial<Asset>): Promise<Asset>;
  findById(id: string): Promise<Asset | null>;
  findByEpc(epc: string): Promise<Asset | null>;
  softDelete(id: string): Promise<void>;
  list(params: {
    skip: number; take: number;
    /** UUID do setor ou NO_SECTOR. */
    sectorId?: string;
    status?: AssetStatusFilter;
    /** Procura em nome e código patrimonial, sem diferenciar maiúsculas. */
    search?: string;
    sortBy: AssetSortField;
    sortDir: SortDirection;
  }): Promise<{ data: Asset[]; total: number }>;
}

export const ASSET_REPOSITORY = Symbol('ASSET_REPOSITORY');
