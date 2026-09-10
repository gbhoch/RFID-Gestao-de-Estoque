import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import {
  DxDataGridModule, DxPopupModule, DxSelectBoxModule, DxTextAreaModule,
} from 'devextreme-angular';
import notify from 'devextreme/ui/notify';
import { InventoryApi } from './inventory.api';
import { LookupService } from '../../shared/lookup.service';

const RESOLUTIONS_BY_TYPE: Record<string, { value: string; text: string }[]> = {
  location_mismatch: [
    { value: 'accept_location', text: 'Aceitar nova localização' },
    { value: 'justified', text: 'Justificar' },
  ],
  not_found: [
    { value: 'mark_missing', text: 'Marcar como extraviado' },
    { value: 'justified', text: 'Justificar' },
  ],
  unknown_tag: [
    { value: 'register_tag', text: 'Cadastrar etiqueta' },
    { value: 'justified', text: 'Justificar' },
  ],
};

@Component({
  selector: 'app-inventory-reconciliation',
  standalone: true,
  imports: [CommonModule, DxDataGridModule, DxPopupModule, DxSelectBoxModule, DxTextAreaModule],
  template: `
    <div class="rec-head">
      <button class="icon-btn" (click)="back()" title="Voltar">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
          stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
      </button>
      <div>
        <h1 class="page-title">Conciliação</h1>
        @if (detail(); as d) {
          <p class="page-sub">{{ d.code }} · {{ d.startedAt | date:'dd/MM/yyyy HH:mm' }}
            → {{ d.finishedAt | date:'dd/MM/yyyy HH:mm' }}</p>
        }
      </div>
      <!-- Reabrir só faz sentido enquanto nada foi resolvido: aceitar localização move
           o ativo e cria movimentação, e isso não se desfaz. O servidor também recusa. -->
      @if (canReopen()) {
        <button class="btn secondary sm" [disabled]="reopening()" (click)="reopen()"
          title="Traz o inventário de volta para em andamento, para receber coleta que chegou tarde do coletor">
          {{ reopening() ? 'Reabrindo…' : 'Reabrir inventário' }}
        </button>
      }
    </div>

    @if (loading()) {
      <div class="card muted-card">Carregando…</div>
    } @else if (detail(); as d) {
      <!-- Indicadores -->
      <div class="stats">
        <div class="stat primary"><span class="sv">{{ d.accuracyRate ?? 0 }}%</span><span class="sl">Acuracidade</span></div>
        <div class="stat"><span class="sv">{{ d.expectedCount ?? 0 }}</span><span class="sl">Esperados</span></div>
        <div class="stat"><span class="sv ok">{{ d.conformCount ?? 0 }}</span><span class="sl">Conformes</span></div>
        <div class="stat"><span class="sv warn">{{ d.discrepancies.byType.location_mismatch ?? 0 }}</span><span class="sl">Deslocados</span></div>
        <div class="stat"><span class="sv danger">{{ d.discrepancies.byType.not_found ?? 0 }}</span><span class="sl">Não encontrados</span></div>
        <div class="stat"><span class="sv">{{ d.discrepancies.byType.unknown_tag ?? 0 }}</span><span class="sl">Tags desconhecidas</span></div>
        <div class="stat"><span class="sv" [class.pend]="d.discrepancies.unresolved > 0">{{ d.discrepancies.unresolved }}</span><span class="sl">Pendentes</span></div>
        <div class="stat"><span class="sv">{{ d.outOfScopeCount ?? 0 }}</span><span class="sl">Fora do escopo</span></div>
      </div>

      <!-- Grade de divergências -->
      <div class="card grid-card">
        <dx-data-grid [dataSource]="discrepancies()" [showBorders]="false" [rowAlternationEnabled]="true"
          [columnAutoWidth]="true" [hoverStateEnabled]="true"
          noDataText="Nenhuma divergência — inventário 100% conforme." height="480">
          <dxo-paging [pageSize]="15"></dxo-paging>
          <dxo-pager [visible]="true" [showInfo]="true"></dxo-pager>
          <dxo-filter-row [visible]="true"></dxo-filter-row>
          <dxo-header-filter [visible]="true"></dxo-header-filter>
          <dxo-search-panel [visible]="true" [width]="220" placeholder="Buscar…"></dxo-search-panel>

          <dxi-column dataField="type" caption="Tipo" [width]="150" cellTemplate="typeCell"></dxi-column>
          <dxi-column dataField="assetId" caption="Patrimônio" [width]="130">
            <dxo-lookup [dataSource]="assets" valueExpr="id" displayExpr="assetCode"></dxo-lookup>
          </dxi-column>
          <dxi-column dataField="epc" caption="EPC"></dxi-column>
          <dxi-column dataField="expectedSectorId" caption="Setor esperado">
            <dxo-lookup [dataSource]="sectors" valueExpr="id" displayExpr="name"></dxo-lookup>
          </dxi-column>
          <dxi-column dataField="foundSectorId" caption="Setor encontrado">
            <dxo-lookup [dataSource]="sectors" valueExpr="id" displayExpr="name"></dxo-lookup>
          </dxi-column>
          <dxi-column dataField="resolution" caption="Resolução" [width]="150" cellTemplate="resCell"></dxi-column>
          <dxi-column dataField="resolutionNotes" caption="Notas" [visible]="false"></dxi-column>
          <dxi-column dataField="resolvedByUserId" caption="Resolvido por" [width]="140">
            <dxo-lookup [dataSource]="users" valueExpr="id" displayExpr="name"></dxo-lookup>
          </dxi-column>
          <dxi-column dataField="resolvedAt" caption="Resolvido em" dataType="date"
            format="dd/MM/yyyy HH:mm" [width]="140"></dxi-column>
          <dxi-column type="buttons" caption="" [width]="110">
            <dxi-button hint="Resolver" icon="check" [visible]="canResolve" [onClick]="openResolve"></dxi-button>
          </dxi-column>

          <div *dxTemplate="let c of 'typeCell'">
            <span class="pill" [class]="typeClass(c.value)">{{ typeLabel(c.value) }}</span>
          </div>
          <div *dxTemplate="let c of 'resCell'">
            @if (c.value) { <span class="tag ok">{{ resolutionLabel(c.value) }}</span> }
            @else { <span class="tag pend">Pendente</span> }
          </div>
        </dx-data-grid>
      </div>
    } @else {
      <div class="card muted-card">Inventário não encontrado.</div>
    }

    <!-- Popup de resolução -->
    <dx-popup [(visible)]="resolveVisible" title="Resolver divergência" [width]="500" height="auto"
      [showCloseButton]="true" [dragEnabled]="false">
      <div *dxTemplate="let _ of 'content'">
        @if (selected(); as s) {
          <div class="rf">
            <div class="rf-summary">
              <span class="pill" [class]="typeClass(s.type)">{{ typeLabel(s.type) }}</span>
              <span class="rf-sub">{{ s.epc || '—' }}</span>
            </div>
            <label class="rf-field">Desfecho
              <dx-select-box [items]="resolveOptions()" displayExpr="text" valueExpr="value"
                [(value)]="resolution" placeholder="Selecione…"></dx-select-box>
            </label>
            <label class="rf-field">Notas @if (resolution === 'justified') { <span class="req">*</span> }
              <dx-text-area [(value)]="resolutionNotes" [height]="80"
                placeholder="Justificativa (obrigatória para justificar)"></dx-text-area>
            </label>
            <div class="rf-actions">
              <button class="btn ghost" (click)="resolveVisible = false">Cancelar</button>
              <button class="btn primary" [disabled]="!resolution || saving()" (click)="confirmResolve()">
                {{ saving() ? 'Salvando…' : 'Confirmar' }}
              </button>
            </div>
          </div>
        }
      </div>
    </dx-popup>
  `,
  styles: [`
    .rec-head { display: flex; align-items: center; gap: 14px; margin-bottom: 18px; }
    .icon-btn { display: grid; place-items: center; width: 38px; height: 38px;
      border: 1px solid var(--border); background: var(--surface); cursor: pointer;
      color: var(--text-soft); border-radius: var(--radius-sm); }
    .icon-btn svg { width: 18px; height: 18px; }
    .icon-btn:hover { background: var(--surface-2); color: var(--text); }
    .page-title { margin: 0; } .page-sub { margin: 2px 0 0; }

    .card { padding: 16px 18px; margin-bottom: 14px; }
    .muted-card { color: var(--text-faint); }
    .grid-card { padding: 12px 14px; }

    .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 12px; margin-bottom: 16px; }
    .stat { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius);
      padding: 14px 16px; text-align: center; }
    .stat.primary { background: var(--brand-50); border-color: var(--brand-100); }
    .sv { display: block; font-size: 24px; font-weight: 700; color: var(--brand-600); letter-spacing: -.02em; }
    .sv.ok { color: var(--success); } .sv.warn { color: var(--warning); } .sv.danger { color: var(--danger); }
    .sv.pend { color: var(--danger); }
    .sl { font-size: 12px; color: var(--text-soft); }

    .tag { font-size: 12px; font-weight: 600; padding: 2px 8px; border-radius: 999px; }
    .tag.ok { background: rgba(26,143,111,.12); color: var(--success); }
    .tag.pend { background: rgba(192,138,30,.14); color: var(--warning); }

    .rf { display: flex; flex-direction: column; gap: 14px; padding: 4px; }
    .rf-summary { display: flex; align-items: center; gap: 10px; }
    .rf-sub { font-family: var(--font-mono); font-size: 13px; color: var(--text-soft); }
    .rf-field { display: flex; flex-direction: column; gap: 5px; font-size: 12.5px; font-weight: 600; color: var(--text-soft); }
    .req { color: var(--danger); }
    .rf-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 4px; }
    .btn { font-size: 13.5px; font-weight: 600; border-radius: var(--radius-sm); cursor: pointer;
      padding: 9px 16px; border: 1px solid transparent; }
    .btn.primary { background: var(--brand-600); color: #fff; }
    .btn.ghost { background: none; color: var(--text-soft); border-color: var(--border); }
    .btn:disabled { opacity: .5; cursor: default; }
  `],
})
export class InventoryReconciliationComponent {
  private api = inject(InventoryApi);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private lookup = inject(LookupService);

