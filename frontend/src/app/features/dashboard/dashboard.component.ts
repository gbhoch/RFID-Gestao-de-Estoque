import { Component, computed, effect, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import {
  DxChartModule, DxDataGridModule, DxPieChartModule, DxPopupModule,
} from 'devextreme-angular';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ThemeService } from '../../core/theme.service';

interface Metric {
  label: string; value: number; tone: string; icon: string;
  /** Query params de /assets: torna o card um atalho para a lista filtrada. */
  link?: Record<string, string>;
}

/** Bens ativos de um setor (lista completa vinda do backend, count desc). */
interface SectorCount { sectorId: string; sector: string; count: number; }

interface Summary {
  metrics: {
    totalAssets: number; inUse: number; maintenance: number;
    missing: number; activeTags: number; inventoriesThisMonth: number;
    withoutSector: number;
  };
  bySector: SectorCount[];
  byStatus: { status: string; count: number }[];
}

/** Item do gráfico de setores. `key` é único (sectors.name não é). */
interface SectorBar { key: string; sector: string; count: number; isOthers: boolean; }

/** Linha do popup: fração do total de bens ativos com setor (0–1). */
interface SectorRow extends SectorCount { share: number; }

/** Quantos setores aparecem individualmente no gráfico; o resto vira "Outros". */
const TOP_SECTORS = 10;
const OTHERS_KEY = '__outros__';
/** Altura por barra e margem para o eixo de valores (px). */
const BAR_SLOT = 36;
const CHART_CHROME = 48;
/** Abaixo desta largura (tablet) o popup ocupa quase a tela toda. */
const NARROW = 1024;

