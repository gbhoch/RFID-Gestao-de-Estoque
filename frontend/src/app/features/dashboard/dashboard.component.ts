import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DxChartModule, DxPieChartModule } from 'devextreme-angular';

interface Metric { label: string; value: number; delta?: string; tone: string; icon: string; }

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, DxChartModule, DxPieChartModule],
  template: `
    <h1 class="page-title">Dashboard</h1>
    <p class="page-sub">Visão consolidada do parque de ativos e operações RFID.</p>

    <div class="metrics">
      @for (m of metrics(); track m.label) {
        <div class="card metric">
          <div class="metric-icon" [class]="m.tone">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"
              stroke-linecap="round" stroke-linejoin="round"><path [attr.d]="m.icon"></path></svg>
          </div>
          <div class="metric-body">
            <span class="metric-value">{{ m.value | number }}</span>
            <span class="metric-label">{{ m.label }}</span>
          </div>
          @if (m.delta) { <span class="metric-delta">{{ m.delta }}</span> }
        </div>
      }
    </div>

    <div class="charts">
      <div class="card panel">
        <div class="panel-head">
          <h3>Patrimônios por setor</h3>
          <span class="panel-tag">distribuição atual</span>
        </div>
        <dx-chart [dataSource]="bySector()" [palette]="palette">
          <dxi-series valueField="count" argumentField="sector" type="bar"></dxi-series>
          <dxo-legend [visible]="false"></dxo-legend>
          <dxo-argument-axis><dxo-grid [visible]="false"></dxo-grid></dxo-argument-axis>
          <dxo-common-series-settings [cornerRadius]="4"></dxo-common-series-settings>
        </dx-chart>
      </div>

      <div class="card panel">
        <div class="panel-head">
          <h3>Status dos patrimônios</h3>
          <span class="panel-tag">total do parque</span>
        </div>
        <dx-pie-chart [dataSource]="byStatus()" type="doughnut" [palette]="palette"
          innerRadius="0.65">
          <dxi-series argumentField="status" valueField="count">
            <dxo-label [visible]="false"></dxo-label>
          </dxi-series>
          <dxo-legend [visible]="true" horizontalAlignment="center"
            verticalAlignment="bottom"></dxo-legend>
        </dx-pie-chart>
      </div>
    </div>

    <p class="note">
      Indicadores ilustrativos. A camada de métricas em tempo real (endpoints de
      agregação) está prevista no roadmap do backend.
    </p>
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
    .metric-delta {
      position: absolute; top: 16px; right: 16px;
      font-size: 12px; font-weight: 600; color: var(--success);
    }

    .charts { display: grid; grid-template-columns: 1.4fr 1fr; gap: 16px; }
    .panel { padding: 20px; }
    .panel-head {
      display: flex; align-items: baseline; justify-content: space-between;
      margin-bottom: 14px;
    }
    .panel-head h3 { font-size: 15px; }
    .panel-tag { font-size: 12px; color: var(--text-faint); }
    .panel dx-chart, .panel dx-pie-chart { height: 280px; }

    .note { margin-top: 18px; font-size: 12.5px; color: var(--text-faint); }

    @media (max-width: 900px) { .charts { grid-template-columns: 1fr; } }
  `],
})
export class DashboardComponent {
  palette = ['#14756a', '#36a89a', '#6fc4ba', '#c08a1e', '#c0432f', '#1a8f6f'];

  metrics = signal<Metric[]>([
    { label: 'Total de patrimônios', value: 1247, tone: 'teal',
      icon: 'M20 7 12 3 4 7m16 0-8 4m8-4v10l-8 4m0-10L4 7m8 4v10' },
    { label: 'Ativos em uso', value: 1089, delta: '+3,1%', tone: 'green',
      icon: 'M22 11.08V12a10 10 0 1 1-5.93-9.14M22 4 12 14.01l-3-3' },
    { label: 'Em manutenção', value: 42, tone: 'amber',
      icon: 'M14.7 6.3a4 4 0 0 0-5.4 5.4l-6 6 3 3 6-6a4 4 0 0 0 5.4-5.4l-2.8 2.8-2.1-2.1z' },
    { label: 'Extraviados', value: 7, tone: 'red',
      icon: 'M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01' },
    { label: 'Tags RFID ativas', value: 1180, tone: 'teal',
      icon: 'M4 9V6a2 2 0 0 1 2-2h3M4 15v3a2 2 0 0 0 2 2h3m6-16h3a2 2 0 0 1 2 2v3' },
    { label: 'Inventários no mês', value: 38, delta: '+12', tone: 'green',
      icon: 'M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 12l2 2 4-4' },
  ]);

  bySector = signal([
    { sector: 'TI', count: 320 }, { sector: 'Produção', count: 410 },
    { sector: 'Almoxarifado', count: 180 }, { sector: 'Administrativo', count: 140 },
    { sector: 'Expedição', count: 197 },
  ]);
  byStatus = signal([
    { status: 'Em uso', count: 1089 }, { status: 'Disponível', count: 100 },
    { status: 'Manutenção', count: 42 }, { status: 'Extraviado', count: 7 },
    { status: 'Baixado', count: 9 },
  ]);
}