  id = this.route.snapshot.paramMap.get('id')!;
  loading = signal(true);
  detail = signal<any>(null);
  discrepancies = signal<any[]>([]);

  sectors = this.lookup.sectors();
  assets = this.lookup.assets();
  users = this.lookup.users();

  // Popup
  resolveVisible = false;
  selected = signal<any>(null);
  resolveOptions = signal<{ value: string; text: string }[]>([]);
  resolution: string | null = null;
  resolutionNotes = '';
  saving = signal(false);
  reopening = signal(false);

  /** Reabrir é possível enquanto o inventário está encerrado e nada foi resolvido. */
  canReopen = computed(() => {
    const d = this.detail();
    return !!d && d.status !== 'in_progress' && d.status !== 'paused'
      && this.discrepancies().every((disc) => !disc.resolution);
  });

  constructor() { this.load(); }

  private async load() {
    this.loading.set(true);
    try {
      const [d, discs] = await Promise.all([this.api.detail(this.id), this.api.discrepancies(this.id)]);
      this.detail.set(d);
      this.discrepancies.set(discs);
    } catch {
      notify('Falha ao carregar a conciliação.', 'error', 3500);
    } finally {
      this.loading.set(false);
    }
  }

  async reopen() {
    this.reopening.set(true);
    try {
      await this.api.reopen(this.id);
      notify('Inventário reaberto. As coletas travadas no coletor sobem no próximo envio.', 'success', 4000);
      await this.load();
    } catch (e: any) {
      // 409 do servidor: já existe outro inventário aberto, ou alguma divergência
      // foi resolvida e reabrir desfaria movimentação de ativo.
      notify(e?.error?.message ?? 'Não foi possível reabrir o inventário.', 'error', 4500);
    } finally {
      this.reopening.set(false);
    }
  }