const nf = new Intl.NumberFormat('pt-BR');
const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    CommonModule, RouterLink, DxChartModule, DxPieChartModule, DxPopupModule, DxDataGridModule,
  ],
  template: `
    <h1 class="page-title">Dashboard</h1>
    <p class="page-sub">Visão consolidada do parque de ativos e operações RFID.</p>

    <div class="metrics">
      @for (m of metrics(); track m.label) {
        @if (m.link) {
          <!-- Card com atalho: abre Patrimônios já filtrado -->
          <a class="card metric linked" routerLink="/assets" [queryParams]="m.link"
            [title]="'Ver patrimônios: ' + m.label">
            <ng-container *ngTemplateOutlet="metricBody; context: { $implicit: m }"></ng-container>
            <span class="metric-go">Ver lista
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"></path></svg>
            </span>
          </a>
        } @else {
          <div class="card metric">
            <ng-container *ngTemplateOutlet="metricBody; context: { $implicit: m }"></ng-container>
          </div>
        }
      }
    </div>

    <ng-template #metricBody let-m>
      <div class="metric-icon" [class]="m.tone">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"
          stroke-linecap="round" stroke-linejoin="round"><path [attr.d]="m.icon"></path></svg>
      </div>
      <div class="metric-body">
        <span class="metric-value">{{ m.value | number }}</span>
        <span class="metric-label">{{ m.label }}</span>
      </div>
    </ng-template>

    <div class="charts">
      <div class="card panel">
        <div class="panel-head">
          <div class="panel-title">
            <h3>Patrimônios por setor</h3>
            <span class="panel-tag">{{ sectorTag() }}</span>
          </div>
          <button class="btn ghost sm" [disabled]="!sectors().length" (click)="openSectors()">
            Ver todos os setores
          </button>
        </div>
        @if (loading()) {
          <div class="empty">Carregando…</div>
        } @else if (sectorBars().length) {
          <dx-chart class="sector-chart" [dataSource]="sectorBars()" [rotated]="true"
            [style.height.px]="sectorChartHeight()" [size]="{ height: sectorChartHeight() }"
            [customizePoint]="customizeSectorPoint()"
            (onPointClick)="onSectorPointClick($event)"
            (onPointHoverChanged)="onSectorPointHover($event)">
            <dxi-series valueField="count" argumentField="key" type="bar"
              [color]="chartColors().bar"></dxi-series>
            <dxo-common-series-settings [cornerRadius]="4" [barPadding]="0.25">
            </dxo-common-series-settings>
            <!-- rotated: o 1º item iria para baixo; inverted põe o maior no topo -->
            <dxo-argument-axis [inverted]="true">
              <dxo-grid [visible]="false"></dxo-grid>
              <dxo-label [customizeText]="sectorLabel" wordWrap="none" textOverflow="none"
                overlappingBehavior="none"></dxo-label>
            </dxo-argument-axis>
            <dxo-value-axis [allowDecimals]="false">
              <dxo-grid [visible]="true" [color]="chartColors().grid"></dxo-grid>
            </dxo-value-axis>
            <dxo-legend [visible]="false"></dxo-legend>
            <dxo-tooltip [enabled]="true" [customizeTooltip]="sectorTooltip"
              [color]="chartColors().tooltipBg" [border]="{ color: chartColors().grid }"
              [font]="{ color: chartColors().text }"></dxo-tooltip>
          </dx-chart>
        } @else if (error()) {
          <div class="empty">Indicadores indisponíveis.</div>
        } @else {
          <div class="empty">Nenhum bem ativo associado a setor.</div>
        }
      </div>

      <div class="card panel">
        <div class="panel-head">
          <h3>Status dos patrimônios</h3>
          <span class="panel-tag">Total da empresa</span>
        </div>
        @if (loading()) {
          <div class="empty">Carregando…</div>
        } @else if (byStatus().length) {
          <dx-pie-chart [dataSource]="byStatus()" type="doughnut" [palette]="palette"
            innerRadius="0.65">
            <dxi-series argumentField="status" valueField="count">
              <dxo-label [visible]="false"></dxo-label>
            </dxi-series>
            <dxo-legend [visible]="true" horizontalAlignment="center"
              verticalAlignment="bottom"></dxo-legend>
          </dx-pie-chart>
        } @else if (error()) {
          <div class="empty">Indicadores indisponíveis.</div>
        } @else {
          <div class="empty">Nenhum patrimônio cadastrado.</div>
        }
      </div>
    </div>

    @if (error()) { <p class="note error">{{ error() }}</p> }

    <!-- Popup com todos os setores (abre pela barra "Outros" ou pelo botão do painel) -->
    <dx-popup [visible]="sectorsVisible()" (visibleChange)="sectorsVisible.set($event)"
      title="Patrimônios por setor" [width]="popupWidth" [height]="popupHeight"
      [showCloseButton]="true" [dragEnabled]="false" [hideOnOutsideClick]="true"
      [wrapperAttr]="{ class: 'sector-popup' }">
      <div *dxTemplate="let _ of 'content'" class="sp">
        <p class="sp-sub">bens ativos · clique num setor para ver os patrimônios</p>
        <dx-data-grid class="sector-grid" [dataSource]="sectorRows()" keyExpr="sectorId"
          height="100%" [showBorders]="false" [showColumnLines]="false"
          [rowAlternationEnabled]="false" [hoverStateEnabled]="true"
          (onRowPrepared)="markEmptySector($event)" (onRowClick)="openSectorAssets($event)">
          <dxo-search-panel [visible]="true" [width]="260" placeholder="Buscar setor…">
          </dxo-search-panel>
          <dxo-paging [enabled]="false"></dxo-paging>
          <dxo-sorting mode="single"></dxo-sorting>
          <dxi-column dataField="sector" caption="Setor"></dxi-column>
          <dxi-column dataField="count" caption="Bens ativos" dataType="number" format="#,##0"
            sortOrder="desc" [allowSearch]="false" [width]="130"></dxi-column>
          <dxi-column dataField="share" caption="% do total" dataType="number"
            [format]="{ type: 'percent', precision: 1 }" [allowSearch]="false" [width]="120">
          </dxi-column>
          <dxo-summary>
            <dxi-total-item column="sector" summaryType="count" displayFormat="{0} setores">
            </dxi-total-item>
            <dxi-total-item column="count" summaryType="sum" valueFormat="#,##0"
              displayFormat="Total: {0}"></dxi-total-item>
          </dxo-summary>
        </dx-data-grid>
      </div>
    </dx-popup>
  `,
  styles: [`
    .metrics {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
      gap: 16px;
      margin-bottom: 22px;
    }
    .metric { display: flex; align-items: center; gap: 14px; padding: 18px; position: relative; }
    .metric-icon {
      width: 44px; height: 44px; border-radius: var(--radius);
      display: grid; place-items: center; flex: none;
    }
    .metric-icon svg { width: 22px; height: 22px; }
    .metric-icon.teal   { background: var(--brand-100); color: var(--brand-600); }
    .metric-icon.green  { background: rgba(26,143,111,.12); color: var(--success); }
    .metric-icon.amber  { background: rgba(192,138,30,.14); color: var(--warning); }
    .metric-icon.red    { background: rgba(192,67,47,.12);  color: var(--danger); }
    .metric-body { display: flex; flex-direction: column; }
    .metric-value { font-size: 26px; font-weight: 700; letter-spacing: -.02em; line-height: 1.1; }
    .metric-label { font-size: 13px; color: var(--text-soft); margin-top: 2px; }

    .charts { display: grid; grid-template-columns: 1.4fr 1fr; gap: 16px; align-items: start; }
    .panel { padding: 20px; }
    .panel-head {
      display: flex; align-items: baseline; justify-content: space-between;
      gap: 12px; margin-bottom: 14px;
    }
    .panel-title { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }
    .panel-head h3 { font-size: 15px; }
    .panel-tag { font-size: 12px; color: var(--text-faint); }
    .panel dx-chart, .panel dx-pie-chart { height: 280px; }
    /* Altura do gráfico de setores vem do número de barras (style binding). */
    .panel dx-chart.sector-chart { display: block; }
    .empty {
      height: 280px; display: grid; place-items: center;
      color: var(--text-faint); font-size: 13.5px;
    }

    .btn { font-size: 13.5px; font-weight: 600; border-radius: var(--radius-sm); cursor: pointer;
      padding: 9px 14px; border: 1px solid transparent; flex: none; }
    .btn.sm { padding: 7px 11px; font-size: 13px; }
    .btn.ghost { background: none; color: var(--text-soft); border-color: var(--border); }
    .btn:hover:not(:disabled) { color: var(--brand-600); border-color: var(--brand-600); }
    .btn:disabled { opacity: .5; cursor: default; }

    .note { margin-top: 18px; font-size: 12.5px; color: var(--text-faint); }
    .note.error { color: var(--danger); }

    /* Popup: o conteúdo é movido para o <body>, fora do escopo do componente →
       ::ng-deep com classes próprias (sp/sector-*) para não vazar em outras telas. */
    ::ng-deep .sector-popup .sp { display: flex; flex-direction: column; height: 100%; }
    ::ng-deep .sector-popup .sp-sub {
      margin: 0 0 12px; font-size: 12.5px; color: var(--text-faint);
    }
    ::ng-deep .sector-popup .sector-grid { flex: 1; min-height: 0; }
    ::ng-deep .sector-popup .dx-datagrid-header-panel {
      background: var(--surface); border-bottom: none; padding-bottom: 8px;
    }
    ::ng-deep .sector-popup .dx-datagrid-total-footer {
      background: var(--surface-2); border-top: 1px solid var(--border);
    }
    ::ng-deep .sector-popup .dx-datagrid-total-footer .dx-datagrid-content,
    ::ng-deep .sector-popup .dx-datagrid-total-footer .dx-row > td {
      background: var(--surface-2) !important;
    }
    ::ng-deep .sector-popup .dx-datagrid-summary-item {
      color: var(--text); font-weight: 650;
    }
    /* Setores sem bens ativos: no fim da lista, atenuados */
    ::ng-deep .sector-popup .dx-data-row.sector-empty > td {
      color: var(--text-faint) !important;
    }
    /* Linhas clicáveis: abrem Patrimônios filtrado pelo setor */
    ::ng-deep .sector-popup .dx-data-row { cursor: pointer; }
    ::ng-deep .sector-popup .dx-data-row.dx-state-hover > td:first-child {
      color: var(--brand-600) !important; text-decoration: underline;
      text-underline-offset: 3px;
    }

    /* Card com atalho para Patrimônios */
    .metric.linked {
      color: inherit; text-decoration: none; cursor: pointer;
      transition: border-color .15s, box-shadow .15s;
    }
    .metric.linked:hover, .metric.linked:focus-visible {
      border-color: var(--warning); box-shadow: var(--shadow); outline: none;
    }
    .metric-go {
      position: absolute; top: 10px; right: 12px;
      display: inline-flex; align-items: center; gap: 2px;
      font-size: 11.5px; font-weight: 600; color: var(--text-faint);
    }
    .metric-go svg { width: 13px; height: 13px; }
    .metric.linked:hover .metric-go { color: var(--warning); }

    @media (max-width: 900px) { .charts { grid-template-columns: 1fr; } }
  `],
})
export class DashboardComponent {
  private http = inject(HttpClient);
  private theme = inject(ThemeService);
  private router = inject(Router);

