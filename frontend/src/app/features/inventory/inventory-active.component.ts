import {
  Component, inject, signal, computed, Input, Output, EventEmitter,
  OnInit, OnDestroy, ViewChild, ElementRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DxDataGridModule, DxSelectBoxModule } from 'devextreme-angular';
import notify from 'devextreme/ui/notify';
import { alert, confirm } from 'devextreme/ui/dialog';
import { Subscription } from 'rxjs';
import type { TagBatchItem } from '../../core/rfid/rfid-reader.plugin';
import { InventoryApi } from './inventory.api';
import { ReadSyncQueue, type QueuedRead, type ReadBatch } from './read-sync-queue.service';
import { ReadSyncStatusComponent } from './read-sync-status.component';
import { ReaderPanelComponent } from './reader/reader-panel.component';
import { RfidReaderService } from './reader/rfid-reader.service';
import { ReaderCaptureDirective } from '../../shared/reader-capture.directive';

type CaptureMeta = Omit<QueuedRead, 'epc' | 'readAt'>;
const EMPTY_PANEL = { expected: [] as any[], read: [] as any[] };

@Component({
  selector: 'app-inventory-active',
  standalone: true,
  imports: [CommonModule, FormsModule, DxDataGridModule, DxSelectBoxModule, ReaderCaptureDirective,
    ReadSyncStatusComponent, ReaderPanelComponent],
  template: `
    <!-- Cabeçalho fixo -->
    <div class="card head">
      <div class="head-main">
        <div class="hcode">
          <span class="code">{{ inventory.code }}</span>
          <span class="pill" [class]="statusClass(status())">{{ statusLabel(status()) }}</span>
        </div>
        <div class="hmeta">
          <span>Início: {{ inventory.startedAt | date:'dd/MM/yyyy HH:mm' }}</span>
          <span>·</span>
          <span>Decorrido: {{ elapsedLabel() }}</span>
        </div>
      </div>
      <div class="counters">
        <div class="ctr"><span class="cv">{{ detail()?.visits?.length ?? 0 }}</span><span class="cl">setores visitados</span></div>
        <div class="ctr"><span class="cv">{{ completedCount() }}</span><span class="cl">concluídos</span></div>
        <div class="ctr"><span class="cv">{{ detail()?.readCount ?? 0 }}</span><span class="cl">leituras</span></div>
      </div>
      <div class="hactions">
        @if (status() === 'in_progress') {
          <button class="btn ghost" [disabled]="busy()" (click)="pause()">Pausar</button>
        } @else if (status() === 'paused') {
          <button class="btn secondary" [disabled]="busy()" (click)="resume()">Retomar</button>
        }
        <button class="btn success" [disabled]="busy()" (click)="finish()">Finalizar inventário</button>
      </div>
    </div>

    <app-read-sync-status [inventoryId]="inventory.id" (discarded)="onDiscarded()"></app-read-sync-status>

    <!-- Seletor de setor -->
    <div class="card sector-pick">
      <div class="sp-row">
        <span class="sp-label">Setor</span>
        <dx-select-box [items]="sectors()" displayExpr="name" valueExpr="id" [(value)]="pickedSectorId"
          placeholder="Adicionar / selecionar setor…" [searchEnabled]="true" [width]="300"
          [disabled]="status() !== 'in_progress'" (onValueChanged)="onPick($event)"></dx-select-box>
        @if (selectedVisit(); as v) {
          @if (v.status === 'in_progress') {
            <button class="btn secondary sm" [disabled]="busy()" (click)="completeSector()">Marcar setor como concluído</button>
          } @else {
            <span class="done-tag">Setor concluído</span>
            <button class="btn ghost sm" [disabled]="busy() || status() !== 'in_progress'" (click)="reopenSector()">Reabrir setor</button>
          }
        }
      </div>
      @if (detail()?.visits?.length) {
        <div class="chips">
          @for (v of detail().visits; track v.id) {
            <button class="chip" [class.active]="selectedVisit()?.id === v.id"
              [class.done]="v.status === 'completed'" (click)="viewVisit(v)">
              {{ sectorName(v.sectorId) }}
              @if (v.status === 'completed') { <span class="ck">✓</span> }
            </button>
          }
        </div>
      }
    </div>

    <!-- Leitor TSL via Bluetooth: só dentro do app Android (Capacitor). -->
    @if (isNative) {
      <app-reader-panel [inventoryId]="inventory.id" [canCapture]="canCapture()"
        [uniqueCount]="readRows().length" (tags)="onReaderTags($event)"></app-reader-panel>
    }

    @if (selectedVisit(); as visit) {
      <!-- Captura de leituras: leitor HID em modo teclado. Cada tag lida é
           registrada automaticamente (1× por etiqueta). Enter/botão = manual. -->
      <div class="card capture">
        <span class="cap-label">Leitura</span>
        <input #epcBox [(ngModel)]="epcInput" placeholder="Aponte o leitor e passe — cada tag é registrada automaticamente"
          [disabled]="!canCapture()" appReaderCapture (reading)="onReaderEpc($event)" (keyup.enter)="addRead()" />
        <button class="btn primary sm" [disabled]="!canCapture() || !epcInput" (click)="addRead()">Registrar manual</button>
        @if (!canCapture()) { <span class="cap-hint">Reabra o setor para capturar mais leituras.</span> }
      </div>

      <!-- Duas tabelas lado a lado -->
      <div class="tables">
        <div class="card tbl">
          <div class="tbl-title">Esperados neste setor
            <span class="tbl-sub">{{ expectedRows().length }} ativos</span></div>
          <dx-data-grid [dataSource]="expectedRows()" [showBorders]="false" [rowAlternationEnabled]="true"
            [columnAutoWidth]="true" noDataText="Nenhum ativo cadastrado neste setor." height="360">
            <dxo-paging [pageSize]="10"></dxo-paging>
            <dxo-search-panel [visible]="true" [width]="200" placeholder="Buscar…"></dxo-search-panel>
            <dxi-column dataField="assetCode" caption="Código" [width]="110"></dxi-column>
            <dxi-column dataField="name" caption="Nome"></dxi-column>
            <dxi-column dataField="epc" caption="EPC"></dxi-column>
            <dxi-column dataField="situation" caption="Situação" [width]="180" cellTemplate="sitCell"></dxi-column>
            <div *dxTemplate="let c of 'sitCell'">
              @switch (c.data.situation) {
                @case ('read_here') { <span class="tag ok">✓ Lido aqui</span> }
                @case ('pending_here') { <span class="tag info">⏳ Lido aqui (enviando)</span> }
                @case ('read_elsewhere') { <span class="tag info">ⓘ Lido em {{ sectorName(c.data.otherSectorId) }}</span> }
                @default { <span class="tag none">— não lido</span> }
              }
            </div>
          </dx-data-grid>
        </div>

        <div class="card tbl">
          <div class="tbl-title">Lidas neste setor
            <span class="tbl-sub">{{ readRows().length }} EPCs</span></div>
          <dx-data-grid [dataSource]="readRows()" [showBorders]="false" [rowAlternationEnabled]="true"
            [columnAutoWidth]="true" noDataText="Nenhuma leitura neste setor." height="360">
            <dxo-paging [pageSize]="10"></dxo-paging>
            <dxi-column dataField="epc" caption="EPC"></dxi-column>
            <dxi-column dataField="assetCode" caption="Patrimônio" cellTemplate="patCell" [width]="130"></dxi-column>
            <dxi-column dataField="count" caption="Leituras" [width]="90" alignment="center"></dxi-column>
            <dxi-column dataField="lastReadAt" caption="Última" dataType="date" format="HH:mm:ss" [width]="90"></dxi-column>
            <dxi-column dataField="flag" caption="Flag" [width]="200" cellTemplate="flagCell"></dxi-column>
            <div *dxTemplate="let c of 'patCell'">{{ c.data.assetCode || '—' }}</div>
            <div *dxTemplate="let c of 'flagCell'">
              @switch (c.data.flag) {
                @case ('ok') { <span class="tag ok">✓ Neste setor</span> }
                @case ('pending') { <span class="tag none">⏳ Aguardando envio</span> }
                @case ('sent') { <span class="tag none">Enviada — atualizando…</span> }
                @case ('other_sector') { <span class="tag amber">⚑ {{ sectorName(c.data.ownerSectorId) }}</span> }
                @default { <span class="tag danger">⚑ Tag desconhecida</span> }
              }
            </div>
          </dx-data-grid>
        </div>
      </div>
      <p class="note">Flags âmbar podem deixar de ser divergência se o setor de origem for
        inventariado depois — a conciliação só acontece ao finalizar.</p>
    } @else {
      <div class="card muted-card">Selecione um setor para começar a capturar.</div>
    }
  `,
  styles: [`
    .card { padding: 16px 18px; margin-bottom: 14px; }
    .muted-card { color: var(--text-faint); }

    .head { display: flex; align-items: center; gap: 24px; flex-wrap: wrap; }
    .head-main { display: flex; flex-direction: column; gap: 4px; }
    .hcode { display: flex; align-items: center; gap: 10px; }
    .code { font-size: 18px; font-weight: 700; font-family: var(--font-mono); }
    .hmeta { display: flex; gap: 8px; font-size: 12.5px; color: var(--text-faint); }
    .counters { display: flex; gap: 22px; margin-left: auto; }
    .ctr { display: flex; flex-direction: column; text-align: center; }
    .cv { font-size: 20px; font-weight: 700; color: var(--brand-600); }
    .cl { font-size: 11px; color: var(--text-soft); }
    .hactions { display: flex; gap: 8px; }

    .btn { font-size: 13.5px; font-weight: 600; border-radius: var(--radius-sm); cursor: pointer;
      padding: 9px 14px; border: 1px solid transparent; }
    .btn.sm { padding: 7px 11px; font-size: 13px; }
    .btn.primary { background: var(--brand-600); color: #fff; }
    .btn.secondary { background: var(--surface-2); color: var(--text); border-color: var(--border); }
    .btn.ghost { background: none; color: var(--text-soft); border-color: var(--border); }
    .btn.success { background: var(--success); color: #fff; }
    .btn:hover:not(:disabled) { filter: brightness(.97); }
    .btn:disabled { opacity: .5; cursor: default; }

    .sp-row { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
    .sp-label, .cap-label { font-size: 13px; font-weight: 600; color: var(--text-soft); }
    .done-tag { font-size: 12.5px; color: var(--success); font-weight: 600; }
    .chips { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
    .chip { display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px;
      border-radius: 999px; border: 1px solid var(--border); background: var(--surface);
      font-size: 13px; cursor: pointer; color: var(--text-soft); }
    .chip:hover { background: var(--surface-2); }
    .chip.active { border-color: var(--brand-600); color: var(--brand-600); background: var(--brand-50); }
    .chip.done .ck { color: var(--success); font-weight: 700; }

    .capture { display: flex; align-items: center; gap: 10px; }
    .capture input { flex: 1; padding: 11px 13px; font-size: 14px; color: var(--text);
      background: var(--surface); border: 1.5px solid var(--border-strong); border-radius: var(--radius-sm); }
    .capture input:focus { outline: none; border-color: var(--brand-600); box-shadow: 0 0 0 3px var(--brand-100); }
    .cap-hint { font-size: 12px; color: var(--warning); }

    .tables { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
    .tbl { padding: 12px 14px; }
    .tbl-title { font-size: 13.5px; font-weight: 650; margin-bottom: 10px; display: flex; gap: 8px; align-items: baseline; }
    .tbl-sub { font-size: 12px; color: var(--text-faint); font-weight: 500; }

    .tag { font-size: 12px; font-weight: 600; padding: 2px 8px; border-radius: 999px; white-space: nowrap; }
    .tag.ok { background: rgba(26,143,111,.12); color: var(--success); }
    .tag.info { background: var(--brand-50); color: var(--brand-600); }
    .tag.none { background: var(--surface-2); color: var(--text-faint); }
    .tag.amber { background: rgba(192,138,30,.14); color: var(--warning); }
    .tag.danger { background: rgba(192,67,47,.12); color: var(--danger); }

    .note { font-size: 12.5px; color: var(--text-faint); margin-top: 4px; }
    @media (max-width: 980px) { .tables { grid-template-columns: 1fr; } }
  `],
})
export class InventoryActiveComponent implements OnInit, OnDestroy {
  @Input() inventory: any;
  @Output() finished = new EventEmitter<string>();

