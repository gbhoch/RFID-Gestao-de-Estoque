import { Component, inject, OnInit, signal } from '@angular/core';
import { DxDataGridModule } from 'devextreme-angular';
import { RestStoreFactory } from '../../shared/rest-store.factory';
import type CustomStore from 'devextreme/data/custom_store';

@Component({
  selector: 'app-users',
  standalone: true,
  imports: [DxDataGridModule],
  template: `
    <h2>Usuários</h2>
    <dx-data-grid [dataSource]="store()" [remoteOperations]="{ paging: true }"
      [showBorders]="true" [columnAutoWidth]="true" height="calc(100vh - 160px)">
      <dxo-paging [pageSize]="20"></dxo-paging>
      <dxo-search-panel [visible]="true"></dxo-search-panel>
      <dxo-editing mode="popup" [allowAdding]="true" [allowUpdating]="true" [allowDeleting]="true">
        <dxo-popup title="Usuário" [width]="640" [height]="480"></dxo-popup>
      </dxo-editing>
      <dxi-column dataField="name" caption="Nome"></dxi-column>
      <dxi-column dataField="login" caption="Login"></dxi-column>
      <dxi-column dataField="email" caption="E-mail"></dxi-column>
      <dxi-column dataField="position" caption="Cargo"></dxi-column>
      <dxi-column dataField="password" caption="Senha" [visible]="false"
        [formItem]="{ visible: true, editorOptions: { mode: 'password' } }"></dxi-column>
      <dxi-column dataField="status" caption="Status"></dxi-column>
    </dx-data-grid>
  `,
})
export class UsersComponent implements OnInit {
  private factory = inject(RestStoreFactory);
  store = signal<CustomStore | null>(null);
  ngOnInit() { this.store.set(this.factory.create('users')); }
}