  palette = ['#14756a', '#36a89a', '#6fc4ba', '#c08a1e', '#c0432f', '#1a8f6f'];

  // Modelos dos cards (ícone/tom/rótulo). Os valores vêm do backend.
  metrics = signal<Metric[]>([]);
  /** Lista completa de setores (fonte única do gráfico e do popup). */
  sectors = signal<SectorCount[]>([]);
  byStatus = signal<{ status: string; count: number }[]>([]);
  loading = signal(true);
  error = signal<string | null>(null);
  sectorsVisible = signal(false);

  /** Total de bens ativos com setor: soma do gráfico = rodapé do popup. */
  sectorTotal = computed(() => this.sectors().reduce((sum, s) => sum + s.count, 0));

  /** 10 maiores setores com bens + "Outros" (só se a soma do resto > 0). */
  sectorBars = computed<SectorBar[]>(() => {
    const withAssets = this.sectors().filter((s) => s.count > 0);
    const bars: SectorBar[] = withAssets.slice(0, TOP_SECTORS)
      .map((s) => ({ key: s.sectorId, sector: s.sector, count: s.count, isOthers: false }));
    const rest = withAssets.slice(TOP_SECTORS).reduce((sum, s) => sum + s.count, 0);
    if (rest > 0) bars.push({ key: OTHERS_KEY, sector: 'Outros', count: rest, isOthers: true });
    return bars;
  });