  private api = inject(InventoryApi);
  private queue = inject(ReadSyncQueue);
  private reader = inject(RfidReaderService);
  @ViewChild('epcBox') epcBox?: ElementRef<HTMLInputElement>;

  /** Painel do leitor TSL: só dentro do app Capacitor. */
  readonly isNative = this.reader.isNative;

  detail = signal<any>(null);
  sectors = signal<{ id: string; name: string }[]>([]);
  selectedVisit = signal<any>(null);
  panel = signal<{ expected: any[]; read: any[] }>(EMPTY_PANEL);
  busy = signal(false);
  now = signal(Date.now());

  pickedSectorId: string | null = null;
  epcInput = '';
  private sectorMap = new Map<string, string>();
  private timer: any;

  /** Dedup por etiqueta, POR VISITA (trocar de setor no meio de um envio não mistura). */
  private captured = new Map<string, Set<string>>();
  /** Visita a que o painel atual pertence (sem rede, mantém o último painel dela). */
  private panelVisitId: string | null = null;
  /** Lotes já aceitos pelo servidor que o painel ainda não refletiu (evita a linha "piscar"). */
  private sentAwaitingPanel = signal<Map<string, { visitId: string; read: QueuedRead }>>(new Map());
  private sentSub?: Subscription;
  private refreshTimer: any = null;
  private lastRefreshAt = 0;

