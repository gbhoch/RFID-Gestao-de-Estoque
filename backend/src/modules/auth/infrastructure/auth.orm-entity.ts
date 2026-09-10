import {
  Entity, PrimaryGeneratedColumn, Column, ManyToOne, ManyToMany,
  JoinColumn, JoinTable, CreateDateColumn, UpdateDateColumn, DeleteDateColumn,
} from 'typeorm';

@Entity('permissions')
export class PermissionEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ unique: true }) code: string;
  @Column() module: string;
  @Column({ nullable: true }) description: string;
}

@Entity('roles')
export class RoleEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ unique: true }) name: string;
  @Column({ nullable: true }) description: string;
  @Column({ name: 'is_system', default: false }) isSystem: boolean;

  @ManyToMany(() => PermissionEntity, { eager: true })
  @JoinTable({
    name: 'role_permissions',
    joinColumn: { name: 'role_id' },
    inverseJoinColumn: { name: 'permission_id' },
  })
  permissions: PermissionEntity[];

  @DeleteDateColumn({ name: 'deleted_at' }) deletedAt?: Date;
}

@Entity('users')
export class UserEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column() name: string;
  @Column({ unique: true, nullable: true }) registration: string;
  // Opcional: nem todo operador de galpão tem e-mail corporativo. No Postgres
  // vários NULL convivem sob UNIQUE, então a unicidade vale só para os preenchidos.
  @Column({ unique: true, nullable: true }) email: string;
  @Column({ nullable: true }) phone: string;
  @Column({ nullable: true }) position: string;
  @Column({ name: 'sector_id', nullable: true }) sectorId: string;
  @Column({ unique: true }) login: string;
  @Column({ name: 'password_hash' }) passwordHash: string;
  @Column({ name: 'role_id' }) roleId: string;

  @ManyToOne(() => RoleEntity, { eager: true })
  @JoinColumn({ name: 'role_id' })
  role: RoleEntity;

  @Column({ type: 'enum', enum: ['active', 'blocked', 'inactive'], default: 'active' })
  status: 'active' | 'blocked' | 'inactive';

  @Column({ name: 'failed_attempts', default: 0 }) failedAttempts: number;
  @Column({ name: 'blocked_until', type: 'timestamptz', nullable: true }) blockedUntil?: Date;
  @Column({ name: 'last_login_at', type: 'timestamptz', nullable: true }) lastLoginAt?: Date;

  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt: Date;
  @DeleteDateColumn({ name: 'deleted_at' }) deletedAt?: Date;
}

@Entity('refresh_tokens')
export class RefreshTokenEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'user_id' }) userId: string;
  @Column({ name: 'token_hash' }) tokenHash: string;
  @Column({ name: 'expires_at', type: 'timestamptz' }) expiresAt: Date;
  @Column({ default: false }) revoked: boolean;
  @Column({ nullable: true }) ip: string;
  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
}
