import { Component } from '@angular/core';
import { DxDataGridModule } from 'devextreme-angular';
import { CrudPageComponent } from '../../shared/crud-page.component';

@Component({
  selector: 'app-assets',
  standalone: true,
  imports: [DxDataGridModule, CrudPageComponent],
  template: `
    <app-crud-page title="Patrimônios"
      subtitle="Ativos da planta com associação a etiquetas RFID."
      resource="assets" [popupHeight]="560">
      <ng-template #columns>
        <dxi-column dataField="assetCode" caption="Código" [width]="120"></dxi-column>
        <dxi-column dataField="name" caption="Nome"></dxi-column>
        <dxi-column dataField="brand" caption="Marca"></dxi-column>
        <dxi-column dataField="model" caption="Modelo"></dxi-column>
        <dxi-column dataField="serialNumber" caption="Nº de série"></dxi-column>
        <dxi-column dataField="status" caption="Status" cellTemplate="statusCell" [width]="140">
          <dxo-lookup [dataSource]="statuses" valueExpr="value" displayExpr="text"></dxo-lookup>
        </dxi-column>
        <dxi-column dataField="acquisitionValue" caption="Valor" dataType="number"
          format="R$ #,##0.00" [width]="130"></dxi-column>
        <dxi-column dataField="description" caption="Descrição" [visible]="false"></dxi-column>
        <dxi-column dataField="notes" caption="Observações" [visible]="false"></dxi-column>

        <div *dxTemplate="let cell of 'statusCell'">
          <span class="pill" [class]="pillClass(cell.value)">{{ label(cell.value) }}</span>
        </div>
      </ng-template>
    </app-crud-page>
  `,
})
export class AssetsComponent {
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
}