  status = computed(() => this.detail()?.status ?? this.inventory?.status);
  completedCount = computed(() => (this.detail()?.visits ?? []).filter((v: any) => v.status === 'completed').length);
  elapsedLabel = computed(() => {
    const ms = this.now() - new Date(this.inventory.startedAt).getTime();
    const s = Math.max(0, Math.floor(ms / 1000));
    const hh = String(Math.floor(s / 3600)).padStart(2, '0');
    const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
    const ss = String(s % 60).padStart(2, '0');
    return `${hh}:${mm}:${ss}`;
  });
  canCapture = computed(() =>
    this.status() === 'in_progress' && this.selectedVisit()?.status === 'in_progress');

  /** "Lidas neste setor": painel do servidor + o que ainda está na fila (ou acabou de subir). */
  readRows = computed(() => {
    const p = this.panel();
    const v = this.selectedVisit();
    if (!v) return p.read;
    const known = new Set(p.read.map((r: any) => String(r.epc).toUpperCase()));
    const extra: any[] = [];
    const add = (r: QueuedRead, flag: 'pending' | 'sent') => {
      if (known.has(r.epc)) return;
      known.add(r.epc);
      extra.push({ epc: r.epc, assetCode: null, count: r.readCount ?? 1, lastReadAt: r.readAt, flag });
    };
    for (const r of this.queue.unsentReadsFor(this.inventory.id, v.id).values()) add(r, 'pending');
    for (const s of this.sentAwaitingPanel().values()) if (s.visitId === v.id) add(s.read, 'sent');
    return extra.length ? [...extra, ...p.read] : p.read;
  });
  /** "Esperados": marca como lido aqui o que ainda está a caminho do servidor. */
  expectedRows = computed(() => {
    const local = new Set(this.readRows().filter((r: any) => r.flag === 'pending' || r.flag === 'sent')
      .map((r: any) => r.epc));
    const expected = this.panel().expected;
    if (!local.size) return expected;
    return expected.map((a: any) => a.situation !== 'read_here' && a.epc && local.has(String(a.epc).toUpperCase())
      ? { ...a, situation: 'pending_here' } : a);
  });

