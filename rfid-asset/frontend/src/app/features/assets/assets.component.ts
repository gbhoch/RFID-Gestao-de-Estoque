import { Component, inject, OnInit, signal } from '@angular/core';
import { DxDataGridModule } from 'devextreme-angular';
import { AssetsDataService } from './assets.data';
import type CustomStore from 'devextreme/data/custom_store';

@Component({
  selector: 'app-assets',
  standalone: true,
  imports: [DxDataGridModule],
  template: `
    <h2>Patrimônios</h2>
    <dx-data-grid
      [dataSource]="store()"
      [remoteOperations]="{ paging: true }"
      [showBorders]="true"
      [columnAutoWidth]="true"
      [rowAlternationEnabled]="true"
      height="calc(100vh - 160px)">

      <dxo-paging [pageSize]="20"></dxo-paging>
      <dxo-pager [showPageSizeSelector]="true" [allowedPageSizes]="[10,20,50]"
        [showInfo]="true"></dxo-pager>
      <dxo-search-panel [visible]="true" placeholder="Buscar..."></dxo-search-panel>
      <dxo-header-filter [visible]="true"></dxo-header-filter>
      <dxo-editing mode="popup" [allowAdding]="true" [allowUpdating]="true"
        [allowDeleting]="true">
        <dxo-popup title="Patrimônio" [showTitle]="true" [width]="700" [height]="520"></dxo-popup>
        <dxo-form [colCount]="2"></dxo-form>
      </dxo-editing>

      <dxi-column dataField="assetCode" caption="Código" [width]="120"></dxi-column>
      <dxi-column dataField="name" caption="Nome"></dxi-column>
      <dxi-column dataField="brand" caption="Marca"></dxi-column>
      <dxi-column dataField="model" caption="Modelo"></dxi-column>
      <dxi-column dataField="serialNumber" caption="Nº Série"></dxi-column>
      <dxi-column dataField="status" caption="Status">
        <dxo-lookup [dataSource]="statuses" valueExpr="value" displayExpr="text"></dxo-lookup>
      </dxi-column>
      <dxi-column dataField="acquisitionValue" caption="Valor" dataType="number"
        format="currency"></dxi-column>
      <dxi-column dataField="notes" caption="Observações" [visible]="false"></dxi-column>
    </dx-data-grid>
  `,
})
export class AssetsComponent implements OnInit {
  private data = inject(AssetsDataService);
  store = signal<CustomStore | null>(null);

  statuses = [
    { value: 'available', text: 'Disponível' },
    { value: 'in_use', text: 'Em Uso' },
    { value: 'maintenance', text: 'Em Manutenção' },
    { value: 'reserved', text: 'Reservado' },
    { value: 'missing', text: 'Extraviado' },
    { value: 'loaned', text: 'Emprestado' },
    { value: 'written_off', text: 'Baixado' },
    { value: 'scrapped', text: 'Sucateado' },
  ];

  ngOnInit() {
    this.store.set(this.data.createStore());
  }
}
