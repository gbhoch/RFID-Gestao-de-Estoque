import type { CapacitorConfig } from '@capacitor/cli';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Configuração do app Android (Capacitor) — PROVA DE CONCEITO.
 *
 * O app não empacota o Angular: ele abre o sistema web remoto via `server.url`,
 * e o leitor TSL é exposto pelo plugin nativo `RfidReader` (android/.../rfidreader).
 *
 * A URL vem de fora do versionamento, nesta ordem:
 *   1. variável de ambiente CAP_SERVER_URL
 *   2. capacitor.local.json  ({ "serverUrl": "http://<IP_DO_PC>:8080" }) — ver
 *      capacitor.local.example.json
 *
 * O valor é lido em `npx cap sync`/`npx cap run` e gravado em
 * android/app/src/main/assets/capacitor.config.json (gerado, ignorado pelo git).
 * Trocar o IP = editar o arquivo local e rodar `npx cap sync android` de novo.
 *
 * ATENÇÃO: `cleartext: true` libera HTTP sem TLS e existe só para o teste na LAN.
 * Produção exige HTTPS (server.url https://..., cleartext removido).
 */
function resolveServerUrl(): string | undefined {
  const fromEnv = process.env['CAP_SERVER_URL']?.trim();
  if (fromEnv) return fromEnv;

  const localFile = join(__dirname, 'capacitor.local.json');
  if (existsSync(localFile)) {
    const { serverUrl } = JSON.parse(readFileSync(localFile, 'utf8')) as { serverUrl?: string };
    if (serverUrl?.trim()) return serverUrl.trim();
  }

  console.warn('[capacitor.config] server.url não definido: crie capacitor.local.json ou defina CAP_SERVER_URL.');
  return undefined;
}

const serverUrl = resolveServerUrl();

const config: CapacitorConfig = {
  appId: 'com.megagoglio.rfidgestao',
  appName: 'RFID Gestão',
  // Só um fallback local (index.html/erro.html): o sistema real vem de server.url.
  webDir: 'capacitor-www',
  server: serverUrl
    ? {
        url: serverUrl,
        cleartext: serverUrl.startsWith('http://'),
        // Página local mostrada se o servidor não responder (PC desligado, IP errado).
        errorPath: 'erro.html',
      }
    : undefined,
  android: {
    // Permite inspecionar o WebView pelo chrome://inspect durante o teste.
    webContentsDebuggingEnabled: true,
  },
};

export default config;