  async ngOnInit() {
    this.sentSub = this.queue.sent$.subscribe((b) => this.onBatchSent(b));
    await Promise.all([this.loadDetail(), this.loadSectors()]);
    this.timer = setInterval(() => this.now.set(Date.now()), 1000);
  }
  ngOnDestroy() {
    if (this.timer) clearInterval(this.timer);
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    this.sentSub?.unsubscribe();
    // Sair da tela: o leitor para (ReaderPanelComponent) e o pendente sobe agora; o que
    // não subir fica na fila persistida e segue tentando.
    this.queue.flushNow();
  }

  sectorName = (id: string | null) => (id ? this.sectorMap.get(id) ?? '—' : '—');

  private async loadDetail() {
    try {
      const d = await this.api.detail(this.inventory.id);
      this.detail.set(d);
      // Leitura tardia reabre setor no servidor: manter o status da visita aberta em dia.
      const sel = this.selectedVisit();
      const fresh = sel && (d?.visits ?? []).find((v: any) => v.id === sel.id);
      if (fresh && fresh.status !== sel.status) this.selectedVisit.set({ ...sel, ...fresh });
    } catch { notify('Falha ao carregar o inventário.', 'error', 3000); }
  }
  private async loadSectors() {
    try {
      const res: any = await this.api.sectors();
      const list = (res?.data ?? []).map((s: any) => ({ id: s.id, name: s.name }));
      this.sectors.set(list);
      this.sectorMap = new Map(list.map((s: any) => [s.id, s.name]));
    } catch { /* silencioso; nomes caem para '—' */ }
  }
  private async loadPanel() {
    const v = this.selectedVisit();
    if (!v) { this.panel.set(EMPTY_PANEL); this.panelVisitId = null; return; }
    if (this.panelVisitId !== v.id) { this.panel.set(EMPTY_PANEL); this.panelVisitId = null; }
    try {
      const p = await this.api.panel(this.inventory.id, v.id);
      if (this.selectedVisit()?.id !== v.id) return; // trocou de setor no meio
      this.panel.set(p);
      this.panelVisitId = v.id;
      const seen = this.capturedFor(v.id);
      const inPanel = new Set<string>((p.read ?? []).map((r: any) => String(r.epc).toUpperCase()));
      inPanel.forEach((epc) => seen.add(epc));
      this.sentAwaitingPanel.update((m) =>
        new Map([...m].filter(([, s]) => !(s.visitId === v.id && inPanel.has(s.read.epc)))));
    } catch { /* sem rede e sem painel em memória: a tabela mostra só o que está na fila */ }
  }

