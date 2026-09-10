import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn,
} from 'typeorm';

// Valores válidos (validação forte fica no DTO; no banco são VARCHAR + CHECK).
export const INVENTORY_STATUSES = ['in_progress', 'paused', 'finished', 'cancelled'] as const;
export const VISIT_STATUSES = ['in_progress', 'completed'] as const;
export const DISCREPANCY_TYPES = ['location_mismatch', 'not_found', 'unknown_tag'] as const;
export const RESOLUTIONS = ['accept_location', 'justified', 'mark_missing', 'register_tag'] as const;

/** Levantamento inteiro. Contém vários setores visitados. */
@Entity('inventories')
export class InventoryOrmEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ unique: true }) code: string;                       // ex.: INV-2026-001
  @Column({ type: 'text', nullable: true }) description: string;
  @Column({ default: 'in_progress' }) status: string;
  @Column({ name: 'started_at', type: 'timestamptz', default: () => 'now()' }) startedAt: Date;
  @Column({ name: 'finished_at', type: 'timestamptz', nullable: true }) finishedAt: Date;
  @Column({ name: 'created_by_user_id', nullable: true }) createdByUserId: string;
  // Snapshot da conciliação (preenchido no finish, para o relatório ficar estável).
  @Column({ name: 'expected_count', type: 'int', nullable: true }) expectedCount: number;
  @Column({ name: 'conform_count', type: 'int', nullable: true }) conformCount: number;
  @Column({ name: 'out_of_scope_count', type: 'int', nullable: true }) outOfScopeCount: number;
  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt: Date;
}

/** Setor visitado dentro de um inventário. Escopo aberto: adicionado ao ser selecionado. */
@Entity('inventory_sector_visits')
export class InventorySectorVisitOrmEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'inventory_id' }) inventoryId: string;
  @Column({ name: 'sector_id' }) sectorId: string;
  @Column({ default: 'in_progress' }) status: string;
  @Column({ name: 'started_at', type: 'timestamptz', default: () => 'now()' }) startedAt: Date;
  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true }) completedAt: Date;
  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
}

/** Leitura = FATO BRUTO. Não tem campo de inconsistência (o julgamento é adiado). */
@Entity('inventory_reads')
export class InventoryReadOrmEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'inventory_id' }) inventoryId: string;
  @Column({ name: 'sector_visit_id' }) sectorVisitId: string;
  @Column() epc: string;
  @Column({ name: 'asset_id', nullable: true }) assetId: string;   // resolvido no momento da leitura
  @Column({ name: 'rfid_tag_id', nullable: true }) rfidTagId: string;
  @Column({ name: 'device_id', nullable: true }) deviceId: string;
  @Column({ type: 'int', nullable: true }) rssi: number;
  @Column({ name: 'operator_id', nullable: true }) operatorId: string;
  @Column({ name: 'read_at', type: 'timestamptz', default: () => 'now()' }) readAt: Date;
  // --- Coletor Android (RfidInventory) ---
  // clientBatchId é a CHAVE DE IDEMPOTÊNCIA do lote: o worker do coletor reenvia
  // o mesmo lote quando a resposta se perde (timeout depois do commit). O índice
  // único parcial (client_batch_id, epc) transforma esse reenvio em no-op.
  @Column({ name: 'client_batch_id', type: 'uuid', nullable: true }) clientBatchId: string;
  // Hits agregados no coletor: distingue leitura sólida (dezenas) de leitura de borda.
  @Column({ name: 'read_count', type: 'int', default: 1 }) readCount: number;
  @Column({ type: 'varchar', length: 64, nullable: true }) tid: string;
}

/** Divergência produzida pela conciliação; resolvida depois (pode ser após o fechamento). */
@Entity('inventory_discrepancies')
export class InventoryDiscrepancyOrmEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'inventory_id' }) inventoryId: string;
  @Column() type: string; // location_mismatch | not_found | unknown_tag
  @Column({ name: 'asset_id', nullable: true }) assetId: string;
  @Column({ nullable: true }) epc: string;
  @Column({ name: 'expected_sector_id', nullable: true }) expectedSectorId: string;
  @Column({ name: 'found_sector_id', nullable: true }) foundSectorId: string;
  @Column({ nullable: true }) resolution: string;
  @Column({ name: 'resolution_notes', type: 'text', nullable: true }) resolutionNotes: string;
  @Column({ name: 'resolved_by_user_id', nullable: true }) resolvedByUserId: string;
  @Column({ name: 'resolved_at', type: 'timestamptz', nullable: true }) resolvedAt: Date;
  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
}
