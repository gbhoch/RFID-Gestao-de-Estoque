import { Component } from '@angular/core';
import { DxDataGridModule } from 'devextreme-angular';
import { CrudPageComponent } from '../../shared/crud-page.component';

@Component({
  selector: 'app-movements',
  standalone: true,
  imports: [DxDataGridModule, CrudPageComponent],
  template: `
    <app-crud-page title="Movimentações"
      subtitle="Transferências, baixas e empréstimos. O histórico é imutável."
      resource="movements" [allowUpdating]="false" [allowDeleting]="false"
      [popupHeight]="460">
      <ng-template #columns>
        <dxi-column dataField="type" caption="Tipo" cellTemplate="typeCell" [width]="180">
          <dxo-lookup [dataSource]="types" valueExpr="value" displayExpr="text"></dxo-lookup>
        </dxi-column>
        <dxi-column dataField="assetId" caption="Patrimônio"></dxi-column>
        <dxi-column dataField="fromSectorId" caption="Origem" [allowEditing]="false"></dxi-column>
        <dxi-column dataField="toSectorId" caption="Destino"></dxi-column>
        <dxi-column dataField="occurredAt" caption="Data/hora" dataType="datetime"
          [allowEditing]="false" [width]="160"></dxi-column>
        <dxi-column dataField="notes" caption="Observação"></dxi-column>

        <div *dxTemplate="let cell of 'typeCell'">
          <span class="pill pill-info">{{ label(cell.value) }}</span>
        </div>
      </ng-template>
    </app-crud-page>
  `,
})
export class MovementsComponent {
  types = [
    { value: 'sector_transfer', text: 'Transferência' },
    { value: 'owner_change', text: 'Troca de responsável' },
    { value: 'loan', text: 'Empréstimo' },
    { value: 'write_off', text: 'Baixa' },
    { value: 'maintenance_return', text: 'Retorno de manutenção' },
  ];
  label = (v: string) => this.types.find((t) => t.value === v)?.text ?? v;
}