  onPick(e: any) { if (e.event && e.value) this.selectSector(e.value); }

  async selectSector(sectorId: string) {
    this.busy.set(true);
    try {
      const visit = await this.api.selectSector(this.inventory.id, sectorId);
      await this.loadDetail();
      this.selectedVisit.set(visit);
      await this.loadPanel();
      setTimeout(() => this.epcBox?.nativeElement.focus(), 0);
    } catch (e: any) {
      notify(e?.error?.message || 'Falha ao selecionar setor.', 'error', 3500);
    } finally { this.busy.set(false); }
  }

  async viewVisit(v: any) {
    this.selectedVisit.set(v);
    await this.loadPanel();
    if (this.canCapture()) setTimeout(() => this.epcBox?.nativeElement.focus(), 0);
  }

  /** Registro manual: sempre registra (mesmo repetido) e tenta enviar na hora. */
  async addRead() {
    const epc = this.epcInput.trim().toUpperCase();
    const visit = this.selectedVisit();
    if (!epc || !this.canCapture() || !visit) return;
    this.epcInput = '';
    this.capturedFor(visit.id).add(epc);
    this.queue.enqueue(this.inventory.id, visit.id, [{ epc, readAt: new Date().toISOString() }]);
    this.epcBox?.nativeElement.focus();
    await this.queue.flushNow();
  }

