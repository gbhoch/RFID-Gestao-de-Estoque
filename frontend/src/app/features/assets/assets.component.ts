import { Component, DestroyRef, ViewChild, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute, ParamMap, Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  DxDataGridComponent, DxDataGridModule, DxSelectBoxModule, DxTextBoxModule,
} from 'devextreme-angular';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { RestStoreFactory } from '../../shared/rest-store.factory';
import { LookupService } from '../../shared/lookup.service';
import { PageHeaderComponent } from '../../shared/page-header.component';

/** Valores dos filtros como aparecem na URL (/assets?sector=none&status=active&q=mesa). */
type StatusFilter = 'active' | 'written_off' | 'all';
interface AssetFilters { sector: string; status: StatusFilter; q: string; }

const ALL_SECTORS = 'all';
const NO_SECTOR = 'none';           // = NO_SECTOR do backend
const DEFAULTS: AssetFilters = { sector: ALL_SECTORS, status: 'active', q: '' };
const STATUS_FILTERS: StatusFilter[] = ['active', 'written_off', 'all'];
const SEARCH_DEBOUNCE_MS = 400;

const nf = new Intl.NumberFormat('pt-BR');

@Component({
  selector: 'app-assets',
  standalone: true,
  imports: [CommonModule, DxDataGridModule, DxSelectBoxModule, DxTextBoxModule, PageHeaderComponent],
  template: `
    <app-page-header title="Patrimônios"
      subtitle="Ativos da planta com associação a etiquetas RFID."></app-page-header>

    <div class="card filters">
      <label class="f-field f-sector">
        <span class="f-label">Setor</span>
        <dx-select-box [items]="sectorOptions()" valueExpr="id" displayExpr="name"
          [value]="filters().sector" (onValueChanged)="onSectorChange($event)"
          [searchEnabled]="true" searchExpr="name" searchMode="contains"
          [showDataBeforeSearch]="true" noDataText="Nenhum setor encontrado"
          stylingMode="outlined"></dx-select-box>
      </label>
      <label class="f-field f-status">
        <span class="f-label">Situação</span>
        <dx-select-box [items]="statusOptions" valueExpr="value" displayExpr="text"
          [value]="filters().status" (onValueChanged)="onStatusChange($event)"
          stylingMode="outlined"></dx-select-box>
      </label>
      <label class="f-field f-search">
        <span class="f-label">Busca</span>
        <dx-text-box mode="search" placeholder="Nome ou código patrimonial"
          [value]="searchText" valueChangeEvent="input" [showClearButton]="true"
          (onValueChanged)="onSearchInput($event)" stylingMode="outlined"></dx-text-box>
      </label>
      <div class="f-end">
        <span class="f-count" aria-live="polite">{{ countLabel() }}</span>
        <button class="btn ghost sm" [disabled]="isDefault()" (click)="clearFilters()">
          Limpar filtros
        </button>
      </div>
    </div>

    <div class="card grid-card">
      <!-- Paginação E ordenação no servidor: ordenação local desligaria a paginação
           remota (o DevExtreme carregaria sem skip/take, preso no take padrão). -->
      <dx-data-grid [dataSource]="store" [remoteOperations]="{ paging: true, sorting: true }"
        [showBorders]="false" [columnAutoWidth]="false" [rowAlternationEnabled]="true"
        [hoverStateEnabled]="true" noDataText="Nenhum patrimônio encontrado para os filtros."
        height="100%">

        <dxo-sorting mode="single"></dxo-sorting>
        <dxo-paging [pageSize]="15"></dxo-paging>
        <dxo-pager [visible]="true" [showPageSizeSelector]="true"
          [allowedPageSizes]="[15,30,60]" [showInfo]="true"></dxo-pager>
        <dxo-editing mode="popup" [allowAdding]="true" [allowUpdating]="true"
          [allowDeleting]="true" [useIcons]="true">
          <dxo-popup title="Patrimônio" [showTitle]="true" [width]="760" [height]="600"></dxo-popup>
          <dxo-form [colCount]="2">
            <dxi-item itemType="group" caption="Identificação" [colCount]="2" [colSpan]="2">
              <dxi-item dataField="assetCode"></dxi-item>
              <dxi-item dataField="name"></dxi-item>
              <dxi-item dataField="categoryId"></dxi-item>
              <dxi-item dataField="status"></dxi-item>
            </dxi-item>
            <dxi-item itemType="group" caption="Características" [colCount]="2" [colSpan]="2">
              <dxi-item dataField="brand"></dxi-item>
              <dxi-item dataField="model"></dxi-item>
              <dxi-item dataField="serialNumber"></dxi-item>
              <dxi-item dataField="acquisitionValue"></dxi-item>
            </dxi-item>
            <dxi-item itemType="group" caption="Alocação" [colCount]="2" [colSpan]="2">
              <dxi-item dataField="sectorId"></dxi-item>
              <dxi-item dataField="ownerId"></dxi-item>
              <dxi-item dataField="rfidTagId"></dxi-item>
            </dxi-item>
            <dxi-item dataField="notes" editorType="dxTextArea" [colSpan]="2">
              <dxo-label text="Observação"></dxo-label>
            </dxi-item>
          </dxo-form>
        </dxo-editing>

        <!-- Visíveis no grid: Código (fixo), Nome (ocupa o resto), Categoria, Setor, Status.
             As demais ficam com visible=false: somem do grid mas continuam no formulário. -->
        <!-- Ordenáveis (no servidor): Código, Nome, Status. Padrão = Código crescente. -->
        <dxi-column dataField="assetCode" caption="Código" [width]="130" [fixed]="true" sortOrder="asc"
          fixedPosition="left">
          <dxi-validation-rule type="required"></dxi-validation-rule>
        </dxi-column>
        <!-- Sem largura: o Nome recebe o espaço livre; texto longo corta no fim, com dica. -->
        <dxi-column dataField="name" caption="Nome" [minWidth]="240" alignment="left">
          <dxi-validation-rule type="required"></dxi-validation-rule>
        </dxi-column>
        <dxi-column dataField="categoryId" caption="Categoria" [width]="200" [allowSorting]="false">
          <dxo-lookup [dataSource]="categories" valueExpr="id" displayExpr="name"></dxo-lookup>
          <dxi-validation-rule type="required"></dxi-validation-rule>
        </dxi-column>
        <dxi-column dataField="brand" caption="Marca" [visible]="false"></dxi-column>
        <dxi-column dataField="model" caption="Modelo" [visible]="false"></dxi-column>
        <dxi-column dataField="serialNumber" caption="Nº de série" [visible]="false"></dxi-column>
        <dxi-column dataField="sectorId" caption="Setor" [width]="220" [allowSorting]="false">
          <dxo-lookup [dataSource]="sectors" valueExpr="id" displayExpr="name"></dxo-lookup>
        </dxi-column>
        <dxi-column dataField="ownerId" caption="Responsável" [visible]="false">
          <dxo-lookup [dataSource]="users" valueExpr="id" displayExpr="name"></dxo-lookup>
        </dxi-column>
        <dxi-column dataField="rfidTagId" caption="Etiqueta RFID" [visible]="false">
          <dxo-lookup [dataSource]="tags" valueExpr="id" displayExpr="epc"></dxo-lookup>
        </dxi-column>
        <dxi-column dataField="status" caption="Status" cellTemplate="statusCell" [width]="150">
          <dxo-lookup [dataSource]="statuses" valueExpr="value" displayExpr="text"></dxo-lookup>
        </dxi-column>
        <dxi-column dataField="acquisitionValue" caption="Valor" dataType="number"
          format="R$ #,##0.00" [width]="130" [visible]="false"></dxi-column>
        <dxi-column dataField="notes" caption="Observação" [visible]="false"></dxi-column>

        <div *dxTemplate="let cell of 'statusCell'">
          <span class="pill" [class]="pillClass(cell.value)">{{ label(cell.value) }}</span>
        </div>
      </dx-data-grid>
    </div>
  `,
  styles: [`
    .filters {
      display: flex; flex-wrap: wrap; align-items: flex-end; gap: 12px 14px;
      padding: 14px 16px; margin-bottom: 12px;
    }
    .f-field { display: flex; flex-direction: column; gap: 5px; min-width: 0; }
    .f-label { font-size: 12px; font-weight: 600; color: var(--text-soft); }
    .f-sector { flex: 1 1 260px; max-width: 340px; }
    .f-status { flex: 0 1 170px; }
    .f-search { flex: 1 1 240px; max-width: 360px; }
    .f-end { display: flex; align-items: center; gap: 14px; margin-left: auto; }
    .f-count { font-size: 13.5px; font-weight: 600; color: var(--text); white-space: nowrap; }

    .btn { font-size: 13.5px; font-weight: 600; border-radius: var(--radius-sm); cursor: pointer;
      padding: 9px 14px; border: 1px solid transparent; }
    .btn.sm { padding: 7px 11px; font-size: 13px; }
    .btn.ghost { background: none; color: var(--text-soft); border-color: var(--border); }
    .btn:hover:not(:disabled) { color: var(--brand-600); border-color: var(--brand-600); }
    .btn:disabled { opacity: .5; cursor: default; }

    .grid-card {
      padding: 8px; height: calc(100vh - var(--topbar-h) - 210px); min-height: 360px;
    }
  `],
})
export class AssetsComponent {
  private factory = inject(RestStoreFactory);
  private lookup = inject(LookupService);
  private http = inject(HttpClient);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  @ViewChild(DxDataGridComponent) private grid?: DxDataGridComponent;

