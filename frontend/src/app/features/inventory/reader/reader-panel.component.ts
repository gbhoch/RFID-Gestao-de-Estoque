import {
  Component, EventEmitter, HostListener, Input, OnChanges, OnDestroy, OnInit, Output,
  SimpleChanges, computed, inject, signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import type { TagBatchItem } from '../../../core/rfid/rfid-reader.plugin';
import { ReadSyncQueue } from '../read-sync-queue.service';
import { MAX_PREFIX_CHARS, RfidReaderService } from './rfid-reader.service';

/**
 * Painel do leitor TSL na tela de Inventário (só dentro do app Capacitor).
 * As tags lidas saem por (tags) e entram no mesmo caminho da captura por teclado.
 */
@Component({
  selector: 'app-reader-panel',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="card reader">
      <div class="r-row">
        <span class="r-title">Leitor RFID</span>
        <span [class]="stateClass()">{{ stateLabel() }}</span>
        @if (reader.status()?.readerName ?? reader.lastReader()?.name; as name) {
          <span class="r-name">{{ name }}</span>
        }
        <span class="spacer"></span>
        @if (reader.connected() || reader.connecting()) {
          <button class="btn ghost sm" (click)="reader.disconnect()">Desconectar</button>
        } @else {
          @if (reader.lastReader(); as last) {
            <button class="btn primary sm" (click)="reader.connect(last)">Conectar</button>
          }
          <button class="btn ghost sm" (click)="toggleDevices()">
            {{ reader.lastReader() ? 'Trocar leitor' : 'Escolher leitor' }}</button>
        }
      </div>

      @if (showDevices()) {
        <div class="devices">
          @for (d of reader.devices(); track d.address) {
            <div class="dev">
              <span class="dev-name">{{ d.name }}</span>
              <span class="mono muted">{{ d.address }}</span>
              <button class="btn secondary sm" (click)="pick(d)">Conectar</button>
            </div>
          } @empty {
            <span class="muted">Nenhum leitor TSL pareado. Pareie o leitor nas configurações de Bluetooth do Android.</span>
          }
        </div>
      }

      <div class="r-row stats">
        @if (reader.status()?.scanning) {
          <button class="btn danger" (click)="reader.stop()">Parar leitura</button>
        } @else {
          <button class="btn primary" [disabled]="!reader.connected() || !canCapture" (click)="reader.start()">
            Iniciar leitura</button>
        }
        <span class="stat"><span class="dot" [class.on]="reader.triggerPressed()"></span>
          Gatilho {{ reader.triggerPressed() ? 'apertado' : 'solto' }}</span>
        <span class="stat"><b>{{ uniqueCount }}</b> tags únicas no setor</span>
        <span class="stat" [class.warn]="pending().reads > 0">
          <b>{{ pending().reads }}</b> leituras aguardando envio</span>
      </div>

      @if (reader.connected() && !canCapture) {
        <p class="hint">Selecione (ou reabra) um setor em andamento: leituras feitas agora são ignoradas.</p>
      }
      @if (reader.error()) { <p class="error">{{ reader.error() }}</p> }

      <details class="settings">
        <summary>Configurações do leitor</summary>
        <div class="set-body">
          <span class="set-label">Filtro EPC <span class="muted">(só tags que começam com algum prefixo;
            salvo neste aparelho e aplicado ao conectar)</span></span>
          <div class="r-row">
            <input class="input mono" placeholder="Prefixo hex, ex.: 3034" [attr.maxlength]="maxPrefix"
              [value]="draft()" (input)="draft.set($any($event.target).value)" (keyup.enter)="addPrefix()" />
            <button class="btn ghost sm" [disabled]="!draft().trim()" (click)="addPrefix()">Adicionar</button>
          </div>
          @if (draftError()) { <p class="error">{{ draftError() }}</p> }
          <div class="chips">
            @for (p of editing(); track p) {
              <span class="chip mono">{{ p }} <button class="x" (click)="removePrefix(p)" title="Remover">×</button></span>
            } @empty { <span class="muted">Sem filtro: todas as tags são aceitas.</span> }
          </div>
          <div class="r-row">
            <button class="btn secondary sm" [disabled]="!dirty()" (click)="save()">Salvar e aplicar</button>
            <span class="muted">Em vigor no leitor:
              @if (reader.status()?.epcFilter?.prefixes?.length) {
                <span class="mono">{{ reader.status()?.epcFilter?.prefixes?.join(', ') }}</span>
                @if (reader.status()?.epcFilter?.hardwarePrefix; as hw) { (Select no leitor: <span class="mono">{{ hw }}</span>) }
              } @else { nenhum }
            </span>
          </div>
          @if (reader.lastReader()) {
            <button class="btn ghost sm" (click)="reader.forgetReader()">Esquecer leitor lembrado</button>
          }
        </div>
      </details>
    </div>
  `,
  styles: [`
    .card { padding: 14px 18px; margin-bottom: 14px; }
    .r-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
    .r-title { font-size: 13.5px; font-weight: 650; }
    .r-name { font-size: 13px; color: var(--text-soft); }
    .spacer { flex: 1; }
    .stats { margin-top: 12px; gap: 16px; }
    .stat { font-size: 13px; color: var(--text-soft); display: inline-flex; align-items: center; gap: 6px; }
    .stat b { color: var(--text); font-size: 15px; }
    .stat.warn b { color: var(--warning); }
    .dot { width: 10px; height: 10px; border-radius: 50%; background: var(--border-strong); }
    .dot.on { background: var(--success); box-shadow: 0 0 0 3px rgba(26,143,111,.2); }
    .devices { display: flex; flex-direction: column; gap: 6px; margin-top: 10px; }
    .dev { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
    .dev-name { font-weight: 600; font-size: 13.5px; }
    .mono { font-family: var(--font-mono); }
    .muted { color: var(--text-faint); font-size: 12.5px; }
    .hint { font-size: 12.5px; color: var(--warning); margin: 10px 0 0; }
    .error { font-size: 12.5px; color: var(--danger); margin: 8px 0 0; }

    .settings { margin-top: 12px; border-top: 1px solid var(--border); padding-top: 10px; }
    .settings summary { cursor: pointer; font-size: 13px; font-weight: 600; color: var(--text-soft); }
    .set-body { display: flex; flex-direction: column; gap: 10px; margin-top: 10px; }
    .set-label { font-size: 13px; font-weight: 600; }
    .input { padding: 8px 11px; font-size: 13.5px; color: var(--text); background: var(--surface);
      border: 1.5px solid var(--border-strong); border-radius: var(--radius-sm); min-width: 0; flex: 1; max-width: 260px; }
    .chips { display: flex; gap: 6px; flex-wrap: wrap; }
    .chip { display: inline-flex; align-items: center; gap: 4px; padding: 3px 4px 3px 10px; font-size: 12.5px;
      border: 1px solid var(--border); border-radius: 999px; background: var(--surface-2); }
    .x { border: none; background: none; cursor: pointer; color: var(--text-faint); font-size: 15px; line-height: 1; }

    .btn { font-size: 13.5px; font-weight: 600; border-radius: var(--radius-sm); cursor: pointer;
      padding: 9px 14px; border: 1px solid transparent; }
    .btn.sm { padding: 7px 11px; font-size: 13px; }
    .btn.primary { background: var(--brand-600); color: #fff; }
    .btn.secondary { background: var(--surface-2); color: var(--text); border-color: var(--border); }
    .btn.ghost { background: none; color: var(--text-soft); border-color: var(--border); }
    .btn.danger { background: var(--danger); color: #fff; }
    .btn:disabled { opacity: .5; cursor: default; }
  `],
})
export class ReaderPanelComponent implements OnInit, OnChanges, OnDestroy {
  @Input({ required: true }) inventoryId!: string;
  /** Há setor em andamento para receber leituras. */
  @Input() canCapture = false;
  @Input() uniqueCount = 0;
  @Output() tags = new EventEmitter<TagBatchItem[]>();

  readonly reader = inject(RfidReaderService);
  private queue = inject(ReadSyncQueue);
  private sub?: Subscription;

  readonly maxPrefix = MAX_PREFIX_CHARS;
  readonly showDevices = signal(false);
  readonly draft = signal('');
  readonly draftError = signal<string | null>(null);
  readonly editing = signal<string[]>([...this.reader.prefixes()]);
  readonly dirty = computed(() => this.editing().join(',') !== this.reader.prefixes().join(','));
  readonly pending = computed(() => this.queue.summaryFor(this.inventoryId));

  readonly stateLabel = computed(() => {
    const labels: Record<string, string> = {
      connected: 'Conectado', connecting: 'Conectando…', disconnected: 'Desconectado',
      interrupted: 'Interrompido', lost: 'Conexão perdida',
    };
    const s = this.reader.status()?.state ?? 'disconnected';
    return this.reader.status()?.scanning ? 'Lendo' : labels[s] ?? s;
  });
  readonly stateClass = computed(() => {
    const s = this.reader.status();
    if (s?.scanning) return 'pill pill-info';
    if (s?.connected) return 'pill pill-success';
    if (s?.state === 'connecting') return 'pill pill-warning';
    return 'pill pill-neutral';
  });

  async ngOnInit() {
    this.sub = this.reader.tags$.subscribe((batch) => this.tags.emit(batch));
    await this.reader.init();
    // Vindo da página de teste o leitor pode estar conectado com outro filtro.
    if (this.reader.connected()) await this.reader.applySavedFilter();
    else await this.reader.autoConnect();
  }

  ngOnChanges(changes: SimpleChanges) {
    // Setor concluído/inventário pausado no meio da leitura: não seguir varrendo à toa.
    if (changes['canCapture'] && !this.canCapture) this.reader.stop();
  }

  ngOnDestroy() {
    this.sub?.unsubscribe();
    this.reader.stop(); // sair da tela para a leitura (a conexão fica, para voltar rápido)
  }

  /**
   * App para o fundo: o Capacitor dispara "pause" em document (o plugin, no onPause
   * nativo, também desconecta o leitor). visibilitychange cobre os demais casos.
   */
  @HostListener('document:pause')
  onPause() { this.reader.stop(); }

  @HostListener('document:visibilitychange')
  onVisibility() { if (document.visibilityState === 'hidden') this.reader.stop(); }

  async toggleDevices() {
    const open = !this.showDevices();
    this.showDevices.set(open);
    if (open) await this.reader.refreshDevices();
  }

  async pick(d: { address: string; name: string }) {
    this.showDevices.set(false);
    await this.reader.connect(d);
  }

  addPrefix() {
    const p = this.draft().trim().toUpperCase();
    if (!p) return;
    if (!/^[0-9A-F]+$/.test(p)) { this.draftError.set(`"${p}" não é hexadecimal.`); return; }
    if (p.length > MAX_PREFIX_CHARS) { this.draftError.set(`Máximo de ${MAX_PREFIX_CHARS} caracteres.`); return; }
    this.draftError.set(null);
    if (!this.editing().includes(p)) this.editing.update((l) => [...l, p]);
    this.draft.set('');
  }

  removePrefix(p: string) {
    this.editing.update((l) => l.filter((x) => x !== p));
  }

  async save() {
    await this.reader.savePrefixes([...this.editing()]);
  }
}
