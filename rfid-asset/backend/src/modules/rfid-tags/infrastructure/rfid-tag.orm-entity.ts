import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn, DeleteDateColumn,
} from 'typeorm';

export const RFID_STATUSES = [
  'active', 'inactive', 'in_use', 'damaged', 'lost', 'retired', 'blocked',
] as const;

@Entity('rfid_tags')
export class RfidTagOrmEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ unique: true }) epc: string;
  @Column({ name: 'rfid_code', nullable: true, unique: true }) rfidCode: string;
  @Column({ name: 'serial_number', nullable: true }) serialNumber: string;
  @Column({ nullable: true }) manufacturer: string;
  @Column({ name: 'tag_type', default: 'passive' }) tagType: string;
  @Column({ type: 'enum', enum: RFID_STATUSES, default: 'active' }) status: string;
  @Column({ type: 'text', nullable: true }) notes: string;
  @Column({ name: 'registered_at', type: 'timestamptz', default: () => 'now()' }) registeredAt: Date;
  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt: Date;
  @DeleteDateColumn({ name: 'deleted_at' }) deletedAt?: Date;
}
