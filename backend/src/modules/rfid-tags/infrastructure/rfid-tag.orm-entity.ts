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
  // Origem do cadastro: 'manual' | 'reader' | 'import'.
  @Column({ default: 'manual' }) source: string;

  // ---- Bancos de memória Gen2 (hex, alinhados a word de 16 bits) ----
  // TID (banco 0x10): identificador de fábrica, único quando presente.
  @Column({ name: 'tid', nullable: true, unique: true }) tid: string;
  // PC (Protocol Control) — 1 word do banco EPC.
  @Column({ name: 'pc_word', nullable: true }) pcWord: string;
  @Column({ name: 'epc_word_count', type: 'int', nullable: true }) epcWordCount: number;
  // User memory (banco 0x11): tamanho variável por chip.
  @Column({ name: 'user_memory', type: 'text', nullable: true }) userMemory: string;
  // Banco Reservado (0x00): senhas nunca retornam em listagens (select:false).
  @Column({ name: 'access_password', nullable: true, select: false }) accessPassword: string;
  @Column({ name: 'kill_password', nullable: true, select: false }) killPassword: string;
  // Tamanhos reportados pelo leitor (em bits).
  @Column({ name: 'epc_bits', type: 'int', nullable: true }) epcBits: number;
  @Column({ name: 'tid_bits', type: 'int', nullable: true }) tidBits: number;
  @Column({ name: 'user_bits', type: 'int', nullable: true }) userBits: number;
  // Estado de lock por banco (permalock etc.).
  @Column({ name: 'lock_state', type: 'jsonb', nullable: true }) lockState: Record<string, unknown>;
  @Column({ name: 'last_read_at', type: 'timestamptz', nullable: true }) lastReadAt: Date;

  @Column({ type: 'enum', enum: RFID_STATUSES, default: 'active' }) status: string;
  @Column({ type: 'text', nullable: true }) notes: string;
  @Column({ name: 'registered_at', type: 'timestamptz', default: () => 'now()' }) registeredAt: Date;
  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt: Date;
  @DeleteDateColumn({ name: 'deleted_at' }) deletedAt?: Date;
}
