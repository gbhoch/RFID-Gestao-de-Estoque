import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { DxDataGridModule } from 'devextreme-angular';
import notify from 'devextreme/ui/notify';
import { RestStoreFactory } from '../../shared/rest-store.factory';
import { InventoryApi } from './inventory.api';
import { InventoryActiveComponent } from './inventory-active.component';

@Component({
  selector: 'app-inventory',
  standalone: true,
  imports: [CommonModule, FormsModule, DxDataGridModule, InventoryActiveComponent],
  template: `
    <h1 class="page-title">Inventário</h1>
    <p class="page-sub">Levantamento por leitura de etiquetas — coleta agora, conciliação ao finalizar.</p>

    @if (loading()) {
      <div class="card muted-card">Carregando…</div>
    } @else if (current(); as inv) {
      <app-inventory-active [inventory]="inv"
        (finished)="onFinished($event)"></app-inventory-active>
    } @else {
      <!-- Estado 1: nenhum inventário aberto -->
      <div class="card start">
        <div class="step-badge">+</div>
        <div class="start-body">
          <h3>Iniciar novo inventário</h3>
          <p>Nenhum inventário aberto. Comece um novo levantamento — os setores são adicionados
            conforme você visita.</p>
          <div class="start-row">
            <input [(ngModel)]="description" placeholder="Descrição (opcional)" (keyup.enter)="start()" />
            <button class="primary" [disabled]="starting()" (click)="start()">
              {{ starting() ? 'Iniciando…' : 'Iniciar novo inventário' }}
            </button>
          </div>
        </div>
      </div>

      <div class="card grid-card">
        <div class="card-title">Histórico</div>
        <dx-data-grid [dataSource]="history" [remoteOperations]="{ paging: true }"
          [showBorders]="false" [columnAutoWidth]="true" [rowAlternationEnabled]="true"
          [hoverStateEnabled]="true" noDataText="Nenhum inventário registrado." height="440">
          <dxo-paging [pageSize]="10"></dxo-paging>
          <dxo-pager [visible]="true" [showInfo]="true"></dxo-pager>

          <dxi-column dataField="code" caption="Código" [width]="150"></dxi-column>
          <dxi-column dataField="startedAt" caption="Início" dataType="date"
            format="dd/MM/yyyy HH:mm"></dxi-column>
          <dxi-column dataField="finishedAt" caption="Fim" dataType="date"
            format="dd/MM/yyyy HH:mm"></dxi-column>
          <dxi-column dataField="sectorCount" caption="Setores" [width]="90" alignment="center"></dxi-column>
          <dxi-column dataField="discrepancyCount" caption="Divergências" [width]="110" alignment="center"></dxi-column>
          <dxi-column dataField="unresolvedCount" caption="Pendentes" [width]="100" alignment="center"
            cellTemplate="pendCell"></dxi-column>
          <dxi-column dataField="status" caption="Status" [width]="140" cellTemplate="statusCell"></dxi-column>
          <dxi-column type="buttons" caption="" [width]="120">
            <dxi-button hint="Ver conciliação" icon="find" [onClick]="openReconciliation"></dxi-button>
          </dxi-column>

          <div *dxTemplate="let c of 'statusCell'">
            <span class="pill" [class]="statusClass(c.value)">{{ statusLabel(c.value) }}</span>
          </div>
          <div *dxTemplate="let c of 'pendCell'">
            <span [class.pend]="c.value > 0">{{ c.value }}</span>
          </div>
        </dx-data-grid>
      </div>
      @if (error()) { <p class="err">{{ error() }}</p> }
    }
  `,
  styles: [`
    .card { padding: 20px; margin-bottom: 16px; }
    .muted-card { color: var(--text-faint); }
    .card-title { font-size: 14px; font-weight: 650; margin-bottom: 12px; }
    .grid-card { padding: 16px 18px; }

    .start { display: flex; gap: 18px; }
    .step-badge {
      width: 32px; height: 32px; flex: none; border-radius: 50%;
      display: grid; place-items: center;
      background: var(--brand-100); color: var(--brand-600); font-weight: 700; font-size: 18px;
    }
    .start-body h3 { font-size: 16px; margin-bottom: 4px; }
    .start-body p { color: var(--text-soft); font-size: 14px; margin: 0 0 14px; }
    .start-row { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
    input {
      padding: 11px 13px; font-size: 14px; color: var(--text);
      background: var(--surface); border: 1.5px solid var(--border-strong);
      border-radius: var(--radius-sm); min-width: 280px;
    }
    input:focus { outline: none; border-color: var(--brand-600); box-shadow: 0 0 0 3px var(--brand-100); }
    button { font-size: 14px; font-weight: 600; border-radius: var(--radius-sm);
      cursor: pointer; padding: 11px 16px; border: 1px solid transparent; }
    .primary { background: var(--brand-600); color: #fff; }
    .primary:hover:not(:disabled) { background: var(--brand-700); }
    button:disabled { opacity: .5; cursor: default; }

    .pend { color: var(--danger); font-weight: 700; }
    .err { color: var(--danger); font-size: 13px; }
  `],
})
export class InventoryComponent {
  private api = inject(InventoryApi);
  private factory = inject(RestStoreFactory);
  private router = inject(Router);

  loading = signal(true);
  error = signal<string | null>(null);
  current = signal<any>(null);
  starting = signal(false);
  description = '';

  history = this.factory.create('inventory');

  constructor() { this.load(); }

  async load() {
    this.loading.set(true); this.error.set(null);
    try {
      this.current.set(await this.api.current());
    } catch {
      this.error.set('Não foi possível carregar o inventário. Verifique sua conexão.');
    } finally {
      this.loading.set(false);
    }
  }

  async start() {
    this.starting.set(true);
    try {
      const inv = await this.api.create(this.description?.trim() || undefined);
      this.description = '';
      this.current.set(inv);
      notify('Inventário iniciado.', 'success', 2000);
    } catch (e: any) {
      notify(e?.error?.message || 'Falha ao iniciar inventário.', 'error', 4000);
    } finally {
      this.starting.set(false);
    }
  }

  onFinished(id: string) {
    this.current.set(null);
    this.router.navigate(['/inventory', id, 'reconciliation']);
  }

  openReconciliation = (e: any) => this.router.navigate(['/inventory', e.row.data.id, 'reconciliation']);

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
