import { Component, inject, OnInit, signal } from '@angular/core';
import { DxDataGridModule } from 'devextreme-angular';
import { RestStoreFactory } from '../../shared/rest-store.factory';
import type CustomStore from 'devextreme/data/custom_store';

@Component({
  selector: 'app-rfid-tags',
  standalone: true,
  imports: [DxDataGridModule],
  template: `
    <h2>Etiquetas RFID</h2>
    <dx-data-grid [dataSource]="store()" [remoteOperations]="{ paging: true }"
      [showBorders]="true" [columnAutoWidth]="true" height="calc(100vh - 160px)">
      <dxo-paging [pageSize]="20"></dxo-paging>
      <dxo-search-panel [visible]="true"></dxo-search-panel>
      <dxo-editing mode="popup" [allowAdding]="true" [allowUpdating]="true" [allowDeleting]="true">
        <dxo-popup title="Etiqueta RFID" [width]="640" [height]="440"></dxo-popup>
      </dxo-editing>
      <dxi-column dataField="epc" caption="EPC"></dxi-column>
      <dxi-column dataField="rfidCode" caption="Código RFID"></dxi-column>
      <dxi-column dataField="serialNumber" caption="Nº Série"></dxi-column>
      <dxi-column dataField="manufacturer" caption="Fabricante"></dxi-column>
      <dxi-column dataField="status" caption="Status">
        <dxo-lookup [dataSource]="statuses" valueExpr="value" displayExpr="text"></dxo-lookup>
      </dxi-column>
    </dx-data-grid>
  `,
})
export class RfidTagsComponent implements OnInit {
  private factory = inject(RestStoreFactory);
  store = signal<CustomStore | null>(null);
  statuses = [
    { value: 'active', text: 'Ativa' }, { value: 'inactive', text: 'Inativa' },
    { value: 'in_use', text: 'Em Uso' }, { value: 'damaged', text: 'Danificada' },
    { value: 'lost', text: 'Perdida' }, { value: 'retired', text: 'Desuso' },
    { value: 'blocked', text: 'Bloqueada' },
  ];
  ngOnInit() { this.store.set(this.factory.create('rfid-tags')); }
}
