import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DxDataGridModule } from 'devextreme-angular';
import { RestStoreFactory } from '../../shared/rest-store.factory';
import { LookupService } from '../../shared/lookup.service';
import { PageHeaderComponent } from '../../shared/page-header.component';

@Component({
  selector: 'app-movements',
  standalone: true,
  imports: [CommonModule, DxDataGridModule, PageHeaderComponent],
  template: `
    <app-page-header title="Movimentações"
      subtitle="Transferências, baixas e empréstimos. O histórico é imutável."></app-page-header>

    <div class="card grid-card">
      <dx-data-grid [dataSource]="store" [remoteOperations]="{ paging: true }"
        [showBorders]="false" [columnAutoWidth]="true" [rowAlternationEnabled]="true"
        [hoverStateEnabled]="true" noDataText="Nenhuma movimentação registrada." height="100%">

        <dxo-paging [pageSize]="15"></dxo-paging>
        <dxo-pager [visible]="true" [showPageSizeSelector]="true"
          [allowedPageSizes]="[15,30,60]" [showInfo]="true"></dxo-pager>
        <dxo-search-panel [visible]="true" [width]="260" placeholder="Buscar..."></dxo-search-panel>
        <dxo-editing mode="popup" [allowAdding]="true" [allowUpdating]="false"
          [allowDeleting]="false" [useIcons]="true">
          <dxo-popup title="Nova movimentação" [showTitle]="true" [width]="600" [height]="480"></dxo-popup>
          <dxo-form [colCount]="1">
            <dxi-item dataField="assetId"></dxi-item>
            <dxi-item dataField="type"></dxi-item>
            <dxi-item dataField="toSectorId"></dxi-item>
            <dxi-item dataField="toOwnerId"></dxi-item>
            <dxi-item dataField="notes" editorType="dxTextArea"></dxi-item>
          </dxo-form>
        </dxo-editing>

        <dxi-column dataField="type" caption="Tipo" cellTemplate="typeCell" [width]="190">
          <dxo-lookup [dataSource]="types" valueExpr="value" displayExpr="text"></dxo-lookup>
          <dxi-validation-rule type="required"></dxi-validation-rule>
        </dxi-column>
        <dxi-column dataField="assetId" caption="Patrimônio">
          <dxo-lookup [dataSource]="assets" valueExpr="id" displayExpr="name"></dxo-lookup>
          <dxi-validation-rule type="required"></dxi-validation-rule>
        </dxi-column>
        <dxi-column dataField="fromSectorId" caption="Origem" [allowEditing]="false">
          <dxo-lookup [dataSource]="sectors" valueExpr="id" displayExpr="name"></dxo-lookup>
        </dxi-column>
        <dxi-column dataField="toSectorId" caption="Destino">
          <dxo-lookup [dataSource]="sectors" valueExpr="id" displayExpr="name"></dxo-lookup>
        </dxi-column>
        <dxi-column dataField="toOwnerId" caption="Novo responsável" [visible]="false">
          <dxo-lookup [dataSource]="users" valueExpr="id" displayExpr="name"></dxo-lookup>
        </dxi-column>
        <dxi-column dataField="occurredAt" caption="Data/hora" dataType="datetime"
          [allowEditing]="false" [width]="160"></dxi-column>
        <dxi-column dataField="notes" caption="Observação"></dxi-column>

        <div *dxTemplate="let cell of 'typeCell'">
          <span class="pill pill-info">{{ label(cell.value) }}</span>
        </div>
      </dx-data-grid>
    </div>
  `,
  styles: [`.grid-card { padding: 8px; height: calc(100vh - var(--topbar-h) - 130px); min-height: 360px; }`],
})
export class MovementsComponent {
  private factory = inject(RestStoreFactory);
  private lookup = inject(LookupService);
  store = this.factory.create('movements');
  assets = this.lookup.assets();
  sectors = this.lookup.sectors();
  users = this.lookup.users();
  types = [
    { value: 'sector_transfer', text: 'Transferência' },
    { value: 'owner_change', text: 'Troca de responsável' },
    { value: 'loan', text: 'Empréstimo' },
    { value: 'write_off', text: 'Baixa' },
    { value: 'maintenance_return', text: 'Retorno de manutenção' },
  ];
  label = (v) => this.types.find((t) => t.value === v)?.text ?? v;
}