  /** Chamado pela ReaderCaptureDirective a cada etiqueta lida (leitor HID em modo teclado). */
  onReaderEpc(epc: string) {
    this.epcInput = ''; // limpa o resíduo que o leitor digitou no campo
    this.capture([{ epc }]);
  }

  /** Lote do leitor TSL (plugin Capacitor, evento tagsRead). */
  onReaderTags(tags: TagBatchItem[]) {
    const deviceId = this.reader.deviceId();
    this.capture(tags.map((t) => ({
      epc: t.epc,
      meta: {
        ...(typeof t.rssi === 'number' ? { rssi: Math.round(t.rssi) } : {}),
        ...(t.count >= 1 ? { readCount: t.count } : {}),
        ...(deviceId ? { deviceId } : {}),
      },
    })));
  }

  /**
   * Caminho único das leituras (teclado/HID e leitor): cada tag distinta entra uma vez
   * por visita e vai para a fila persistida, que envia em lote com nova tentativa.
   */
  private capture(items: { epc: string; meta?: CaptureMeta }[]) {
    const visit = this.selectedVisit();
    if (!this.canCapture() || !visit) return;
    const seen = this.capturedFor(visit.id);
    const readAt = new Date().toISOString();
    const fresh: QueuedRead[] = [];
    for (const { epc, meta } of items) {
      const norm = epc.trim().toUpperCase();
      if (!norm || seen.has(norm)) continue; // já lida nesta visita (1× por tag)
      seen.add(norm);
      fresh.push({ epc: norm, readAt, ...meta });
    }
    if (fresh.length) this.queue.enqueue(this.inventory.id, visit.id, fresh);
  }

  /** Conjunto de EPCs já registrados na visita: painel + fila + recém-enviados. */
  private capturedFor(visitId: string): Set<string> {
    let seen = this.captured.get(visitId);
    if (!seen) {
      seen = new Set(this.queue.unsentReadsFor(this.inventory.id, visitId).keys());
      for (const s of this.sentAwaitingPanel().values()) if (s.visitId === visitId) seen.add(s.read.epc);
      if (this.panelVisitId === visitId) {
        for (const r of this.panel().read ?? []) seen.add(String(r.epc).toUpperCase());
      }
      this.captured.set(visitId, seen);
    }
    return seen;
  }

  /** Pendências descartadas: refazer o dedup para que essas tags possam ser lidas de novo. */
  onDiscarded() {
    this.captured.clear();
    const v = this.selectedVisit();
    if (v) this.capturedFor(v.id);
  }

  private onBatchSent(b: ReadBatch) {
    if (b.inventoryId !== this.inventory.id) return;
    this.sentAwaitingPanel.update((m) => {
      const next = new Map(m);
      for (const r of b.reads) next.set(`${b.sectorVisitId}|${r.epc}`, { visitId: b.sectorVisitId, read: r });
      return next;
    });
    this.scheduleRefresh();
  }

  /** O painel é pesado no backend: no máximo um recarregamento a cada 2 s durante a leitura. */
  private scheduleRefresh() {
    if (this.refreshTimer) return;
    const wait = Math.max(300, this.lastRefreshAt + 2000 - Date.now());
    this.refreshTimer = setTimeout(async () => {
      this.refreshTimer = null;
      this.lastRefreshAt = Date.now();
      await Promise.all([this.loadPanel(), this.loadDetail()]);
    }, wait);
  }