  /** Filtros vigentes — a URL é a fonte da verdade (sobrevive ao recarregar). */
  filters = signal<AssetFilters>(DEFAULTS);
  total = signal<number | null>(null);
  searchText = '';
  private searchTimer?: ReturnType<typeof setTimeout>;

  store = this.factory.create('assets', {
    params: () => this.toApiParams(this.filters()),
    onLoaded: (t) => this.total.set(t),
    remoteSort: true,
  });
  categories = this.lookup.categories();
  sectors = this.lookup.sectors();
  users = this.lookup.users();
  tags = this.lookup.rfidTags();

  private sectorList = signal<{ id: string; name: string }[]>([]);
  sectorOptions = computed(() => [
    { id: ALL_SECTORS, name: 'Todos' },
    { id: NO_SECTOR, name: 'Sem setor' },
    ...this.sectorList(),
  ]);
  statusOptions = [
    { value: 'active', text: 'Ativos' },
    { value: 'written_off', text: 'Baixados' },
    { value: 'all', text: 'Todos' },
  ];

  countLabel = computed(() => {
    const t = this.total();
    if (t === null) return 'Carregando…';
    return `${nf.format(t)} ${t === 1 ? 'patrimônio' : 'patrimônios'}`;
  });
  isDefault = computed(() => {
    const f = this.filters();
    return f.sector === DEFAULTS.sector && f.status === DEFAULTS.status && !f.q;
  });

