import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
} from 'typeorm';

export const MOVEMENT_TYPES = [
  'sector_transfer', 'owner_change', 'write_off', 'maintenance_return', 'loan',
] as const;

@Entity('asset_movements')
export class AssetMovementOrmEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'asset_id' }) assetId: string;
  @Column({ type: 'enum', enum: MOVEMENT_TYPES }) type: string;
  @Column({ name: 'user_id' }) userId: string;
  @Column({ name: 'from_sector_id', nullable: true }) fromSectorId: string;
  @Column({ name: 'to_sector_id', nullable: true }) toSectorId: string;
  @Column({ name: 'from_owner_id', nullable: true }) fromOwnerId: string;
  @Column({ name: 'to_owner_id', nullable: true }) toOwnerId: string;
  @Column({ type: 'text', nullable: true }) notes: string;
  @Column({ name: 'occurred_at', type: 'timestamptz', default: () => 'now()' }) occurredAt: Date;
  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
}

@Entity('asset_location_history')
export class AssetLocationHistoryOrmEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'asset_id' }) assetId: string;
  @Column({ name: 'sector_id', nullable: true }) sectorId: string;
  @Column({ name: 'user_id', nullable: true }) userId: string;
  @Column({ name: 'reader_id', nullable: true }) readerId: string;
  @Column({ name: 'recorded_at', type: 'timestamptz', default: () => 'now()' }) recordedAt: Date;
}
