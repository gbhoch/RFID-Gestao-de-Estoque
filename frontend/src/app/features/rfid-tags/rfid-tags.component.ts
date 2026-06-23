import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DxDataGridModule } from 'devextreme-angular';
import { RestStoreFactory } from '../../shared/rest-store.factory';
import { PageHeaderComponent } from '../../shared/page-header.component';

@Component({
  selector: 'app-rfid-tags',
  standalone: true,
  imports: [CommonModule, DxDataGridModule, PageHeaderComponent],
  template: `
    <app-page-header title="Etiquetas RFID"
      subtitle="Identificadores físicos passivos vinculados aos patrimônios."></app-page-header>

    <div class="card grid-card">
      <dx-data-grid [dataSource]="store" [remoteOperations]="{ paging: true }"
        [showBorders]="false" [columnAutoWidth]="true" [rowAlternationEnabled]="true"
        [hoverStateEnabled]="true" noDataText="Nenhuma etiqueta cadastrada." height="100%">

        <dxo-paging [pageSize]="15"></dxo-paging>
        <dxo-pager [visible]="true" [showPageSizeSelector]="true"
          [allowedPageSizes]="[15,30,60]" [showInfo]="true"></dxo-pager>
        <dxo-search-panel [visible]="true" [width]="260" placeholder="Buscar..."></dxo-search-panel>
        <dxo-editing mode="popup" [allowAdding]="true" [allowUpdating]="true"
          [allowDeleting]="true" [useIcons]="true">
          <dxo-popup title="Etiqueta RFID" [showTitle]="true" [width]="640" [height]="500"></dxo-popup>
          <dxo-form [colCount]="2">
            <dxi-item dataField="epc" [colSpan]="2"></dxi-item>
            <dxi-item dataField="rfidCode"></dxi-item>
            <dxi-item dataField="serialNumber"></dxi-item>
            <dxi-item dataField="manufacturer"></dxi-item>
            <dxi-item dataField="status"></dxi-item>
            <dxi-item dataField="notes" editorType="dxTextArea" [colSpan]="2"></dxi-item>
          </dxo-form>
        </dxo-editing>

        <dxi-column dataField="epc" caption="EPC">
          <dxi-validation-rule type="required"></dxi-validation-rule>
        </dxi-column>
        <dxi-column dataField="rfidCode" caption="Código RFID"></dxi-column>
        <dxi-column dataField="serialNumber" caption="Nº de série"></dxi-column>
        <dxi-column dataField="manufacturer" caption="Fabricante"></dxi-column>
        <dxi-column dataField="status" caption="Status" cellTemplate="statusCell" [width]="150">
          <dxo-lookup [dataSource]="statuses" valueExpr="value" displayExpr="text"></dxo-lookup>
          <dxi-validation-rule type="required"></dxi-validation-rule>
        </dxi-column>
        <dxi-column dataField="notes" [visible]="false"></dxi-column>

        <div *dxTemplate="let cell of 'statusCell'">
          <span class="pill" [class]="pillClass(cell.value)">{{ label(cell.value) }}</span>
        </div>
      </dx-data-grid>
    </div>
  `,
  styles: [`.grid-card { padding: 8px; height: calc(100vh - var(--topbar-h) - 130px); min-height: 360px; }`],
})
export class RfidTagsComponent {
  private factory = inject(RestStoreFactory);
  store = this.factory.create('rfid-tags');

  statuses = [
    { value: 'active', text: 'Ativa' }, { value: 'inactive', text: 'Inativa' },
    { value: 'in_use', text: 'Em uso' }, { value: 'damaged', text: 'Danificada' },
    { value: 'lost', text: 'Perdida' }, { value: 'retired', text: 'Desuso' },
    { value: 'blocked', text: 'Bloqueada' },
  ];
  label = (v) => this.statuses.find((s) => s.value === v)?.text ?? v;
  pillClass(v) {
    if (['active', 'in_use'].includes(v)) return 'pill-success';
    if (['inactive', 'damaged'].includes(v)) return 'pill-warning';
    if (['lost', 'retired', 'blocked'].includes(v)) return 'pill-danger';
    return 'pill-neutral';
  }
}
