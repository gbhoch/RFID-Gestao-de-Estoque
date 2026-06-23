import { Component, inject, OnInit, signal } from '@angular/core';
import { DxDataGridModule } from 'devextreme-angular';
import { RestStoreFactory } from '../../shared/rest-store.factory';
import type CustomStore from 'devextreme/data/custom_store';

@Component({
  selector: 'app-movements',
  standalone: true,
  imports: [DxDataGridModule],
  template: `
    <h2>Movimentações</h2>
    <dx-data-grid [dataSource]="store()" [remoteOperations]="{ paging: true }"
      [showBorders]="true" [columnAutoWidth]="true" height="calc(100vh - 160px)">
      <dxo-paging [pageSize]="20"></dxo-paging>
      <dxo-pager [showPageSizeSelector]="true" [allowedPageSizes]="[10,20,50]"></dxo-pager>
      <!-- Registro de movimentação via POST (insert). Edição/exclusão são bloqueadas
           porque o histórico é imutável. -->
      <dxo-editing mode="popup" [allowAdding]="true" [allowUpdating]="false" [allowDeleting]="false">
        <dxo-popup title="Nova Movimentação" [width]="640" [height]="440"></dxo-popup>
      </dxo-editing>
      <dxi-column dataField="type" caption="Tipo">
        <dxo-lookup [dataSource]="types" valueExpr="value" displayExpr="text"></dxo-lookup>
      </dxi-column>
      <dxi-column dataField="assetId" caption="Patrimônio"></dxi-column>
      <dxi-column dataField="fromSectorId" caption="Setor Origem" [allowEditing]="false"></dxi-column>
      <dxi-column dataField="toSectorId" caption="Setor Destino"></dxi-column>
      <dxi-column dataField="occurredAt" caption="Data/Hora" dataType="datetime" [allowEditing]="false"></dxi-column>
      <dxi-column dataField="notes" caption="Observação"></dxi-column>
    </dx-data-grid>
  `,
})
export class MovementsComponent implements OnInit {
  private factory = inject(RestStoreFactory);
  store = signal<CustomStore | null>(null);
  types = [
    { value: 'sector_transfer', text: 'Transferência de Setor' },
    { value: 'owner_change', text: 'Troca de Responsável' },
    { value: 'loan', text: 'Empréstimo' },
    { value: 'write_off', text: 'Baixa Patrimonial' },
    { value: 'maintenance_return', text: 'Retorno de Manutenção' },
  ];
  ngOnInit() { this.store.set(this.factory.create('movements')); }
}
