import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DxDataGridModule } from 'devextreme-angular';
import { RestStoreFactory } from '../../shared/rest-store.factory';
import { LookupService } from '../../shared/lookup.service';
import { PageHeaderComponent } from '../../shared/page-header.component';

@Component({
  selector: 'app-users',
  standalone: true,
  imports: [CommonModule, DxDataGridModule, PageHeaderComponent],
  template: `
    <app-page-header title="Usuários"
      subtitle="Contas de acesso e seus perfis de permissão."></app-page-header>

    <div class="card grid-card">
      <dx-data-grid [dataSource]="store" [remoteOperations]="{ paging: true }"
        [showBorders]="false" [columnAutoWidth]="true" [rowAlternationEnabled]="true"
        [hoverStateEnabled]="true" noDataText="Nenhum usuário cadastrado." height="100%">

        <dxo-paging [pageSize]="15"></dxo-paging>
        <dxo-pager [visible]="true" [showPageSizeSelector]="true"
          [allowedPageSizes]="[15,30,60]" [showInfo]="true"></dxo-pager>
        <dxo-search-panel [visible]="true" [width]="260" placeholder="Buscar..."></dxo-search-panel>
        <dxo-editing mode="popup" [allowAdding]="true" [allowUpdating]="true"
          [allowDeleting]="true" [useIcons]="true">
          <dxo-popup title="Usuário" [showTitle]="true" [width]="680" [height]="560"></dxo-popup>
          <dxo-form [colCount]="2">
            <dxi-item dataField="name" [colSpan]="2"></dxi-item>
            <dxi-item dataField="login"></dxi-item>
            <dxi-item dataField="email"></dxi-item>
            <dxi-item dataField="password" [editorOptions]="{ mode: 'password' }"></dxi-item>
            <dxi-item dataField="roleId"></dxi-item>
            <dxi-item dataField="position"></dxi-item>
            <dxi-item dataField="phone"></dxi-item>
            <dxi-item dataField="sectorId" [colSpan]="2"></dxi-item>
          </dxo-form>
        </dxo-editing>

        <dxi-column dataField="name" caption="Nome">
          <dxi-validation-rule type="required"></dxi-validation-rule>
        </dxi-column>
        <dxi-column dataField="login" caption="Login" [width]="140">
          <dxi-validation-rule type="required"></dxi-validation-rule>
        </dxi-column>
        <!-- E-mail opcional: nem todo operador de galpão tem um. A regra de
             formato continua, mas só age quando o campo é preenchido. -->
        <dxi-column dataField="email" caption="E-mail">
          <dxi-validation-rule type="email"></dxi-validation-rule>
        </dxi-column>
        <dxi-column dataField="password" caption="Senha" [visible]="false"></dxi-column>
        <!-- Perfil visível no grid: é o dado que define o que a pessoa pode fazer. -->
        <dxi-column dataField="roleId" caption="Perfil" [width]="140">
          <dxi-validation-rule type="required"></dxi-validation-rule>
          <dxo-lookup [dataSource]="roles" valueExpr="id" displayExpr="name"></dxo-lookup>
        </dxi-column>
        <dxi-column dataField="position" caption="Cargo"></dxi-column>
        <dxi-column dataField="phone" caption="Telefone" [visible]="false"></dxi-column>
        <dxi-column dataField="sectorId" caption="Setor" [visible]="false">
          <dxo-lookup [dataSource]="sectors" valueExpr="id" displayExpr="name"></dxo-lookup>
        </dxi-column>
        <dxi-column dataField="status" caption="Status" cellTemplate="statusCell" [width]="120">
          <dxo-lookup [dataSource]="statuses" valueExpr="value" displayExpr="text"></dxo-lookup>
        </dxi-column>

        <div *dxTemplate="let cell of 'statusCell'">
          <span class="pill" [class]="cell.value === 'active' ? 'pill-success' : (cell.value === 'blocked' ? 'pill-danger' : 'pill-neutral')">
            {{ label(cell.value) }}</span>
        </div>
      </dx-data-grid>
    </div>
  `,
  styles: [`.grid-card { padding: 8px; height: calc(100vh - var(--topbar-h) - 130px); min-height: 360px; }`],
})
export class UsersComponent {
  private factory = inject(RestStoreFactory);
  private lookup = inject(LookupService);
  store = this.factory.create('users');
  sectors = this.lookup.sectors();
  roles = this.lookup.roles();
  statuses = [
    { value: 'active', text: 'Ativo' },
    { value: 'blocked', text: 'Bloqueado' },
    { value: 'inactive', text: 'Inativo' },
  ];
  label = (v) => this.statuses.find((s) => s.value === v)?.text ?? v;
}
