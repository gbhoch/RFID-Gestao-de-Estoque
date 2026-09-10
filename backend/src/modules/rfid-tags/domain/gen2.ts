// Regras do padrão EPC Gen2 (ISO/IEC 18000-6C) para a memória de tags UHF.
// A memória é endereçada em WORDS de 16 bits. Este arquivo é a fonte da
// verdade de validação, compartilhada por DTO e serviço.

export enum Gen2Bank {
  RESERVED = 0, // Kill Password (words 0-1) + Access Password (words 2-3)
  EPC = 1,      // CRC (word 0), PC (word 1), EPC (words 2+)
  TID = 2,      // Identificador de fábrica — somente leitura
  USER = 3,     // Memória de usuário — tamanho variável por chip
}

export const GEN2_BANK_LABELS: Record<Gen2Bank, string> = {
  [Gen2Bank.RESERVED]: 'Reservado',
  [Gen2Bank.EPC]: 'EPC',
  [Gen2Bank.TID]: 'TID',
  [Gen2Bank.USER]: 'User',
};

export const WORD_BITS = 16;
export const WORD_HEX = 4; // 4 dígitos hex = 1 word = 16 bits
export const PASSWORD_HEX = 8; // senha = 32 bits (2 words)
export const EPC_MAX_HEX = 128; // EPC até 512 bits (32 words)

// Hex que forma words inteiras (múltiplo de 4 dígitos): '', 'ABCD', '0123ABCD'...
export const HEX_WORDS = /^([0-9A-Fa-f]{4})*$/;
// Senha de acesso/kill: exatamente 8 dígitos hex (32 bits).
export const HEX_PASSWORD = /^[0-9A-Fa-f]{8}$/;

export const isHexWordAligned = (hex: string): boolean => HEX_WORDS.test(hex);
export const hexWords = (hex: string): number => Math.ceil(hex.length / WORD_HEX);
export const hexBits = (hex: string): number => hexWords(hex) * WORD_BITS;
export const normalizeHex = (hex: string): string =>
  hex.replace(/\s+/g, '').toUpperCase();

/** Campo persistido em rfid_tags que recebe o dado lido de cada banco. */
export const BANK_FIELD: Record<Gen2Bank, 'epc' | 'tid' | 'userMemory'> = {
  [Gen2Bank.EPC]: 'epc',
  [Gen2Bank.TID]: 'tid',
  [Gen2Bank.USER]: 'userMemory',
  // Reservado é senha/lock — tratado à parte, não mapeia para um campo de dado.
  [Gen2Bank.RESERVED]: 'epc',
};
