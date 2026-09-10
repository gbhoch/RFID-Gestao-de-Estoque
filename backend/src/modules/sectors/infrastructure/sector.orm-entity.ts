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
  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt: Date;
  @DeleteDateColumn({ name: 'deleted_at' }) deletedAt?: Date;
}
