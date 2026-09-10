'use strict';
require('dotenv').config();
const path = require('path');

const bool = (v, def) => (v == null ? def : /^(1|true|yes|on)$/i.test(String(v)));

module.exports = {
  // Porta HTTP do bridge (o backend aponta READER_BRIDGE_URL para cá).
  port: Number(process.env.PORT || 8720),

  // SIMULATE=true (padrão): responde dados de exemplo, sem tocar no hardware.
  // Ligue para false só depois de validar as assinaturas nativas (ver README).
  simulate: bool(process.env.SIMULATE, true),

  // Trava de segurança para operações destrutivas (write/lock) no modo real.
  allowWrite: bool(process.env.ALLOW_WRITE, false),

  // Transporte: 'net' (TCP), 'com' (serial) ou 'hid' (USB).
  transport: (process.env.TRANSPORT || 'net').toLowerCase(),

  // Convenção de chamada das DLLs (32-bit costuma ser stdcall; 64-bit é unificado).
  callConv: (process.env.CALL_CONV || 'stdcall').toLowerCase(),

  reader: {
    ip: process.env.READER_IP || '192.168.1.250',
    port: Number(process.env.READER_PORT || 60000),
    com: process.env.READER_COM || 'COM3',
    baud: Number(process.env.READER_BAUD || 115200),
    addr: Number(process.env.READER_ADDR || 0xff), // endereço do leitor (0xFF = broadcast)
  },

  // Pasta com CFNetApi.dll / CFComApi.dll / CFHidApi.dll na máquina do leitor.
  dllDir: process.env.DLL_DIR || path.resolve(__dirname, '..', 'dll'),
};
