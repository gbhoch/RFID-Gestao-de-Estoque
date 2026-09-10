import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DxDataGridModule } from 'devextreme-angular';
import { RestStoreFactory } from '../../shared/rest-store.factory';
import { LookupService } from '../../shared/lookup.service';
import { PageHeaderComponent } from '../../shared/page-header.component';

@Component({
  selector: 'app-sectors',
  standalone: true,
  imports: [CommonModule, DxDataGridModule, PageHeaderComponent],
  template: `
    <app-page-header title="Setores"
      subtitle="Áreas da planta para localização e transferência de ativos."></app-page-header>

    <div class="card grid-card">
      <dx-data-grid [dataSource]="store" [remoteOperations]="{ paging: true }"
        [showBorders]="false" [columnAutoWidth]="true" [rowAlternationEnabled]="true"
        [hoverStateEnabled]="true" noDataText="Nenhum setor cadastrado." height="100%">

        <dxo-paging [pageSize]="15"></dxo-paging>
        <dxo-pager [visible]="true" [showPageSizeSelector]="true"
          [allowedPageSizes]="[15,30,60]" [showInfo]="true"></dxo-pager>
        <dxo-search-panel [visible]="true" [width]="260" placeholder="Buscar..."></dxo-search-panel>
        <dxo-editing mode="popup" [allowAdding]="true" [allowUpdating]="true"
          [allowDeleting]="true" [useIcons]="true">
          <dxo-popup title="Setor" [showTitle]="true" [width]="560" [height]="440"></dxo-popup>
          <dxo-form [colCount]="2">
            <dxi-item dataField="name" [colSpan]="2"></dxi-item>
            <dxi-item dataField="acronym"></dxi-item>
            <dxi-item dataField="status"></dxi-item>
            <dxi-item dataField="managerId" [colSpan]="2"></dxi-item>
            <dxi-item dataField="location" [colSpan]="2"></dxi-item>
          </dxo-form>
        </dxo-editing>

        <dxi-column dataField="name" caption="Nome">
          <dxi-validation-rule type="required"></dxi-validation-rule>
        </dxi-column>
        <dxi-column dataField="acronym" caption="Sigla" [width]="120"></dxi-column>
        <dxi-column dataField="managerId" caption="Responsável" [visible]="false">
          <dxo-lookup [dataSource]="users" valueExpr="id" displayExpr="name"></dxo-lookup>
        </dxi-column>
        <dxi-column dataField="location" caption="Localização"></dxi-column>
        <dxi-column dataField="status" caption="Status" cellTemplate="statusCell" [width]="130">
          <dxo-lookup [dataSource]="statuses" valueExpr="value" displayExpr="text"></dxo-lookup>
        </dxi-column>

        <div *dxTemplate="let cell of 'statusCell'">
          <span class="pill" [class]="cell.value === 'active' ? 'pill-success' : 'pill-neutral'">
            {{ label(cell.value) }}</span>
        </div>
      </dx-data-grid>
    </div>
  `,
  styles: [`.grid-card { padding: 8px; height: calc(100vh - var(--topbar-h) - 130px); min-height: 360px; }`],
})
export class SectorsComponent {
  private factory = inject(RestStoreFactory);
  private lookup = inject(LookupService);
  store = this.factory.create('sectors');
  users = this.lookup.users();
  statuses = [
    { value: 'active', text: 'Ativo' },
    { value: 'inactive', text: 'Inativo' },
    { value: 'blocked', text: 'Bloqueado' },
  ];
  label = (v) => this.statuses.find((s) => s.value === v)?.text ?? v;
}
