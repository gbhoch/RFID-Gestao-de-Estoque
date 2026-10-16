import { Component, NgZone, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { Capacitor, type PluginListenerHandle } from '@capacitor/core';
import { PageHeaderComponent } from '../../shared/page-header.component';
import { RfidReader, type ReaderDevice, type ReaderStatus, type TagReadEvent } from './rfid-reader.plugin';

interface TagRow {
  epc: string;
  count: number;
  rssi?: number;
  lastSeen: number;
}

/**
 * PROVA DE CONCEITO — leitor TSL dentro do app Capacitor.
 * Rota /leitor-poc (só admin, sem link no menu). Apenas lê e exibe; nada vai ao backend.
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
        <div class="row">
          <button class="btn" [disabled]="!status()?.connected || status()?.scanning" (click)="start()">Iniciar leitura</button>
          <button class="btn ghost" [disabled]="!status()?.scanning" (click)="stop()">Parar leitura</button>
          <button class="btn ghost" [disabled]="!tags().length" (click)="clear()">Limpar</button>
          <span class="spacer"></span>
          <span class="counter"><strong>{{ tags().length }}</strong> tags únicas</span>
          <span class="counter"><strong>{{ totalReads() }}</strong> leituras</span>
        </div>
        <p class="muted small">O gatilho físico do leitor também lê: as tags aparecem aqui mesmo sem "Iniciar leitura".</p>

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
    .notice { font-size: 15px; }
    .row { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-bottom: 12px; }
    .spacer { flex: 1; }
    .muted { color: var(--text-soft); }
    .small { font-size: 12px; margin: 0 0 12px; }
    .error { color: var(--danger); margin: 8px 0 0; }
    .counter { font-size: 14px; color: var(--text-soft); }
    .counter strong { color: var(--text); font-size: 18px; }
    .btn { border: 1px solid var(--brand-600); background: var(--brand-600); color: #fff; border-radius: var(--radius-sm);
           padding: 8px 14px; font: inherit; cursor: pointer; }
    .btn.ghost { background: transparent; color: var(--brand-600); }
    .btn.sm { padding: 4px 10px; }
    .btn:disabled { opacity: .45; cursor: default; }
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

  /** Agregado por EPC. Mutado a cada leitura; a UI é atualizada no máximo uma vez por frame. */
  private readonly byEpc = new Map<string, TagRow>();
  readonly tags = signal<TagRow[]>([]);
  readonly totalReads = computed(() => this.tags().reduce((sum, t) => sum + t.count, 0));
  private frame: number | null = null;

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
      await RfidReader.addListener('tagRead', (e) => this.zone.run(() => this.onTag(e))),
      await RfidReader.addListener('connectionChanged', (s) => this.zone.run(() => this.status.set(s))),
    );
    try {
      this.status.set(await RfidReader.getStatus());
    } catch (e) {
      this.fail(e);
    }
  }

  ngOnDestroy() {
    this.listeners.forEach((l) => l.remove());
    if (this.frame !== null) cancelAnimationFrame(this.frame);
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
    await this.run(async () => this.status.set(await RfidReader.connect({ address: device.address })));
  }

  async disconnect() {
    await this.run(async () => this.status.set(await RfidReader.disconnect()));
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
  }

  private onTag(e: TagReadEvent) {
    const row = this.byEpc.get(e.epc);
    if (row) {
      row.count++;
      row.rssi = e.rssi;
      row.lastSeen = Date.now();
    } else {
      this.byEpc.set(e.epc, { epc: e.epc, count: 1, rssi: e.rssi, lastSeen: Date.now() });
    }
    // Rajadas de leituras: um único repaint por frame, não um por tag.
    if (this.frame === null) {
      this.frame = requestAnimationFrame(() => {
        this.frame = null;
        this.zone.run(() => this.tags.set([...this.byEpc.values()].map((t) => ({ ...t }))));
      });
    }
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
