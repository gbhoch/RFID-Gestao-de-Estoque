import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn, DeleteDateColumn,
} from 'typeorm';

@Entity('assets')
export class AssetOrmEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'asset_code', unique: true }) assetCode: string;
  @Column() name: string;
  @Column({ name: 'category_id' }) categoryId: string;
  @Column({ nullable: true }) brand: string;
  @Column({ nullable: true }) model: string;
  @Column({ name: 'serial_number', nullable: true }) serialNumber: string;
  @Column({ name: 'acquisition_date', type: 'date', nullable: true }) acquisitionDate: Date;
  @Column({ name: 'acquisition_value', type: 'numeric', precision: 14, scale: 2, nullable: true })
  acquisitionValue: number;
  @Column({ name: 'invoice_number', nullable: true }) invoiceNumber: string;
  @Column({ name: 'cost_center', nullable: true }) costCenter: string;
  @Column({ name: 'sector_id', nullable: true }) sectorId: string;
  @Column({ name: 'owner_id', nullable: true }) ownerId: string;
  @Column({ name: 'warranty_until', type: 'date', nullable: true }) warrantyUntil: Date;
  @Column({ name: 'rfid_tag_id', nullable: true, unique: true }) rfidTagId: string;
  @Column({
    type: 'enum',
    enum: ['available','in_use','maintenance','reserved','missing','loaned','written_off','scrapped'],
    default: 'available',
  })
  status: string;
  @Column({ name: 'erp_asset_id', nullable: true }) erpAssetId: string;
  @Column({ type: 'text', nullable: true }) notes: string;

  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt: Date;
  @DeleteDateColumn({ name: 'deleted_at' }) deletedAt?: Date;
}