  sectorRows = computed<SectorRow[]>(() => {
    const total = this.sectorTotal();
    return this.sectors().map((s) => ({ ...s, share: total ? s.count / total : 0 }));
  });

  sectorChartHeight = computed(() => this.sectorBars().length * BAR_SLOT + CHART_CHROME);
  sectorTag = computed(() => {
    const top = this.sectorBars().filter((b) => !b.isOthers).length;
    return `bens ativos · ${top} maiores setores`;
  });

  // O DevExtreme pinta o SVG com cor literal: lê os tokens do design system e
  // relê a cada troca de tema (o ThemeService aplica data-theme antes do effect).
  chartColors = signal(this.readColors());
  customizeSectorPoint = computed(() => {
    const c = this.chartColors();
    return (p: { data: SectorBar }) => (p.data.isOthers ? { color: c.others } : {});
  });

  private nameByKey = computed(() => new Map(this.sectorBars().map((b) => [b.key, b.sector])));
  sectorLabel = ({ value }: { value: string }) => this.nameByKey().get(value) ?? value;
  sectorTooltip = (info: { point: { data: SectorBar } }) => {
    const d = info.point.data;
    const hint = d.isOthers ? '<br><i>Clique para ver todos os setores</i>' : '';
    return { html: `<b>${escapeHtml(d.sector)}</b><br>${nf.format(d.count)} bens${hint}` };
  };