  canResolve = (e: any) => !e.row.data.resolution;

  openResolve = (e: any) => {
    const disc = e.row.data;
    this.selected.set(disc);
    this.resolveOptions.set(RESOLUTIONS_BY_TYPE[disc.type] ?? []);
    this.resolution = null;
    this.resolutionNotes = '';
    this.resolveVisible = true;
  };

  async confirmResolve() {
    const disc = this.selected();
    if (!this.resolution) return;
    if (this.resolution === 'justified' && !this.resolutionNotes.trim()) {
      notify('Informe a justificativa (notas) para justificar.', 'warning', 3000);
      return;
    }
    this.saving.set(true);
    try {
      await this.api.resolve(this.id, disc.id, this.resolution, this.resolutionNotes.trim() || undefined);
      notify('Divergência resolvida.', 'success', 2000);
      this.resolveVisible = false;
      await this.load();
    } catch (e: any) {
      notify(e?.error?.message || 'Falha ao resolver.', 'error', 3500);
    } finally {
      this.saving.set(false);
    }
  }

  back() { this.router.navigate(['/inventory']); }

  typeLabel(v: string) {
    return { location_mismatch: 'Localização', not_found: 'Não encontrado', unknown_tag: 'Tag desconhecida' }[v] ?? v;
  }
  typeClass(v: string) {
    return { location_mismatch: 'pill-warning', not_found: 'pill-danger', unknown_tag: 'pill-neutral' }[v] ?? 'pill-neutral';
  }
  resolutionLabel(v: string) {
    return { accept_location: 'Aceita localização', justified: 'Justificada', mark_missing: 'Extraviado', register_tag: 'Etiqueta cadastrada' }[v] ?? v;
  }
}
