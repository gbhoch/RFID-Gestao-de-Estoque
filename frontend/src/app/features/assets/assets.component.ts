import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DxDataGridModule } from 'devextreme-angular';
import { RestStoreFactory } from '../../shared/rest-store.factory';
import { LookupService } from '../../shared/lookup.service';
import { PageHeaderComponent } from '../../shared/page-header.component';

@Component({
  selector: 'app-assets',
  standalone: true,
  imports: [CommonModule, DxDataGridModule, PageHeaderComponent],
  template: `
    <app-page-header title="Patrimônios"
      subtitle="Ativos da planta com associação a etiquetas RFID."></app-page-header>

    <div class="card grid-card">
      <dx-data-grid [dataSource]="store" [remoteOperations]="{ paging: true }"
        [showBorders]="false" [columnAutoWidth]="true" [rowAlternationEnabled]="true"
        [hoverStateEnabled]="true" noDataText="Nenhum patrimônio cadastrado." height="100%">

        <dxo-paging [pageSize]="15"></dxo-paging>
        <dxo-pager [visible]="true" [showPageSizeSelector]="true"
          [allowedPageSizes]="[15,30,60]" [showInfo]="true"></dxo-pager>
        <dxo-search-panel [visible]="true" [width]="260" placeholder="Buscar..."></dxo-search-panel>
        <dxo-editing mode="popup" [allowAdding]="true" [allowUpdating]="true"
          [allowDeleting]="true" [useIcons]="true">
          <dxo-popup title="Patrimônio" [showTitle]="true" [width]="760" [height]="600"></dxo-popup>
          <dxo-form [colCount]="2">
            <dxi-item itemType="group" caption="Identificação" [colCount]="2" [colSpan]="2">
              <dxi-item dataField="assetCode"></dxi-item>
              <dxi-item dataField="name"></dxi-item>
              <dxi-item dataField="categoryId"></dxi-item>
              <dxi-item dataField="status"></dxi-item>
            </dxi-item>
            <dxi-item itemType="group" caption="Características" [colCount]="2" [colSpan]="2">
              <dxi-item dataField="brand"></dxi-item>
              <dxi-item dataField="model"></dxi-item>
              <dxi-item dataField="serialNumber"></dxi-item>
              <dxi-item dataField="acquisitionValue"></dxi-item>
            </dxi-item>
            <dxi-item itemType="group" caption="Alocação" [colCount]="2" [colSpan]="2">
              <dxi-item dataField="sectorId"></dxi-item>
              <dxi-item dataField="ownerId"></dxi-item>
              <dxi-item dataField="rfidTagId"></dxi-item>
            </dxi-item>
            <dxi-item dataField="notes" editorType="dxTextArea" [colSpan]="2">
              <dxo-label text="Observação"></dxo-label>
            </dxi-item>
          </dxo-form>
        </dxo-editing>

        <dxi-column dataField="assetCode" caption="Código" [width]="120">
          <dxi-validation-rule type="required"></dxi-validation-rule>
        </dxi-column>
        <dxi-column dataField="name" caption="Nome">
          <dxi-validation-rule type="required"></dxi-validation-rule>
        </dxi-column>
        <dxi-column dataField="categoryId" caption="Categoria">
          <dxo-lookup [dataSource]="categories" valueExpr="id" displayExpr="name"></dxo-lookup>
          <dxi-validation-rule type="required"></dxi-validation-rule>
        </dxi-column>
        <dxi-column dataField="brand" caption="Marca"></dxi-column>
        <dxi-column dataField="model" caption="Modelo"></dxi-column>
        <dxi-column dataField="serialNumber" caption="Nº de série"></dxi-column>
        <dxi-column dataField="sectorId" caption="Setor">
          <dxo-lookup [dataSource]="sectors" valueExpr="id" displayExpr="name"></dxo-lookup>
        </dxi-column>
        <dxi-column dataField="ownerId" caption="Responsável" [visible]="false">
          <dxo-lookup [dataSource]="users" valueExpr="id" displayExpr="name"></dxo-lookup>
        </dxi-column>
        <dxi-column dataField="rfidTagId" caption="Etiqueta RFID" [visible]="false">
          <dxo-lookup [dataSource]="tags" valueExpr="id" displayExpr="epc"></dxo-lookup>
        </dxi-column>
        <dxi-column dataField="status" caption="Status" cellTemplate="statusCell" [width]="150">
          <dxo-lookup [dataSource]="statuses" valueExpr="value" displayExpr="text"></dxo-lookup>
        </dxi-column>
        <dxi-column dataField="acquisitionValue" caption="Valor" dataType="number"
          format="R$ #,##0.00" [width]="130"></dxi-column>
        <dxi-column dataField="notes" caption="Observação" [visible]="false"></dxi-column>

        <div *dxTemplate="let cell of 'statusCell'">
          <span class="pill" [class]="pillClass(cell.value)">{{ label(cell.value) }}</span>
        </div>
      </dx-data-grid>
    </div>
  `,
  styles: [`.grid-card { padding: 8px; height: calc(100vh - var(--topbar-h) - 130px); min-height: 360px; }`],
})
export class AssetsComponent {
  private factory = inject(RestStoreFactory);
  private lookup = inject(LookupService);

  store = this.factory.create('assets');
  categories = this.lookup.categories();
  sectors = this.lookup.sectors();
  users = this.lookup.users();
  tags = this.lookup.rfidTags();

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
