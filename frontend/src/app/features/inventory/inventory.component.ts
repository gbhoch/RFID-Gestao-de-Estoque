import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-inventory',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <h1 class="page-title">Inventário RFID</h1>
    <p class="page-sub">Conte os ativos de um setor por leitura de etiquetas e apure divergências.</p>

    @if (!session()) {
      <!-- Início -->
      <div class="card start">
        <div class="step-badge">1</div>
        <div class="start-body">
          <h3>Iniciar uma contagem</h3>
          <p>Informe o setor a inventariar. O sistema calcula quantos ativos são esperados ali.</p>
          <div class="start-row">
            <input [(ngModel)]="sectorId" placeholder="ID do setor (UUID)"
              (keyup.enter)="start()" />
            <button class="primary" [disabled]="!sectorId || busy()" (click)="start()">
              {{ busy() ? 'Iniciando…' : 'Iniciar inventário' }}
            </button>
          </div>
          @if (error()) { <div class="alert">{{ error() }}</div> }
        </div>
      </div>
    } @else {
      <!-- Em andamento -->
      <div class="session-bar card">
        <div class="sess-item">
          <span class="k">Sessão</span><span class="v mono">{{ shortId() }}</span>
        </div>
        <div class="sess-item">
          <span class="k">Status</span>
          <span class="pill" [class]="session().status === 'finished' ? 'pill-success' : 'pill-info'">
            {{ session().status === 'finished' ? 'Finalizado' : 'Em andamento' }}
          </span>
        </div>
        <div class="sess-item"><span class="k">Esperados</span><span class="v">{{ session().expectedCount }}</span></div>
        <div class="sess-item"><span class="k">Leituras</span><span class="v">{{ reads().length }}</span></div>
      </div>

      @if (session().status !== 'finished') {
        <div class="card capture">
          <div class="step-badge">2</div>
          <div class="capture-body">
            <h3>Capturar leituras</h3>
            <p>Digite um EPC manualmente ou simule um lote do handheld.</p>
            <div class="capture-row">
              <input [(ngModel)]="epcInput" placeholder="EPC lido…" (keyup.enter)="addRead()" />
              <button class="secondary" (click)="addRead()" [disabled]="!epcInput || busy()">Registrar</button>
              <button class="ghost-btn" (click)="simulateBatch()" [disabled]="busy()">Simular lote (5)</button>
              <div class="grow"></div>
              <button class="success" (click)="finish()" [disabled]="busy()">Finalizar contagem</button>
            </div>
          </div>
        </div>

        @if (reads().length) {
          <div class="card reads">
            <div class="reads-head"><span>EPC</span><span>RSSI</span><span>Horário</span></div>
            @for (r of reads().slice().reverse(); track r.epc + r.readAt) {
              <div class="reads-row">
                <span class="mono">{{ r.epc }}</span>
                <span>{{ r.rssi }} dBm</span>
                <span class="muted">{{ r.readAt | date:'HH:mm:ss' }}</span>
              </div>
            }
          </div>
        }
      }

      @if (result()) {
        <div class="card result">
          <div class="step-badge done">✓</div>
          <div class="result-body">
            <h3>Resultado da contagem</h3>
            <div class="indicators">
              <div class="ind primary-ind">
                <span class="ind-val">{{ result().indicators.accuracyRate }}%</span>
                <span class="ind-lbl">Acuracidade</span>
              </div>
              <div class="ind">
                <span class="ind-val">{{ result().foundCount }}</span>
                <span class="ind-lbl">Encontrados</span>
              </div>
              <div class="ind">
                <span class="ind-val warn">{{ result().indicators.notFound }}</span>
                <span class="ind-lbl">Não encontrados</span>
              </div>
              <div class="ind">
                <span class="ind-val warn">{{ result().indicators.foundOutsideSector }}</span>
                <span class="ind-lbl">Fora do setor</span>
              </div>
            </div>
            <button class="secondary" (click)="reset()">Iniciar nova contagem</button>
          </div>
        </div>
      }
    }
  `,
  styles: [`
    .card { padding: 22px; margin-bottom: 16px; }
    .start, .capture, .result { display: flex; gap: 18px; }
    .step-badge {
      width: 32px; height: 32px; flex: none; border-radius: 50%;
      display: grid; place-items: center;
      background: var(--brand-100); color: var(--brand-600);
      font-weight: 700; font-size: 14px;
    }
    .step-badge.done { background: rgba(26,143,111,.15); color: var(--success); }
    h3 { font-size: 16px; margin-bottom: 4px; }
    .start-body p, .capture-body p, .result-body p { color: var(--text-soft); font-size: 14px; margin: 0 0 14px; }

    input {
      padding: 11px 13px; font-size: 14px; color: var(--text);
      background: var(--surface); border: 1.5px solid var(--border-strong);
      border-radius: var(--radius-sm); min-width: 240px;
    }
    input:focus { outline: none; border-color: var(--brand-600); box-shadow: 0 0 0 3px var(--brand-100); }

    button { font-size: 14px; font-weight: 600; border-radius: var(--radius-sm);
      cursor: pointer; padding: 11px 16px; border: 1px solid transparent; transition: all .12s; }
    .primary  { background: var(--brand-600); color: #fff; }
    .primary:hover:not(:disabled) { background: var(--brand-700); }
    .secondary { background: var(--surface-2); color: var(--text); border-color: var(--border); }
    .secondary:hover:not(:disabled) { background: var(--border); }
    .ghost-btn { background: none; color: var(--brand-600); }
    .ghost-btn:hover:not(:disabled) { background: var(--brand-50); }
    .success { background: var(--success); color: #fff; }
    .success:hover:not(:disabled) { filter: brightness(.95); }
    button:disabled { opacity: .5; cursor: default; }

    .start-row, .capture-row { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
    .grow { flex: 1; }

    .alert { margin-top: 12px; background: rgba(192,67,47,.10); color: var(--danger);
      border: 1px solid rgba(192,67,47,.25); border-radius: var(--radius-sm); padding: 10px 13px; font-size: 13px; }

    .session-bar { display: flex; gap: 36px; padding: 16px 22px; }
    .sess-item { display: flex; flex-direction: column; gap: 4px; }
    .sess-item .k { font-size: 11px; text-transform: uppercase; letter-spacing: .05em; color: var(--text-faint); font-weight: 700; }
    .sess-item .v { font-size: 15px; font-weight: 600; }
    .mono { font-family: var(--font-mono); }

    .reads { padding: 0; overflow: hidden; }
    .reads-head, .reads-row {
      display: grid; grid-template-columns: 1fr 120px 120px; gap: 12px;
      padding: 11px 22px; font-size: 13.5px; align-items: center;
    }
    .reads-head { background: var(--surface-2); color: var(--text-soft);
      font-weight: 600; font-size: 12px; text-transform: uppercase; letter-spacing: .04em; }
    .reads-row { border-top: 1px solid var(--border); }
    .reads-row .muted { color: var(--text-faint); }

    .indicators { display: flex; gap: 14px; flex-wrap: wrap; margin-bottom: 18px; }
    .ind { background: var(--surface-2); border: 1px solid var(--border);
      border-radius: var(--radius); padding: 16px 22px; min-width: 130px; text-align: center; }
    .ind.primary-ind { background: var(--brand-50); border-color: var(--brand-100); }
    .ind-val { display: block; font-size: 28px; font-weight: 700; color: var(--brand-600); letter-spacing: -.02em; }
    .ind-val.warn { color: var(--warning); }
    .ind-lbl { font-size: 12.5px; color: var(--text-soft); }
  `],
})
export class InventoryComponent {
  private http = inject(HttpClient);
  private api = environment.apiUrl;

  sectorId = '';
  epcInput = '';
  busy = signal(false);
  error = signal('');
  session = signal<any>(null);
  reads = signal<any[]>([]);
  result = signal<any>(null);

  shortId = computed(() => (this.session()?.id ?? '').slice(0, 8));

  async start() {
    this.busy.set(true); this.error.set('');
    try {
      const s = await firstValueFrom(
        this.http.post(`${this.api}/inventory/start`, { sectorId: this.sectorId }),
      );
      this.session.set(s); this.reads.set([]); this.result.set(null);
    } catch {
      this.error.set('Não foi possível iniciar. Confira se o ID do setor é válido.');
    } finally { this.busy.set(false); }
  }

  async addRead() {
    if (!this.epcInput) return;
    await this.pushReads([{ epc: this.epcInput, rssi: -55 }]);
    this.epcInput = '';
  }

  async simulateBatch() {
    const batch = Array.from({ length: 5 }, (_, i) => ({ epc: `EPC-${Date.now()}-${i}`, rssi: -40 - i }));
    await this.pushReads(batch);
  }

  private async pushReads(items: { epc: string; rssi: number }[]) {
    this.busy.set(true);
    try {
      await firstValueFrom(
        this.http.post(`${this.api}/inventory/${this.session().id}/reads`, { reads: items }),
      );
      this.reads.update((r) => [...r, ...items.map((i) => ({ ...i, readAt: new Date() }))]);
    } finally { this.busy.set(false); }
  }

  async finish() {
    this.busy.set(true);
    try {
      const res = await firstValueFrom(this.http.post(`${this.api}/inventory/${this.session().id}/finish`, {}));
      this.result.set(res);
      this.session.update((s: any) => ({ ...s, status: 'finished' }));
    } finally { this.busy.set(false); }
  }

  reset() {
    this.session.set(null); this.reads.set([]); this.result.set(null);
    this.sectorId = ''; this.error.set('');
  }
}
