import { Component, signal } from '@angular/core';
import { DxChartModule, DxPieChartModule } from 'devextreme-angular';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [DxChartModule, DxPieChartModule],
  template: `
    <h2>Dashboard Executivo</h2>
    <div class="cards">
      @for (c of cards(); track c.label) {
        <div class="card">
          <span class="value">{{ c.value }}</span>
          <span class="label">{{ c.label }}</span>
        </div>
      }
    </div>

    <div class="charts">
      <div class="panel">
        <h3>Patrimônios por Setor</h3>
        <dx-chart [dataSource]="bySector()">
          <dxi-series valueField="count" argumentField="sector" type="bar"></dxi-series>
          <dxo-legend [visible]="false"></dxo-legend>
        </dx-chart>
      </div>
      <div class="panel">
        <h3>Status dos Patrimônios</h3>
        <dx-pie-chart [dataSource]="byStatus()" type="doughnut">
          <dxi-series argumentField="status" valueField="count"></dxi-series>
        </dx-pie-chart>
      </div>
    </div>
  `,
  styles: [`
    .cards { display:grid; grid-template-columns:repeat(auto-fit,minmax(180px,1fr));
      gap:16px; margin-bottom:24px; }
    .card { background:#faf9f8; border:1px solid #edebe9; border-radius:8px;
      padding:20px; display:flex; flex-direction:column; }
    .value { font-size:32px; font-weight:700; color:#0078d4; }
    .label { font-size:13px; color:#605e5c; margin-top:4px; }
    .charts { display:grid; grid-template-columns:1fr 1fr; gap:16px; }
    .panel { border:1px solid #edebe9; border-radius:8px; padding:16px; }
    .panel h3 { font-size:14px; margin:0 0 12px; }
  `],
})
export class DashboardComponent {
  // Em produção esses signals são alimentados por chamadas à API de métricas.
  cards = signal([
    { label: 'Total de patrimônios', value: 1247 },
    { label: 'Ativos', value: 1089 },
    { label: 'Em manutenção', value: 42 },
    { label: 'Extraviados', value: 7 },
    { label: 'Tags RFID ativas', value: 1180 },
    { label: 'Inventários realizados', value: 38 },
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
