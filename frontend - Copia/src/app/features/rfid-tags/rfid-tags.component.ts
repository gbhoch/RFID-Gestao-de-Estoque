import { Component } from '@angular/core';
import { DxDataGridModule } from 'devextreme-angular';
import { CrudPageComponent } from '../../shared/crud-page.component';

@Component({
  selector: 'app-rfid-tags',
  standalone: true,
  imports: [DxDataGridModule, CrudPageComponent],
  template: `
    <app-crud-page title="Etiquetas RFID"
      subtitle="Identificadores físicos passivos vinculados aos patrimônios."
      resource="rfid-tags" [popupHeight]="460">
      <ng-template #columns>
        <dxi-column dataField="epc" caption="EPC"></dxi-column>
        <dxi-column dataField="rfidCode" caption="Código RFID"></dxi-column>
        <dxi-column dataField="serialNumber" caption="Nº de série"></dxi-column>
        <dxi-column dataField="manufacturer" caption="Fabricante"></dxi-column>
        <dxi-column dataField="status" caption="Status" cellTemplate="statusCell" [width]="140">
          <dxo-lookup [dataSource]="statuses" valueExpr="value" displayExpr="text"></dxo-lookup>
        </dxi-column>
        <div *dxTemplate="let cell of 'statusCell'">
          <span class="pill" [class]="pillClass(cell.value)">{{ label(cell.value) }}</span>
        </div>
      </ng-template>
    </app-crud-page>
  `,
})
export class RfidTagsComponent {
  statuses = [
    { value: 'active', text: 'Ativa' }, { value: 'inactive', text: 'Inativa' },
    { value: 'in_use', text: 'Em uso' }, { value: 'damaged', text: 'Danificada' },
    { value: 'lost', text: 'Perdida' }, { value: 'retired', text: 'Desuso' },
    { value: 'blocked', text: 'Bloqueada' },
  ];
  label = (v: string) => this.statuses.find((s) => s.value === v)?.text ?? v;
  pillClass(v: string) {
    if (['active', 'in_use'].includes(v)) return 'pill-success';
    if (['inactive', 'damaged'].includes(v)) return 'pill-warning';
    if (['lost', 'retired', 'blocked'].includes(v)) return 'pill-danger';
    return 'pill-neutral';
  }
}
