'use strict';
// ============================================================================
//  BINDING NATIVO DAS DLLs CHAFON (CF*Api.dll) via koffi (FFI)
// ----------------------------------------------------------------------------
//  ⚠️  ATENÇÃO: as assinaturas abaixo são a MELHOR RECONSTRUÇÃO da família de
//  API CF*Api a partir dos nomes exportados — o fabricante NÃO forneceu headers.
//  ANTES de usar com hardware real (SIMULATE=false):
//    1) Confirme a arquitetura das DLLs (32/64 bits) e rode um Node de MESMA
//       arquitetura. 32-bit DLL exige Node 32-bit (ver README).
//    2) Valide a LEITURA primeiro (readBank), que é inócua. Só depois habilite
//       ALLOW_WRITE=true para writeBank/lock (lock/kill são IRREVERSÍVEIS).
//    3) Ajuste as assinaturas nesta seção conforme o comportamento observado.
//  Os NOMES das funções são reais (extraídos das DLLs). Os TIPOS são estimados.
// ============================================================================

const path = require('path');
const { HttpError, hexToBuf, bufToHex, normHex } = require('./util');

function create(cfg) {
  let koffi;
  try {
    koffi = require('koffi');
  } catch (e) {
    throw new HttpError(503, 'koffi não instalado — rode "npm install" no reader-bridge');
  }

  const dllFile = { net: 'CFNetApi.dll', com: 'CFComApi.dll', hid: 'CFHidApi.dll' }[cfg.transport];
  const prefix = { net: 'CFNet', com: 'CFCom', hid: 'CFHid' }[cfg.transport];
  if (!dllFile) throw new HttpError(400, `TRANSPORT inválido: ${cfg.transport}`);

  const lib = koffi.load(path.join(cfg.dllDir, dllFile));
  const cc = cfg.callConv === 'cdecl' ? '' : '__stdcall ';
  const fn = (proto) => lib.func(cc + proto);

  // ---- Declarações (AJUSTE AQUI conforme o header do fabricante) ------------
  // Handle do dispositivo via out-param (void**). Retorno 0 = sucesso.
  const OpenNet = prefix === 'CFNet'
    ? fn(`int ${prefix}_OpenDevice(_Out_ void **h, const char *ip, int port)`) : null;
  const OpenCom = prefix === 'CFCom'
    ? fn(`int ${prefix}_OpenDevice(_Out_ void **h, int com, int baud)`) : null;
  const OpenHid = prefix === 'CFHid'
    ? fn(`int ${prefix}_OpenDevice(_Out_ void **h, int index)`) : null;
  const CloseDevice = fn(`int ${prefix}_CloseDevice(void *h)`);

  // ReadCardG2/WriteCardG2: mem=banco(0..3), wordPtr, num=nº de words,
  // pwd=4 bytes (access password), epc identifica a tag, data in/out.
  const ReadCardG2 = fn(
    `int ${prefix}_ReadCardG2(void *h, uint8_t *epc, uint8_t epcBytes, ` +
    `uint8_t mem, uint8_t wordPtr, uint8_t num, uint8_t *pwd, ` +
    `_Out_ uint8_t *data, _Out_ uint8_t *errCode)`);
  const WriteCardG2 = fn(
    `int ${prefix}_WriteCardG2(void *h, uint8_t *epc, uint8_t epcBytes, ` +
    `uint8_t mem, uint8_t wordPtr, uint8_t num, uint8_t *pwd, ` +
    `uint8_t *data, _Out_ uint8_t *errCode)`);
  const LockCardG2 = fn(
    `int ${prefix}_LockCardG2(void *h, uint8_t *epc, uint8_t epcBytes, ` +
    `uint8_t memLock, uint8_t lockType, uint8_t *pwd, _Out_ uint8_t *errCode)`);

  let handle = null;

  const pwdBuf = (accessPassword) => {
    const b = Buffer.alloc(4); // senha de acesso: 32 bits
    if (accessPassword) hexToBuf(accessPassword).copy(b);
    return b;
  };
  const epcBuf = (epc) => {
    if (!epc) throw new HttpError(400, 'EPC da etiqueta é obrigatório para operações de banco');
    return hexToBuf(epc);
  };
  const check = (rc, errCode) => {
    if (rc !== 0) throw new HttpError(502, `Leitor retornou erro rc=${rc} err=0x${(errCode[0] || 0).toString(16)}`);
  };

  return {
    async connect() {
      const hp = [null];
      let rc;
      if (prefix === 'CFNet') rc = OpenNet(hp, cfg.reader.ip, cfg.reader.port);
      else if (prefix === 'CFCom') rc = OpenCom(hp, parseInt(String(cfg.reader.com).replace(/\D/g, ''), 10) || 0, cfg.reader.baud);
      else rc = OpenHid(hp, 0);
      if (rc !== 0) throw new HttpError(503, `Falha ao abrir o leitor (${prefix}_OpenDevice rc=${rc})`);
      handle = hp[0];
    },

    async readBank(bank, wordPtr, wordCount, accessPassword, epc) {
      const e = epcBuf(epc);
      const num = Math.max(1, Number(wordCount) || 0);
      const out = Buffer.alloc(num * 2);
      const err = Buffer.alloc(1);
      const rc = ReadCardG2(handle, e, e.length, bank, wordPtr || 0, num, pwdBuf(accessPassword), out, err);
      check(rc, err);
      return bufToHex(out);
    },

    async writeBank(bank, wordPtr, dataHex, accessPassword, epc) {
      const e = epcBuf(epc);
      const data = hexToBuf(dataHex);
      const err = Buffer.alloc(1);
      const rc = WriteCardG2(handle, e, e.length, bank, wordPtr || 0, data.length / 2, pwdBuf(accessPassword), data, err);
      check(rc, err);
    },

    async lock(bank, lock, permanent, accessPassword, epc) {
      const e = epcBuf(epc);
      const err = Buffer.alloc(1);
      // lockType: mapeamento depende do fabricante — validar na doc/hardware.
      const lockType = (lock ? 0x02 : 0x00) | (permanent ? 0x01 : 0x00);
      const rc = LockCardG2(handle, e, e.length, bank, lockType, pwdBuf(accessPassword), err);
      check(rc, err);
    },

    async inventory() {
      // Inventário contínuo usa InventoryG2 + GetTagBuf/callback; deixado para a
      // fase de validação em hardware. Por ora, não suportado no modo real.
      throw new HttpError(501, 'Inventário nativo pendente de validação — use SIMULATE para testar o fluxo');
    },

    async close() {
      if (handle) { try { CloseDevice(handle); } catch (_) {} handle = null; }
    },
  };
}

module.exports = { create };