  statuses = [
    { value: 'available', text: 'Disponível' },
    { value: 'in_use', text: 'Em uso' },
    { value: 'maintenance', text: 'Em manutenção' },
    { value: 'reserved', text: 'Reservado' },
    { value: 'missing', text: 'Extraviado' },
    { value: 'loaned', text: 'Emprestado' },
    { value: 'written_off', text: 'Baixado' },
    { value: 'scrapped', text: 'Sucateado' },
  ];
  label = (v: string) => this.statuses.find((s) => s.value === v)?.text ?? v;
  pillClass(v: string) {
    if (['available', 'in_use'].includes(v)) return 'pill-success';
    if (['maintenance', 'reserved', 'loaned'].includes(v)) return 'pill-warning';
    if (['missing', 'written_off', 'scrapped'].includes(v)) return 'pill-danger';
    return 'pill-neutral';
  }

  constructor() {
    // Lê os filtros da URL (inclusive ao abrir pelo Dashboard) e recarrega o grid.
    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe((p) => {
      const next = this.fromQuery(p);
      this.searchText = next.q;
      this.filters.set(next);
      this.reloadGrid();
    });
    inject(DestroyRef).onDestroy(() => clearTimeout(this.searchTimer));
    this.loadSectors();
  }

  onSectorChange(e: { value: string | null; event?: unknown }) {
    if (e.value) this.applyFilters({ sector: e.value });
  }

  onStatusChange(e: { value: StatusFilter | null }) {
    if (e.value) this.applyFilters({ status: e.value });
  }

  onSearchInput(e: { value: string | null }) {
    clearTimeout(this.searchTimer);
    const q = (e.value ?? '').trim();
    this.searchTimer = setTimeout(() => this.applyFilters({ q }), SEARCH_DEBOUNCE_MS);
  }

  clearFilters() {
    clearTimeout(this.searchTimer);
    this.applyFilters(DEFAULTS);
  }

  /** Grava os filtros na URL; a assinatura de queryParamMap aplica e recarrega. */
  private applyFilters(patch: Partial<AssetFilters>) {
    const next = { ...this.filters(), ...patch };
    const cur = this.filters();
    if (next.sector === cur.sector && next.status === cur.status && next.q === cur.q) return;
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: this.toQuery(next),
      replaceUrl: true,
    });
  }

  private reloadGrid() {
    const g = this.grid?.instance;
    if (!g) return; // primeira carga: o grid ainda não existe e já lerá os filtros
    this.total.set(null);
    if (g.pageIndex() !== 0) g.pageIndex(0); // mudar de página já recarrega
    else g.refresh();
  }

  private fromQuery(p: ParamMap): AssetFilters {
    const status = p.get('status') as StatusFilter | null;
    return {
      sector: p.get('sector') || DEFAULTS.sector,
      status: status && STATUS_FILTERS.includes(status) ? status : DEFAULTS.status,
      q: (p.get('q') ?? '').trim(),
    };
  }

  /** Só o que difere do padrão vai para a URL (exceto status, sempre explícito). */
  private toQuery(f: AssetFilters): Record<string, string> {
    const q: Record<string, string> = { status: f.status };
    if (f.sector !== ALL_SECTORS) q['sector'] = f.sector;
    if (f.q) q['q'] = f.q;
    return q;
  }

  private toApiParams(f: AssetFilters) {
    return {
      sectorId: f.sector === ALL_SECTORS ? undefined : f.sector,
      status: f.status === 'all' ? undefined : f.status,
      search: f.q || undefined,
    };
  }

  private async loadSectors() {
    try {
      const res: any = await firstValueFrom(
        this.http.get(`${environment.apiUrl}/sectors`, { params: { skip: 0, take: 500 } }),
      );
      const list: { id: string; name: string }[] = (res?.data ?? [])
        .map((s: any) => ({ id: s.id, name: s.name }))
        .sort((a: any, b: any) => a.name.localeCompare(b.name, 'pt-BR'));
      this.sectorList.set(list);
    } catch (e) {
      console.error('Falha ao carregar setores para o filtro:', e);
    }
  }
}
