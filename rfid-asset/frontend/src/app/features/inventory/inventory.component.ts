import { Component, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { DxButtonModule, DxDataGridModule } from 'devextreme-angular';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-inventory',
  standalone: true,
  imports: [FormsModule, DxButtonModule, DxDataGridModule],
  template: `
    <h2>Inventário RFID</h2>

    @if (!session()) {
      <div class="panel">
        <label>Setor a inventariar</label>
        <input [(ngModel)]="sectorId" placeholder="UUID do setor" />
        <dx-button text="Iniciar inventário" type="default"
          [disabled]="!sectorId" (onClick)="start()"></dx-button>
      </div>
    } @else {
      <div class="status">
        <span>Sessão: <b>{{ session().id }}</b></span>
        <span>Status: <b>{{ session().status }}</b></span>
        <span>Esperados: <b>{{ session().expectedCount }}</b></span>
        <span>Lidos: <b>{{ reads().length }}</b></span>
      </div>

      <div class="panel">
        <input [(ngModel)]="epcInput" placeholder="EPC lido pelo handheld"
          (keyup.enter)="addRead()" />
        <dx-button text="Registrar leitura" (onClick)="addRead()"></dx-button>
        <dx-button text="Simular lote (5)" stylingMode="outlined"
          (onClick)="simulateBatch()"></dx-button>
        <dx-button text="Finalizar" type="success"
          (onClick)="finish()"></dx-button>
      </div>

      <dx-data-grid [dataSource]="reads()" [showBorders]="true" height="300">
        <dxi-column dataField="epc" caption="EPC"></dxi-column>
        <dxi-column dataField="rssi" caption="RSSI"></dxi-column>
        <dxi-column dataField="readAt" caption="Lido em" dataType="datetime"></dxi-column>
      </dx-data-grid>

      @if (result()) {
        <div class="result">
          <h3>Resultado do Inventário</h3>
          <div class="indicators">
            <div class="ind"><span>{{ result().indicators.accuracyRate }}%</span><small>Acuracidade</small></div>
            <div class="ind"><span>{{ result().foundCount }}</span><small>Encontrados</small></div>
            <div class="ind"><span>{{ result().indicators.notFound }}</span><small>Não encontrados</small></div>
            <div class="ind"><span>{{ result().indicators.foundOutsideSector }}</span><small>Fora do setor</small></div>
          </div>
        </div>
      }
    }
  `,
  styles: [`
    .panel { display:flex; gap:12px; align-items:center; margin:16px 0; }
    input { padding:8px 12px; border:1px solid #c8c6c4; border-radius:4px; min-width:280px; }
    label { font-size:13px; color:#605e5c; margin-right:8px; }
    .status { display:flex; gap:24px; margin:12px 0; font-size:14px;
      background:#faf9f8; padding:12px 16px; border-radius:6px; }
    .result { margin-top:24px; }
    .indicators { display:flex; gap:16px; }
    .ind { background:#eff6fc; border:1px solid #c7e0f4; border-radius:8px;
      padding:16px 24px; text-align:center; min-width:120px; }
    .ind span { display:block; font-size:28px; font-weight:700; color:#0078d4; }
    .ind small { color:#605e5c; }
  `],
})
export class InventoryComponent {
  private http = inject(HttpClient);
  private api = environment.apiUrl;

  sectorId = '';
  epcInput = '';
  session = signal<any>(null);
  reads = signal<any[]>([]);
  result = signal<any>(null);

  async start() {
    const s = await firstValueFrom(
      this.http.post(`${this.api}/inventory/start`, { sectorId: this.sectorId }),
    );
    this.session.set(s);
    this.reads.set([]);
    this.result.set(null);
  }

  async addRead() {
    if (!this.epcInput) return;
    await this.pushReads([{ epc: this.epcInput, rssi: -55 }]);
    this.epcInput = '';
  }

  async simulateBatch() {
    const batch = Array.from({ length: 5 }, (_, i) => ({
      epc: `EPC-${Date.now()}-${i}`, rssi: -40 - i,
    }));
    await this.pushReads(batch);
  }

  private async pushReads(items: { epc: string; rssi: number }[]) {
    await firstValueFrom(
      this.http.post(`${this.api}/inventory/${this.session().id}/reads`, { reads: items }),
    );
    this.reads.update((r) => [
      ...r,
      ...items.map((i) => ({ ...i, readAt: new Date() })),
    ]);
  }

  async finish() {
    const res = await firstValueFrom(
      this.http.post(`${this.api}/inventory/${this.session().id}/finish`, {}),
    );
    this.result.set(res);
    this.session.update((s: any) => ({ ...s, status: 'finished' }));
  }
}