  // Funções: o DevExtreme reavalia ao redimensionar a janela.
  popupWidth = () => (window.innerWidth < NARROW ? window.innerWidth * 0.96 : 720);
  popupHeight = () =>
    window.innerWidth < NARROW ? window.innerHeight * 0.92 : Math.min(680, window.innerHeight * 0.9);

  constructor() {
    effect(() => {
      this.theme.theme();
      this.chartColors.set(this.readColors());
    });
    this.load();
  }

  openSectors() {
    this.sectorsVisible.set(true);
  }

  /** Linha do popup → Patrimônios filtrado pelo setor (só bens ativos, como a contagem). */
  openSectorAssets(e: { rowType: string; data?: SectorRow }) {
    if (e.rowType !== 'data' || !e.data) return;
    this.sectorsVisible.set(false);
    this.router.navigate(['/assets'], {
      queryParams: { sector: e.data.sectorId, status: 'active' },
    });
  }

  onSectorPointClick(e: { target: { data: SectorBar } }) {
    if (e.target.data.isOthers) this.openSectors();
  }

  /** Cursor de mão só sobre a barra "Outros" (a única clicável). */
  onSectorPointHover(e: { element: HTMLElement; target: { data: SectorBar; isHovered(): boolean } }) {
    e.element.style.cursor = e.target.isHovered() && e.target.data.isOthers ? 'pointer' : '';
  }

  markEmptySector(e: { rowType: string; data?: SectorRow; rowElement: HTMLElement }) {
    if (e.rowType === 'data' && e.data?.count === 0) e.rowElement.classList.add('sector-empty');
  }

  private readColors() {
    const css = getComputedStyle(document.documentElement);
    const v = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
    return {
      bar: v('--brand-600', '#14756a'),
      others: v('--text-faint', '#8a9a96'),
      grid: v('--border', '#e2e8e7'),
      text: v('--text', '#14211f'),
      tooltipBg: v('--surface', '#ffffff'),
    };
  }

  private async load() {
    try {
      const s = await firstValueFrom(
        this.http.get<Summary>(`${environment.apiUrl}/dashboard/summary`),
      );
      const m = s.metrics;
      this.metrics.set([
        { label: 'Total de patrimônios', value: m.totalAssets, tone: 'teal',
          icon: 'M20 7 12 3 4 7m16 0-8 4m8-4v10l-8 4m0-10L4 7m8 4v10' },
        { label: 'Ativos em uso', value: m.inUse, tone: 'green',
          icon: 'M22 11.08V12a10 10 0 1 1-5.93-9.14M22 4 12 14.01l-3-3' },
        { label: 'Em manutenção', value: m.maintenance, tone: 'amber',
          icon: 'M14.7 6.3a4 4 0 0 0-5.4 5.4l-6 6 3 3 6-6a4 4 0 0 0 5.4-5.4l-2.8 2.8-2.1-2.1z' },
        { label: 'Extraviados', value: m.missing, tone: 'red',
          icon: 'M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01' },
        { label: 'Sem setor', value: m.withoutSector, tone: 'amber',
          link: { sector: 'none', status: 'active' },
          icon: 'M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11zM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z' },
        { label: 'Tags RFID ativas', value: m.activeTags, tone: 'teal',
          icon: 'M4 9V6a2 2 0 0 1 2-2h3M4 15v3a2 2 0 0 0 2 2h3m6-16h3a2 2 0 0 1 2 2v3' },
        { label: 'Inventários no mês', value: m.inventoriesThisMonth, tone: 'green',
          icon: 'M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 12l2 2 4-4' },
      ]);
      this.sectors.set(s.bySector ?? []);
      this.byStatus.set(s.byStatus ?? []);
      this.error.set(null);
    } catch (e) {
      console.error('Falha ao carregar indicadores do dashboard:', e);
      this.error.set('Não foi possível carregar os indicadores. Verifique sua conexão.');
    } finally {
      this.loading.set(false);
    }
  }
}
