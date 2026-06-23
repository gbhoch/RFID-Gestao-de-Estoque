import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
} from 'typeorm';

export const INVENTORY_STATUSES = [
  'open', 'in_progress', 'finished', 'cancelled',
] as const;

@Entity('inventory_sessions')
export class InventorySessionOrmEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'sector_id' }) sectorId: string;
  @Column({ name: 'user_id' }) userId: string;
  @Column({ type: 'enum', enum: INVENTORY_STATUSES, default: 'open' }) status: string;
  @Column({ name: 'expected_count', default: 0 }) expectedCount: number;
  @Column({ name: 'found_count', default: 0 }) foundCount: number;
  @Column({ name: 'divergent_count', default: 0 }) divergentCount: number;
  @Column({ name: 'accuracy_rate', type: 'numeric', precision: 5, scale: 2, nullable: true })
  accuracyRate: number;
  @Column({ name: 'started_at', type: 'timestamptz', default: () => 'now()' }) startedAt: Date;
  @Column({ name: 'finished_at', type: 'timestamptz', nullable: true }) finishedAt: Date;
  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
}

@Entity('inventory_reads')
export class InventoryReadOrmEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'session_id' }) sessionId: string;
  @Column() epc: string;
  @Column({ name: 'asset_id', nullable: true }) assetId: string;
  @Column({ name: 'rfid_tag_id', nullable: true }) rfidTagId: string;
  @Column({ name: 'device_id', nullable: true }) deviceId: string;
  @Column({ nullable: true }) rssi: number;
  @Column({ name: 'operator_id', nullable: true }) operatorId: string;
  @Column({ name: 'is_unexpected', default: false }) isUnexpected: boolean;
  @Column({ name: 'read_at', type: 'timestamptz', default: () => 'now()' }) readAt: Date;
}
