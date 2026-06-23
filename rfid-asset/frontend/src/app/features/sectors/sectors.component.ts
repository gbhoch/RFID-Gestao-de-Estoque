import { Component, inject, OnInit, signal } from '@angular/core';
import { DxDataGridModule } from 'devextreme-angular';
import { RestStoreFactory } from '../../shared/rest-store.factory';
import type CustomStore from 'devextreme/data/custom_store';

@Component({
  selector: 'app-sectors',
  standalone: true,
  imports: [DxDataGridModule],
  template: `
    <h2>Setores</h2>
    <dx-data-grid [dataSource]="store()" [remoteOperations]="{ paging: true }"
      [showBorders]="true" [columnAutoWidth]="true" height="calc(100vh - 160px)">
      <dxo-paging [pageSize]="20"></dxo-paging>
      <dxo-pager [showPageSizeSelector]="true" [allowedPageSizes]="[10,20,50]"></dxo-pager>
      <dxo-editing mode="popup" [allowAdding]="true" [allowUpdating]="true" [allowDeleting]="true">
        <dxo-popup title="Setor" [width]="600" [height]="400"></dxo-popup>
      </dxo-editing>
      <dxi-column dataField="name" caption="Nome"></dxi-column>
      <dxi-column dataField="acronym" caption="Sigla"></dxi-column>
      <dxi-column dataField="location" caption="Localização"></dxi-column>
      <dxi-column dataField="status" caption="Status"></dxi-column>
    </dx-data-grid>
  `,
})
export class SectorsComponent implements OnInit {
  private factory = inject(RestStoreFactory);
  store = signal<CustomStore | null>(null);
  ngOnInit() { this.store.set(this.factory.create('sectors')); }
}
