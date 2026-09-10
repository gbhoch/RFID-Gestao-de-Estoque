// Regras EPC Gen2 (ISO/IEC 18000-6C) no frontend — espelham backend/domain/gen2.ts.
// Memória endereçada em words de 16 bits; validação de hex/alinhamento/tamanho.

export enum Gen2Bank { RESERVED = 0, EPC = 1, TID = 2, USER = 3 }

export const GEN2_BANKS = [
  { value: Gen2Bank.RESERVED, text: 'Reservado (senhas)' },
  { value: Gen2Bank.EPC, text: 'EPC' },
  { value: Gen2Bank.TID, text: 'TID' },
  { value: Gen2Bank.USER, text: 'User' },
];

// Bancos que o usuário pode LER (EPC, TID, User).
export const READ_BANKS = GEN2_BANKS.filter((b) => b.value !== Gen2Bank.RESERVED);
// Bancos de DADOS graváveis (EPC, User). TID é read-only; Reservado é senha/lock.
export const WRITE_BANKS = GEN2_BANKS.filter(
  (b) => b.value === Gen2Bank.EPC || b.value === Gen2Bank.USER,
);

export const WORD_HEX = 4;
export const WORD_BITS = 16;
export const EPC_MAX_BITS = 512;
export const HEX_WORDS = /^([0-9A-Fa-f]{4})*$/;
export const HEX_PASSWORD = /^[0-9A-Fa-f]{8}$/;

export const normalizeHex = (h: string | null | undefined): string =>
  (h ?? '').replace(/\s+/g, '').toUpperCase();
export const hexWords = (h: string): number => Math.ceil(normalizeHex(h).length / WORD_HEX);
export const hexBits = (h: string): number => hexWords(h) * WORD_BITS;

/** Retorna mensagem de erro do campo hex alinhado a word, ou null se válido. */
export function validateWordHex(
  h: string,
  opts: { maxBits?: number; required?: boolean } = {},
): string | null {
  const v = normalizeHex(h);
  if (!v) return opts.required ? 'Campo obrigatório' : null;
  if (!/^[0-9A-Fa-f]+$/.test(v)) return 'Apenas dígitos hexadecimais (0-9, A-F)';
  if (v.length % WORD_HEX !== 0)
    return 'Alinhe a word: use múltiplos de 4 dígitos (16 bits)';
  if (opts.maxBits && hexBits(v) > opts.maxBits) return `Excede ${opts.maxBits} bits`;
  return null;
}

/** Valida senha (access/kill): 32 bits = 8 dígitos hex. Vazio é permitido. */
export function validatePassword(h: string): string | null {
  const v = normalizeHex(h);
  if (!v) return null;
  return HEX_PASSWORD.test(v) ? null : 'Senha: exatamente 8 dígitos hex (32 bits)';
}

/** Valida a word de PC (1 word = 4 dígitos hex). Vazio é permitido. */
export function validatePc(h: string): string | null {
  const v = normalizeHex(h);
  if (!v) return null;
  return /^[0-9A-Fa-f]{4}$/.test(v) ? null : 'PC deve ter 1 word (4 dígitos hex)';
}
