#!/usr/bin/env node
/**
 * Simula o coletor Android (RfidInventory) contra a API, por HTTP.
 *
 * Faz EXATAMENTE as mesmas chamadas que o app faz, na mesma ordem, com os mesmos
 * campos. Serve para validar o fluxo de ponta a ponta sem depender do leitor TSL
 * nem de tablet — e para provar as três regras que existem por causa do modo
 * offline: idempotência, reabertura de setor e bloqueio por inventário encerrado.
 *
 * Uso:
 *   node scripts/simulate-collector.mjs
 *   node scripts/simulate-collector.mjs --user operador --pass Senha@123
 *   API=http://172.16.0.185:3000 node scripts/simulate-collector.mjs
 *
 * Deixa um inventário novo no histórico (encerrado ao final).
 */

const API = process.env.API ?? 'http://localhost:3000';
const args = process.argv.slice(2);
const argOf = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

const USER = argOf('user', 'admin');
const PASS = argOf('pass', 'Admin@123');

let token = null;
let passed = 0;
let failed = 0;

const uuid = () => crypto.randomUUID();

async function call(method, path, body) {
  const res = await fetch(`${API}/api/v1${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = text; }
  return { status: res.status, body: json };
}

const ok2xx = (s) => s >= 200 && s < 300;

function check(label, ok, detail = "") {
  if (ok) { passed++; console.log(`  \x1b[32mOK\x1b[0m   ${label}`); }
  else { failed++; console.log(`  \x1b[31mFALHA\x1b[0m ${label}${detail ? ` — ${detail}` : ''}`); }
}

function step(n, title) {
  console.log(`\n\x1b[1m${n}. ${title}\x1b[0m`);
}

/** Monta o payload de leituras como o app monta, a partir do TagAggregate. */
const readsPayload = (epcs, deviceId) => epcs.map((epc, i) => ({
  epc,
  tid: null,
  rssi: -50 - i,
  readCount: 10 + i,
  deviceId,
  readAt: new Date().toISOString(),
}));

async function main() {
  console.log(`\x1b[1mSimulando o coletor contra ${API}\x1b[0m`);
  const deviceId = 'simulador-' + uuid().slice(0, 8);

  // ---------------------------------------------------------------- 1. Login
  step(1, 'Login do operador');
  const login = await call('POST', '/auth/login', { login: USER, password: PASS });
  if (!ok2xx(login.status) || !login.body?.accessToken) {
    console.error(`  Nao foi possivel entrar como "${USER}" (HTTP ${login.status}).`);
    console.error(`  ${JSON.stringify(login.body)}`);
    process.exitCode = 1;
    return;
  }
  token = login.body.accessToken;
  check(`autenticado como ${USER}`, true);

  // ------------------------------------------------------- 2. Setores (cache)
  step(2, 'Baixar setores (o app guarda no Room para usar offline)');
  const sectors = await call('GET', '/sectors?skip=0&take=200');
  check('GET /sectors respondeu 200', ok2xx(sectors.status),
    sectors.status === 403
      ? 'perfil sem sectors:read — aplique a migracao ou rode o seed'
      : `HTTP ${sectors.status}`);
  if (!ok2xx(sectors.status)) { process.exitCode = 1; return; }
  const sectorList = sectors.body.data ?? [];
  check(`${sectorList.length} setores no cadastro`, sectorList.length > 0);

  // -------------------------------------------- 3. Escolher setor com ativos
  step(3, 'Escolher um setor que tenha ativos etiquetados');
  const assets = (await call('GET', '/assets?skip=0&take=200')).body?.data ?? [];
  const tags = (await call('GET', '/rfid-tags?skip=0&take=200')).body?.data ?? [];
  const epcByTagId = new Map(tags.map((t) => [t.id, t.epc]));

  const bySector = new Map();
  for (const a of assets) {
    if (!a.sectorId || !a.rfidTagId) continue;
    const epc = epcByTagId.get(a.rfidTagId);
    if (!epc) continue;
    if (!bySector.has(a.sectorId)) bySector.set(a.sectorId, []);
    bySector.get(a.sectorId).push(epc);
  }

  const wanted = argOf('sector', null);
  let sector = wanted
    ? sectorList.find((s) => s.name === wanted || s.acronym === wanted)
    : sectorList.find((s) => (bySector.get(s.id) ?? []).length > 0);
  sector ??= sectorList[0];

  const realEpcs = bySector.get(sector.id) ?? [];
  check(`setor "${sector.name}" com ${realEpcs.length} ativo(s) etiquetado(s)`, true);
  if (realEpcs.length === 0) {
    console.log('  \x1b[33mAviso\x1b[0m: setor sem ativo etiquetado — as leituras virarao unknown_tag.');
  }

  // ----------------------------------------------------- 4. Inventario aberto
  step(4, 'Obter o inventario aberto (ou abrir um)');
  let current = (await call('GET', '/inventory/current')).body;
  if (!current) {
    const created = await call('POST', '/inventory', { description: 'Simulacao do coletor' });
    check('inventario criado', ok2xx(created.status),
      `HTTP ${created.status}: ${JSON.stringify(created.body)}`);
    current = created.body;
  }
  check(`inventario ${current.code} (${current.status})`, !!current?.id);

  // ------------------------------------------------------ 5. Visita ao setor
  step(5, 'Abrir a visita ao setor (o app resolve isso so na hora de enviar)');
  const visitRes = await call('POST', `/inventory/${current.id}/sectors`, { sectorId: sector.id });
  check('POST /sectors respondeu 201', ok2xx(visitRes.status),
    `HTTP ${visitRes.status}`);
  const visit = visitRes.body;

  const epcs = realEpcs.length ? realEpcs : ['E2800000000000000000SIM1', 'E2800000000000000000SIM2'];

  // --------------------------------------------------- 6. Enviar as leituras
  step(6, 'Enviar o lote de leituras');
  const batchA = uuid();
  const send = (batchId) => call('POST', `/inventory/${current.id}/reads`, {
    sectorVisitId: visit.id,
    clientBatchId: batchId,
    reads: readsPayload(epcs, deviceId),
  });

  const first = await send(batchA);
  check(`${first.body?.inserted ?? 0} leitura(s) gravada(s)`,
    ok2xx(first.status) && first.body?.inserted === epcs.length,
    `HTTP ${first.status}: ${JSON.stringify(first.body)}`);

  // ------------------------------------------- 7. IDEMPOTENCIA (o teste-chave)
  step(7, 'Reenviar o MESMO lote — simula a resposta que se perdeu');
  const again = await send(batchA);
  check('reenvio nao duplicou (inserted = 0)',
    ok2xx(again.status) && again.body?.inserted === 0,
    `HTTP ${again.status}: ${JSON.stringify(again.body)}`);

  // -------------------------------------------------- 8. Coleta tardia
  step(8, 'Concluir o setor e entao mandar coleta atrasada');
  const done = await call('PATCH', `/inventory/${current.id}/sectors/${visit.id}/complete`);
  check('setor marcado como concluido', ok2xx(done.status), `HTTP ${done.status}`);

  const late = await send(uuid());
  check('coleta atrasada foi aceita (setor reabriu)',
    ok2xx(late.status), `HTTP ${late.status}: ${JSON.stringify(late.body)}`);

  const visitNow = (await call('GET', `/inventory/${current.id}`)).body
    ?.visits?.find((v) => v.id === visit.id);
  check('visita voltou para in_progress', visitNow?.status === 'in_progress',
    `status=${visitNow?.status}`);

  // ------------------------------------------------ 9. Inventario encerrado
  step(9, 'Encerrar o inventario e tentar mandar coleta depois');
  await call('PATCH', `/inventory/${current.id}/sectors/${visit.id}/complete`);
  const finished = await call('POST', `/inventory/${current.id}/finish`);
  check('inventario encerrado', ok2xx(finished.status),
    `HTTP ${finished.status}`);
  console.log(`  esperados=${finished.body?.expectedCount} conformes=${finished.body?.conformCount} ` +
    `divergencias=${finished.body?.discrepancyCount}`);

  const blockedBatch = uuid();
  const blocked = await call('POST', `/inventory/${current.id}/reads`, {
    sectorVisitId: visit.id,
    clientBatchId: blockedBatch,
    reads: readsPayload(epcs, deviceId),
  });
  check('respondeu 409 (o app guarda como BLOQUEADA, nao descarta)',
    blocked.status === 409, `HTTP ${blocked.status}`);
  check('com codigo INVENTORY_FINISHED',
    blocked.body?.code === 'INVENTORY_FINISHED' ||
    blocked.body?.message?.code === 'INVENTORY_FINISHED',
    JSON.stringify(blocked.body));

  // --------------------------------------------------------- 10. Reabertura
  step(10, 'Gestor reabre o inventario e a coleta travada sobe');
  const reopened = await call('PATCH', `/inventory/${current.id}/reopen`);
  check('inventario reaberto', ok2xx(reopened.status),
    `HTTP ${reopened.status}: ${JSON.stringify(reopened.body)}`);

  const retried = await call('POST', `/inventory/${current.id}/reads`, {
    sectorVisitId: visit.id,
    clientBatchId: blockedBatch,
    reads: readsPayload(epcs, deviceId),
  });
  check('coleta que estava travada foi aceita', ok2xx(retried.status),
    `HTTP ${retried.status}: ${JSON.stringify(retried.body)}`);

  // Deixa o banco limpo: sem isso o inventario fica aberto e trava a tela web.
  step(11, 'Encerrar de novo (para nao deixar inventario aberto)');
  const closing = await call('POST', `/inventory/${current.id}/finish`);
  check('inventario encerrado', ok2xx(closing.status),
    `HTTP ${closing.status}`);

  console.log(`\n\x1b[1mResultado:\x1b[0m ${passed} ok, ${failed} falha(s)`);
  console.log(`Veja no frontend (npm start -> http://localhost:4200) em Inventario -> ${current.code}\n`);
  process.exitCode = failed ? 1 : 0;
}

main().catch((e) => {
  console.error('\nErro inesperado:', e.message);
  console.error('A API esta no ar? Tente: curl ' + API + '/api/docs');
  process.exitCode = 1;
});
