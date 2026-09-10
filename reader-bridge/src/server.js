'use strict';
const express = require('express');
const cfg = require('./config');
const { Reader } = require('./reader');

const app = express();
app.use(express.json());

const reader = new Reader();

// Envolve um handler: garante conexão e mapeia HttpError -> status HTTP.
const handle = (fn) => async (req, res) => {
  try {
    await reader.ensure();
    const out = await fn(req.body || {});
    res.json(out ?? { ok: true });
  } catch (e) {
    const status = e.status || 500;
    if (status >= 500) console.error(`[${req.path}]`, e.message);
    res.status(status).json({ message: e.message || 'erro no bridge' });
  }
};

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    simulate: cfg.simulate,
    transport: cfg.transport,
    allowWrite: cfg.allowWrite,
    connected: reader.connected,
  });
});

// Contrato consumido pelo backend (HttpBridgeReaderService).
app.post('/inventory', handle(async () => ({ tags: await reader.inventory() })));
app.post('/read-bank', handle(async (b) => ({ dataHex: await reader.readBank(b) })));
app.post('/write-bank', handle(async (b) => { await reader.writeBank(b); return { ok: true }; }));
app.post('/lock', handle(async (b) => { await reader.lock(b); return { ok: true }; }));

app.listen(cfg.port, () => {
  console.log(
    `reader-bridge ouvindo em http://localhost:${cfg.port} ` +
    `(simulate=${cfg.simulate}, transport=${cfg.transport}, allowWrite=${cfg.allowWrite})`,
  );
  if (cfg.simulate) {
    console.log('MODO SIMULAÇÃO — respondendo dados de exemplo. Veja o README para ativar o hardware.');
  }
});
