// Domain layer — pure, framework-agnostic.

export type AssetStatus =
  | 'available' | 'in_use' | 'maintenance' | 'reserved'
  | 'missing' | 'loaned' | 'written_off' | 'scrapped';

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
    skip: number; take: number; sectorId?: string; status?: AssetStatus;
    search?: string;
  }): Promise<{ data: Asset[]; total: number }>;
}

export const ASSET_REPOSITORY = Symbol('ASSET_REPOSITORY');
