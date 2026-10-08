import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn, DeleteDateColumn,
} from 'typeorm';

@Entity('sectors')
export class SectorOrmEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column() name: string;
  @Column({ unique: true, nullable: true }) acronym?: string;
  @Column({ name: 'manager_id', nullable: true }) managerId: string;
  @Column({ nullable: true }) location: string;
  @Column({ type: 'enum', enum: ['active', 'blocked', 'inactive'], default: 'active' })
  status: string;
  @Column({ name: 'erp_empresa', type: 'int', nullable: true }) erpEmpresa: number | null;
  @Column({ name: 'erp_codigo', type: 'int', nullable: true }) erpCodigo: number | null;
  @Column({ name: 'erp_synced_at', type: 'timestamptz', nullable: true }) erpSyncedAt: Date | null;
  @Column({ name: 'erp_hash', type: 'varchar', length: 64, nullable: true }) erpHash: string | null;
  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt: Date;
  @DeleteDateColumn({ name: 'deleted_at' }) deletedAt?: Date;
}
