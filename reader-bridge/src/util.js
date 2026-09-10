'use strict';

// Erro com status HTTP para o servidor mapear (400 = dado inválido, 503 = leitor/indisponível).
class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// Códigos de banco Gen2 (iguais ao enum do backend): 0=Reservado, 1=EPC, 2=TID, 3=User.
const BANK_NAMES = { 0: 'Reserved', 1: 'EPC', 2: 'TID', 3: 'User' };

const normHex = (h) => String(h || '').replace(/\s+/g, '').toUpperCase();
// Hex alinhado a word: só dígitos hex e comprimento múltiplo de 4 (16 bits).
const isWordHex = (h) => /^[0-9A-Fa-f]*$/.test(h) && h.length % 4 === 0;
const hexToBuf = (h) => Buffer.from(normHex(h), 'hex');
const bufToHex = (b) => Buffer.from(b).toString('hex').toUpperCase();

module.exports = { HttpError, BANK_NAMES, normHex, isWordHex, hexToBuf, bufToHex };
