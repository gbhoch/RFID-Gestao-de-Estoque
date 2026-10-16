import { Component, NgZone, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { Capacitor, type PluginListenerHandle } from '@capacitor/core';
import { PageHeaderComponent } from '../../shared/page-header.component';
import { RfidReader, type ReaderDevice, type ReaderStatus, type TagsReadEvent } from './rfid-reader.plugin';

interface TagRow {
  epc: string;
  count: number;
  rssi?: number;
  lastSeen: number;
}

/** Mesmo limite do plugin (EpcPrefixFilter.MAX_PREFIX_CHARS). */
const MAX_PREFIX_CHARS = 63;

/**
 * PROVA DE CONCEITO — leitor TSL dentro do app Capacitor.
 * Rota /leitor-poc (só admin; link no menu só dentro do app). Apenas lê e exibe; nada vai
 * ao backend. Os prefixos de filtro ficam só em memória nesta página.
 */
@Component({
  selector: 'app-reader-poc',
  standalone: true,
  imports: [PageHeaderComponent],
  template: `
    <app-page-header title="Leitor RFID (POC)" subtitle="Teste do plugin nativo RfidReader no app Android" />

    @if (!isNative) {
      <div class="card notice">Disponível apenas no app.</div>
    } @else {
      <div class="card">
        <div class="row">
          <span class="pill" [class]="statePill()">{{ stateLabel() }}</span>
          @if (status()?.readerName) { <span class="muted">{{ status()?.readerName }}</span> }
          @if (status()?.reason) { <span class="muted">· {{ status()?.reason }}</span> }
        </div>

        <div class="row">
          <button class="btn ghost" [disabled]="busy()" (click)="loadDevices()">Listar leitores pareados</button>
          @if (status()?.connected || status()?.state === 'connecting') {
            <button class="btn ghost" [disabled]="busy()" (click)="disconnect()">Desconectar</button>
          }
        </div>

        @if (devices().length) {
          <ul class="devices">
            @for (d of devices(); track d.address) {
              <li>
                <div>
                  <strong>{{ d.name }}</strong>
                  <span class="muted"> {{ d.address }}</span>
                </div>
                <button class="btn sm" [disabled]="busy() || status()?.address === d.address && status()?.state !== 'disconnected'"
                  (click)="connect(d)">Conectar</button>
              </li>
            }
          </ul>
        } @else if (devicesLoaded()) {
          <p class="muted">Nenhum leitor TSL pareado. Pareie o leitor nas configurações de Bluetooth do Android.</p>
        }

        @if (error()) { <p class="error">{{ error() }}</p> }
      </div>

      <div class="card">
        <h3>Filtro EPC <span class="muted small-inline">(inclusivo: só tags que começam com algum prefixo)</span></h3>
        <div class="row">
          <input class="input" placeholder="Prefixo hex, ex.: 3034" maxlength="63" [value]="prefixDraft()"
            (input)="prefixDraft.set($any($event.target).value)" (keyup.enter)="addPrefix()" />
          <button class="btn ghost" [disabled]="!prefixDraft().trim()" (click)="addPrefix()">Adicionar</button>
        </div>
        @if (prefixError()) { <p class="error">{{ prefixError() }}</p> }

        @if (prefixes().length) {
          <div class="chips">
            @for (p of prefixes(); track p) {
              <span class="chip">{{ p }}<button title="Remover" (click)="removePrefix(p)">×</button></span>
            }
          </div>
        }

        <div class="row">
          <button class="btn" [disabled]="busy() || !status()?.connected || !prefixes().length" (click)="applyFilter()">Aplicar filtro</button>
          <button class="btn ghost" [disabled]="busy() || !appliedPrefixes().length" (click)="clearFilter()">Limpar filtro</button>
        </div>
        <p class="muted small">
          @if (appliedPrefixes().length) {
            Em vigor: <span class="mono">{{ appliedPrefixes().join(', ') }}</span>
            @if (status()?.epcFilter?.hardwarePrefix) {
              · no leitor (Gen2 Select): <span class="mono">{{ status()?.epcFilter?.hardwarePrefix }}</span>
            } @else {
              · sem trecho comum: filtrado só no app
            }
          } @else {
            Sem filtro: todas as tags são reportadas.
          }
        </p>
      </div>

      <div class="card">
        <div class="row">
          <span class="pill" [class]="reading() ? 'pill pill-info' : 'pill pill-neutral'">{{ reading() ? 'Lendo' : 'Parado' }}</span>
          <span class="pill" [class]="triggerPressed() ? 'pill pill-success' : 'pill pill-neutral'">
            Gatilho {{ triggerPressed() ? 'pressionado' : 'solto' }}
          </span>
        </div>
        <div class="row">
          <button class="btn" [disabled]="!status()?.connected || reading()" (click)="start()">Iniciar leitura</button>
          <button class="btn ghost" [disabled]="!status()?.scanning" (click)="stop()">Parar leitura</button>
          <button class="btn ghost" [disabled]="!tags().length" (click)="clear()">Limpar</button>
          <span class="spacer"></span>
          <span class="counter"><strong>{{ tags().length }}</strong> tags únicas</span>
          <span class="counter"><strong>{{ totalReads() }}</strong> leituras</span>
          <span class="counter"><strong>{{ batches() }}</strong> lotes</span>
        </div>
        <p class="muted small">O gatilho físico do leitor também lê: as tags aparecem aqui mesmo sem "Iniciar leitura".
          Lotes a cada {{ status()?.batchIntervalMs ?? 200 }} ms.</p>

        <table class="tags">
          <thead><tr><th>EPC</th><th class="num">Leituras</th><th class="num">RSSI</th></tr></thead>
          <tbody>
            @for (t of tags(); track t.epc) {
              <tr><td class="epc">{{ t.epc }}</td><td class="num">{{ t.count }}</td><td class="num">{{ t.rssi ?? '—' }}</td></tr>
            } @empty {
              <tr><td colspan="3" class="muted">Nenhuma tag lida ainda.</td></tr>
            }
          </tbody>
        </table>
      </div>
    }
  `,
  styles: [`
    .card { margin-top: 16px; padding: 16px; }
    .card h3 { margin: 0 0 12px; font-size: 15px; }
    .notice { font-size: 15px; }
    .row { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-bottom: 12px; }
    .spacer { flex: 1; }
    .muted { color: var(--text-soft); }
    .small { font-size: 12px; margin: 0 0 12px; }
    .small-inline { font-size: 12px; font-weight: 400; }
    .mono { font-family: monospace; }
    .error { color: var(--danger); margin: 0 0 12px; }
    .counter { font-size: 14px; color: var(--text-soft); }
    .counter strong { color: var(--text); font-size: 18px; }
    .btn { border: 1px solid var(--brand-600); background: var(--brand-600); color: #fff; border-radius: var(--radius-sm);
           padding: 8px 14px; font: inherit; cursor: pointer; }
    .btn.ghost { background: transparent; color: var(--brand-600); }
    .btn.sm { padding: 4px 10px; }
    .btn:disabled { opacity: .45; cursor: default; }
    .input { flex: 1; min-width: 180px; padding: 8px 10px; font: inherit; font-family: monospace; text-transform: uppercase;
             border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--surface); color: var(--text); }
    .chips { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 12px; }
    .chip { display: inline-flex; align-items: center; gap: 4px; padding: 3px 4px 3px 10px; border-radius: 999px;
            background: var(--surface-2); font-family: monospace; font-size: 13px; }
    .chip button { border: none; background: none; cursor: pointer; color: var(--text-soft); font-size: 16px; line-height: 1; padding: 0 4px; }
    .devices { list-style: none; padding: 0; margin: 0; }
    .devices li { display: flex; justify-content: space-between; align-items: center; gap: 8px;
                  padding: 8px 0; border-top: 1px solid var(--border); }
    .tags { width: 100%; border-collapse: collapse; }
    .tags th, .tags td { text-align: left; padding: 6px 8px; border-top: 1px solid var(--border); }
    .tags th { color: var(--text-soft); font-weight: 500; font-size: 12px; }
    .tags .num { text-align: right; }
    .tags .epc { font-family: monospace; word-break: break-all; }
  `],
})
export class ReaderPocComponent implements OnInit, OnDestroy {
  private zone = inject(NgZone);

  readonly isNative = Capacitor.isNativePlatform();

  readonly status = signal<ReaderStatus | null>(null);
  readonly devices = signal<ReaderDevice[]>([]);
  readonly devicesLoaded = signal(false);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);

  /** Agregado por EPC ao longo da sessão; recebe um lote do plugin por vez. */
  private readonly byEpc = new Map<string, TagRow>();
  readonly tags = signal<TagRow[]>([]);
  readonly totalReads = computed(() => this.tags().reduce((sum, t) => sum + t.count, 0));
  readonly batches = signal(0);

  /** Gatilho físico: chega por triggerChanged e também no status (ex.: ao abrir a página). */
  readonly triggerPressed = signal(false);
  /** "Lendo" = scan por software OU gatilho apertado. */
  readonly reading = computed(() => !!this.status()?.scanning || this.triggerPressed());

  /** Prefixos do filtro EPC: só nesta página, em memória. O plugin só aplica o que recebe. */
  readonly prefixes = signal<string[]>([]);
  readonly prefixDraft = signal('');
  readonly prefixError = signal<string | null>(null);
  readonly appliedPrefixes = computed(() => this.status()?.epcFilter?.prefixes ?? []);

  private listeners: PluginListenerHandle[] = [];

  readonly stateLabel = computed(() => {
    const labels: Record<string, string> = {
      connected: 'Conectado', connecting: 'Conectando…', disconnected: 'Desconectado',
      lost: 'Conexão perdida', interrupted: 'Conexão interrompida',
    };
    return labels[this.status()?.state ?? 'disconnected'] ?? this.status()?.state;
  });

  readonly statePill = computed(() => {
    const s = this.status()?.state;
    if (s === 'connected') return 'pill pill-success';
    if (s === 'connecting') return 'pill pill-warning';
    if (s === 'lost' || s === 'interrupted') return 'pill pill-danger';
    return 'pill pill-neutral';
  });

  async ngOnInit() {
    if (!this.isNative) return;

    // Os eventos chegam da bridge nativa fora da zona do Angular.
    this.listeners.push(
      await RfidReader.addListener('tagsRead', (e) => this.zone.run(() => this.onBatch(e))),
      await RfidReader.addListener('triggerChanged', (e) => this.zone.run(() => this.triggerPressed.set(e.pressed))),
      await RfidReader.addListener('connectionChanged', (s) => this.zone.run(() => this.setStatus(s))),
    );
    try {
      this.setStatus(await RfidReader.getStatus());
    } catch (e) {
      this.fail(e);
    }
  }

  ngOnDestroy() {
    this.listeners.forEach((l) => l.remove());
    // Sair da página não deve deixar o leitor varrendo sozinho.
    if (this.isNative && this.status()?.scanning) RfidReader.stopInventory().catch(() => {});
  }

  async loadDevices() {
    await this.run(async () => {
      const { devices } = await RfidReader.listPairedDevices();
      this.devices.set(devices);
      this.devicesLoaded.set(true);
    });
  }

  async connect(device: ReaderDevice) {
    await this.run(async () => this.setStatus(await RfidReader.connect({ address: device.address })));
  }

  async disconnect() {
    await this.run(async () => this.setStatus(await RfidReader.disconnect()));
  }

  async start() {
    await this.run(() => RfidReader.startInventory());
  }

  async stop() {
    await this.run(() => RfidReader.stopInventory());
  }

  clear() {
    this.byEpc.clear();
    this.tags.set([]);
    this.batches.set(0);
  }

  // ------------------------------------------------------------- filtro EPC

  addPrefix() {
    const p = this.prefixDraft().trim().toUpperCase();
    if (!p) return;
    if (!/^[0-9A-F]+$/.test(p)) {
      this.prefixError.set(`"${p}" não é hexadecimal.`);
      return;
    }
    if (p.length > MAX_PREFIX_CHARS) {
      this.prefixError.set(`Máximo de ${MAX_PREFIX_CHARS} caracteres.`);
      return;
    }
    this.prefixError.set(null);
    if (!this.prefixes().includes(p)) this.prefixes.update((list) => [...list, p]);
    this.prefixDraft.set('');
  }

  removePrefix(p: string) {
    this.prefixes.update((list) => list.filter((x) => x !== p));
  }

  async applyFilter() {
    await this.run(() => RfidReader.applyEpcFilter({ prefixes: this.prefixes() }));
  }

  async clearFilter() {
    await this.run(() => RfidReader.clearEpcFilter());
  }

  // ---------------------------------------------------------------- leituras

  private onBatch(e: TagsReadEvent) {
    const now = Date.now();
    for (const t of e.tags) {
      const row = this.byEpc.get(t.epc);
      if (row) {
        row.count += t.count;
        row.rssi = t.rssi ?? row.rssi;
        row.lastSeen = now;
      } else {
        this.byEpc.set(t.epc, { epc: t.epc, count: t.count, rssi: t.rssi, lastSeen: now });
      }
    }
    // Um repaint por lote (o plugin já agrupa a cada ~200 ms).
    this.tags.set([...this.byEpc.values()].map((t) => ({ ...t })));
    this.batches.update((n) => n + 1);
  }

  private setStatus(s: ReaderStatus) {
    this.status.set(s);
    this.triggerPressed.set(!!s.triggerPressed);
  }

  private async run(action: () => Promise<unknown>) {
    this.busy.set(true);
    this.error.set(null);
    try {
      await action();
    } catch (e) {
      this.fail(e);
    } finally {
      this.busy.set(false);
    }
  }

  private fail(e: unknown) {
    this.error.set((e as { message?: string })?.message ?? String(e));
  }
}
