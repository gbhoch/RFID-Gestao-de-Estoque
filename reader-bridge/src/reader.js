'use strict';
const cfg = require('./config');
const { HttpError, normHex, isWordHex } = require('./util');

/**
 * Fachada do leitor: expõe as operações que o backend consome.
 * Em SIMULATE, responde dados de exemplo (sem hardware). No modo real,
 * delega para o binding nativo (src/native.js).
 */
class Reader {
  constructor() {
    this.connected = false;
    this.native = null;
  }

  async ensure() {
    if (this.connected) return;
    if (cfg.simulate) { this.connected = true; return; }
    this.native = require('./native').create(cfg);
    await this.native.connect();
    this.connected = true;
  }

  async inventory() {
    if (cfg.simulate) {
      return [{ epc: 'E28011700000020F4A8C1234', tid: 'E280110520007A5D', rssi: -52 }];
    }
    return this.native.inventory();
  }

  async readBank(body) {
    const bank = Number(body.bank);
    if (bank === 0) throw new HttpError(400, 'Banco Reservado (senhas) não é legível');
    if (![1, 2, 3].includes(bank)) throw new HttpError(400, `Banco inválido: ${body.bank}`);
    if (cfg.simulate) return this._simRead(bank, body.wordCount);
    return this.native.readBank(bank, body.wordPtr ?? 0, body.wordCount ?? 0, body.accessPassword, body.epc);
  }

  async writeBank(body) {
    const bank = Number(body.bank);
    if (bank === 2) throw new HttpError(400, 'Banco TID é somente leitura');
    const data = normHex(body.dataHex);
    if (!isWordHex(data)) throw new HttpError(400, 'dataHex deve ser hexadecimal alinhado a word');
    if (!cfg.simulate && !cfg.allowWrite)
      throw new HttpError(503, 'Escrita desabilitada no bridge (defina ALLOW_WRITE=true após validar)');
    if (cfg.simulate) return;
    return this.native.writeBank(bank, body.wordPtr ?? 0, data, body.accessPassword, body.epc);
  }

  async lock(body) {
    const bank = Number(body.bank);
    if (![0, 1, 2, 3].includes(bank)) throw new HttpError(400, `Banco inválido: ${body.bank}`);
    if (!cfg.simulate && !cfg.allowWrite)
      throw new HttpError(503, 'Lock desabilitado no bridge (defina ALLOW_WRITE=true após validar)');
    if (cfg.simulate) return;
    return this.native.lock(bank, !!body.lock, !!body.permanent, body.accessPassword, body.epc);
  }

  _simRead(bank, wordCount) {
    if (bank === 1) return 'E28011700000020F4A8C1234'; // EPC exemplo (96 bits)
    if (bank === 2) return 'E280110520007A5D';          // TID exemplo (64 bits)
    const words = Math.max(1, Number(wordCount) || 4);   // User: zeros do tamanho pedido
    return '0'.repeat(words * 4);
  }
}

module.exports = { Reader };
