import { Injectable, NgZone, computed, inject, signal } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { Subject } from 'rxjs';
import {
  RfidReader, type ReaderDevice, type ReaderStatus, type TagBatchItem,
} from '../../../core/rfid/rfid-reader.plugin';

export interface SavedReader {
  address: string;
  name: string;
}

const LAST_READER_KEY = 'rfid_reader:last';
const PREFIXES_KEY = 'rfid_reader:epc_prefixes';
/** Mesmo limite do plugin (EpcPrefixFilter.MAX_PREFIX_CHARS). */
export const MAX_PREFIX_CHARS = 63;

/**
 * Leitor TSL (plugin Capacitor RfidReader) para a tela de Inventário. Só é usado quando
 * Capacitor.isNativePlatform(); no navegador nada aqui é chamado.
 *
 * Guarda no aparelho (localStorage) o último leitor usado e os prefixos do filtro EPC.
 * O filtro é reaplicado a cada transição para "conectado" — inclusive na reconexão
 * automática que o plugin faz ao voltar do segundo plano.
 */
@Injectable({ providedIn: 'root' })
export class RfidReaderService {
  private zone = inject(NgZone);

  readonly isNative = Capacitor.isNativePlatform();
  readonly status = signal<ReaderStatus | null>(null);
  readonly triggerPressed = signal(false);
  readonly devices = signal<ReaderDevice[]>([]);
  readonly lastReader = signal<SavedReader | null>(readJson<SavedReader>(LAST_READER_KEY));
  readonly prefixes = signal<string[]>(readJson<string[]>(PREFIXES_KEY) ?? []);
  readonly error = signal<string | null>(null);
  /** ANDROID_ID, enviado como deviceId nas leituras do leitor. */
  readonly deviceId = signal<string | undefined>(undefined);

  readonly connected = computed(() => !!this.status()?.connected);
  readonly connecting = computed(() => this.status()?.state === 'connecting');
  /** Lendo agora: scan contínuo (botão) ou gatilho apertado. */
  readonly reading = computed(() => !!this.status()?.scanning || this.triggerPressed());

  /** Lotes do evento tagsRead, já dentro da zona do Angular. */
  readonly tags$ = new Subject<TagBatchItem[]>();

  private initialized: Promise<void> | null = null;

  /** Registra os listeners do plugin (uma vez por execução do app). */
  init(): Promise<void> {
    if (!this.isNative) return Promise.resolve();
    this.initialized ??= this.doInit().catch((e) => {
      this.initialized = null;
      this.error.set(messageOf(e, 'Falha ao iniciar o leitor.'));
    });
    return this.initialized;
  }

  /** Conecta ao último leitor usado, se houver um e se ainda não estiver conectado. */
  async autoConnect() {
    await this.init();
    const last = this.lastReader();
    const s = this.status();
    if (!last || s?.connected || s?.state === 'connecting') return;
    await this.connect(last);
  }

  async refreshDevices() {
    await this.run(async () => this.devices.set((await RfidReader.listPairedDevices()).devices));
  }

  async connect(device: SavedReader) {
    const saved = { address: device.address, name: device.name };
    this.lastReader.set(saved);
    writeJson(LAST_READER_KEY, saved);
    await this.run(async () => this.onStatus(await RfidReader.connect({ address: device.address })));
  }

  async disconnect() {
    await this.run(async () => this.onStatus(await RfidReader.disconnect()));
  }

  /** Esquece o leitor lembrado (não desconecta). */
  forgetReader() {
    this.lastReader.set(null);
    writeJson(LAST_READER_KEY, null);
  }

  async start() {
    await this.run(() => RfidReader.startInventory());
  }

  /** Para o scan contínuo. Silencioso: é chamado ao sair da tela e ao ir para o fundo. */
  async stop() {
    if (!this.isNative || !this.status()?.scanning) return;
    try { await RfidReader.stopInventory(); } catch { /* leitor já desconectado */ }
  }

  /** Salva os prefixos no aparelho e, se conectado, aplica-os já. */
  async savePrefixes(prefixes: string[]) {
    this.prefixes.set(prefixes);
    writeJson(PREFIXES_KEY, prefixes);
    if (this.connected()) await this.applySavedFilter();
  }

  /** Aplica no leitor o filtro guardado no aparelho (lista vazia = sem filtro). */
  async applySavedFilter() {
    const prefixes = this.prefixes();
    try {
      if (prefixes.length) await RfidReader.applyEpcFilter({ prefixes });
      else if (this.status()?.epcFilter?.prefixes?.length) await RfidReader.clearEpcFilter();
    } catch (e) {
      this.error.set(`Filtro EPC não aplicado: ${messageOf(e, 'erro desconhecido')}`);
    }
  }

  private async doInit() {
    await RfidReader.addListener('tagsRead', (e) => this.zone.run(() => this.tags$.next(e.tags ?? [])));
    await RfidReader.addListener('triggerChanged', (e) => this.zone.run(() => this.triggerPressed.set(e.pressed)));
    await RfidReader.addListener('connectionChanged', (s) => this.zone.run(() => this.onStatus(s)));
    const status = await RfidReader.getStatus();
    this.triggerPressed.set(status.triggerPressed);
    this.onStatus(status);
    try { this.deviceId.set((await RfidReader.getDeviceId()).deviceId); } catch { /* segue sem deviceId */ }
  }

  private onStatus(s: ReaderStatus) {
    const wasConnected = !!this.status()?.connected;
    this.status.set(s);
    if (!s.connected) this.triggerPressed.set(false);
    // Primeira vez conectado nesta execução, ou reconexão: o filtro do aparelho vale.
    if (s.connected && !wasConnected) {
      this.error.set(null);
      this.applySavedFilter();
    }
  }

  private async run(fn: () => Promise<unknown>) {
    this.error.set(null);
    try { await fn(); } catch (e) { this.error.set(messageOf(e, 'Falha ao falar com o leitor.')); }
  }
}

function messageOf(e: unknown, fallback: string): string {
  const m = (e as any)?.message;
  return typeof m === 'string' && m ? m : fallback;
}

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown) {
  try {
    if (value == null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch { /* sem armazenamento: vale só nesta execução */ }
}