  /**
   * Antes de concluir setor / finalizar: para o leitor, envia a fila na hora e só libera
   * se nada ficou para trás (pendente, retido ou recusado). Finalizar com pendência faria
   * a conciliação marcar como "não localizados" bens que foram lidos.
   */
  private async ensureSent(visitId?: string): Promise<boolean> {
    if (this.isNative && this.reader.reading()) {
      await this.reader.stop();
      // O plugin ainda entrega o último lote do tagsRead até batchIntervalMs depois de parar.
      await new Promise((r) => setTimeout(r, (this.reader.status()?.batchIntervalMs ?? 200) + 150));
    }
    await this.queue.flushNow();
    const s = this.queue.summaryFor(this.inventory.id, visitId);
    if (!s.reads) return true;
    const where = visitId ? 'deste setor' : 'deste inventário';
    await alert(
      `${s.reads} leituras ${where} ainda não chegaram ao servidor` +
      (s.blocked + s.rejected ? ` (${s.blocked + s.rejected} retidas ou recusadas)` : '') +
      '. Aguarde o envio — a fila tenta de novo sozinha quando a rede voltar — ou use ' +
      '"Descartar pendências" se tiver certeza de que não precisa delas.',
      visitId ? 'Concluir setor' : 'Finalizar inventário',
    );
    return false;
  }

  async completeSector() {
    const visit = this.selectedVisit();
    if (!visit) return;
    this.busy.set(true);
    try {
      if (!(await this.ensureSent(visit.id))) return;
      await this.api.completeSector(this.inventory.id, visit.id);
      await this.loadDetail();
      this.selectedVisit.update((v: any) => ({ ...v, status: 'completed' }));
      notify('Setor concluído.', 'success', 2000);
    } catch (e: any) {
      notify(e?.error?.message || 'Falha ao concluir setor.', 'error', 3000);
    } finally { this.busy.set(false); }
  }

  async reopenSector() {
    await this.selectSector(this.selectedVisit().sectorId);
    notify('Setor reaberto.', 'success', 1800);
  }

  async pause() {
    this.busy.set(true);
    try { const inv = await this.api.pause(this.inventory.id); this.detail.update((d: any) => ({ ...d, status: inv.status })); }
    catch (e: any) { notify(e?.error?.message || 'Falha ao pausar.', 'error', 3000); }
    finally { this.busy.set(false); }
  }
  async resume() {
    this.busy.set(true);
    try { const inv = await this.api.resume(this.inventory.id); this.detail.update((d: any) => ({ ...d, status: inv.status })); }
    catch (e: any) { notify(e?.error?.message || 'Falha ao retomar.', 'error', 3000); }
    finally { this.busy.set(false); }
  }

  async finish() {
    this.busy.set(true);
    const sent = await this.ensureSent().finally(() => this.busy.set(false));
    if (!sent) return;
    const ok = await confirm(
      'A conciliação será executada com base em todos os setores concluídos. Deseja finalizar?',
      'Finalizar inventário',
    );
    if (!ok) return;
    this.busy.set(true);
    try {
      if (!(await this.ensureSent())) return; // algo lido durante a confirmação
      await this.api.finish(this.inventory.id);
      this.finished.emit(this.inventory.id);
    } catch (e: any) {
      notify(e?.error?.message || 'Falha ao finalizar.', 'error', 3500);
    } finally { this.busy.set(false); }
  }

  statusLabel(v: string) {
    return { in_progress: 'Em andamento', paused: 'Pausado', finished: 'Finalizado', cancelled: 'Cancelado' }[v] ?? v;
  }
  statusClass(v: string) {
    if (v === 'finished') return 'pill-success';
    if (v === 'in_progress') return 'pill-info';
    if (v === 'paused') return 'pill-warning';
    return 'pill-neutral';
  }
}
