import {
  Component, inject, signal, computed, Input, Output, EventEmitter,
  OnInit, OnDestroy, ViewChild, ElementRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { DxDataGridModule, DxSelectBoxModule } from 'devextreme-angular';
import notify from 'devextreme/ui/notify';
import { confirm } from 'devextreme/ui/dialog';
import { environment } from '../../../environments/environment';
import { InventoryApi } from './inventory.api';
import { ReaderCaptureDirective } from '../../shared/reader-capture.directive';

@Component({
  selector: 'app-inventory-active',
  standalone: true,
  imports: [CommonModule, FormsModule, DxDataGridModule, DxSelectBoxModule, ReaderCaptureDirective],
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
            <span class="tbl-sub">{{ panel().expected.length }} ativos</span></div>
          <dx-data-grid [dataSource]="panel().expected" [showBorders]="false" [rowAlternationEnabled]="true"
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
                @case ('read_elsewhere') { <span class="tag info">ⓘ Lido em {{ sectorName(c.data.otherSectorId) }}</span> }
                @default { <span class="tag none">— não lido</span> }
              }
            </div>
          </dx-data-grid>
        </div>

        <div class="card tbl">
          <div class="tbl-title">Lidas neste setor
            <span class="tbl-sub">{{ panel().read.length }} EPCs</span></div>
          <dx-data-grid [dataSource]="panel().read" [showBorders]="false" [rowAlternationEnabled]="true"
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
  private http = inject(HttpClient);
  @ViewChild('epcBox') epcBox?: ElementRef<HTMLInputElement>;

  detail = signal<any>(null);
  sectors = signal<{ id: string; name: string }[]>([]);
  selectedVisit = signal<any>(null);
  panel = signal<{ expected: any[]; read: any[] }>({ expected: [], read: [] });
  busy = signal(false);
  now = signal(Date.now());

  pickedSectorId: string | null = null;
  epcInput = '';
  private sectorMap = new Map<string, string>();
  private timer: any;

  // Auto-registro do leitor: dedup por etiqueta na visita + envio em lote.
  private capturedEpcs = new Set<string>();
  private pendingReads: string[] = [];
  private flushTimer: any = null;

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

  async ngOnInit() {
    await Promise.all([this.loadDetail(), this.loadSectors()]);
    this.timer = setInterval(() => this.now.set(Date.now()), 1000);
  }
  ngOnDestroy() {
    if (this.timer) clearInterval(this.timer);
    if (this.flushTimer) clearTimeout(this.flushTimer);
  }

  sectorName = (id: string | null) => (id ? this.sectorMap.get(id) ?? '—' : '—');

  private async loadDetail() {
    try { this.detail.set(await this.api.detail(this.inventory.id)); }
    catch { notify('Falha ao carregar o inventário.', 'error', 3000); }
  }
  private async loadSectors() {
    try {
      const res: any = await firstValueFrom(
        this.http.get(`${environment.apiUrl}/sectors`, { params: { skip: 0, take: 500 } as any }),
      );
      const list = (res?.data ?? []).map((s: any) => ({ id: s.id, name: s.name }));
      this.sectors.set(list);
      this.sectorMap = new Map(list.map((s: any) => [s.id, s.name]));
    } catch { /* silencioso; nomes caem para '—' */ }
  }
  private async loadPanel() {
    const v = this.selectedVisit();
    if (!v) { this.panel.set({ expected: [], read: [] }); return; }
    try { this.panel.set(await this.api.panel(this.inventory.id, v.id)); }
    catch { this.panel.set({ expected: [], read: [] }); }
  }

  onPick(e: any) { if (e.event && e.value) this.selectSector(e.value); }

  async selectSector(sectorId: string) {
    this.busy.set(true);
    try {
      const visit = await this.api.selectSector(this.inventory.id, sectorId);
      await this.loadDetail();
      this.selectedVisit.set(visit);
      await this.loadPanel();
      this.seedCaptured();
      setTimeout(() => this.epcBox?.nativeElement.focus(), 0);
    } catch (e: any) {
      notify(e?.error?.message || 'Falha ao selecionar setor.', 'error', 3500);
    } finally { this.busy.set(false); }
  }

  async viewVisit(v: any) {
    this.selectedVisit.set(v);
    await this.loadPanel();
    this.seedCaptured();
    if (this.canCapture()) setTimeout(() => this.epcBox?.nativeElement.focus(), 0);
  }

  async addRead() {
    const epc = this.epcInput.trim().toUpperCase();
    if (!epc || !this.canCapture()) return;
    this.epcInput = '';
    this.capturedEpcs.add(epc);
    try {
      await this.api.addReads(this.inventory.id, this.selectedVisit().id, [epc]);
      await Promise.all([this.loadPanel(), this.loadDetail()]);
    } catch (e: any) {
      this.capturedEpcs.delete(epc);
      notify(e?.error?.message || 'Falha ao registrar leitura.', 'error', 3000);
    } finally {
      this.epcBox?.nativeElement.focus();
    }
  }

  /**
   * Chamado pela ReaderCaptureDirective a cada etiqueta lida (leitor HID).
   * Registra automaticamente cada tag distinta uma vez por visita (dedup) e
   * envia em lote para não sobrecarregar o backend no modo contínuo.
   */
  onReaderEpc(epc: string) {
    if (!this.canCapture()) return;
    const norm = epc.toUpperCase();
    if (this.capturedEpcs.has(norm)) return; // já lida nesta visita (1× por tag)
    this.capturedEpcs.add(norm);
    this.pendingReads.push(norm);
    this.epcInput = ''; // limpa o resíduo que o leitor digitou no campo
    if (this.flushTimer) clearTimeout(this.flushTimer);
    this.flushTimer = setTimeout(() => this.flushReads(), 600);
  }

  private async flushReads() {
    this.flushTimer = null;
    const batch = this.pendingReads.splice(0);
    const visit = this.selectedVisit();
    if (!batch.length || !visit) return;
    try {
      await this.api.addReads(this.inventory.id, visit.id, batch);
      await Promise.all([this.loadPanel(), this.loadDetail()]);
    } catch (e: any) {
      batch.forEach((epc) => this.capturedEpcs.delete(epc)); // permite re-tentar
      notify(e?.error?.message || 'Falha ao registrar leituras.', 'error', 3000);
    }
  }

  /** Semeia o dedup com o que já foi lido na visita e zera a fila pendente. */
  private seedCaptured() {
    this.capturedEpcs = new Set(
      (this.panel().read ?? []).map((r: any) => String(r.epc).toUpperCase()),
    );
    this.pendingReads = [];
    if (this.flushTimer) { clearTimeout(this.flushTimer); this.flushTimer = null; }
  }

  async completeSector() {
    this.busy.set(true);
    try {
      await this.api.completeSector(this.inventory.id, this.selectedVisit().id);
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
    const ok = await confirm(
      'A conciliação será executada com base em todos os setores concluídos. Deseja finalizar?',
      'Finalizar inventário',
    );
    if (!ok) return;
    this.busy.set(true);
    try {
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
