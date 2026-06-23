import { Component } from '@angular/core';
import { DxDataGridModule } from 'devextreme-angular';
import { CrudPageComponent } from '../../shared/crud-page.component';

@Component({
  selector: 'app-users',
  standalone: true,
  imports: [DxDataGridModule, CrudPageComponent],
  template: `
    <app-crud-page title="Usuários"
      subtitle="Contas de acesso e seus perfis de permissão."
      resource="users" [popupHeight]="500">
      <ng-template #columns>
        <dxi-column dataField="name" caption="Nome"></dxi-column>
        <dxi-column dataField="login" caption="Login" [width]="140"></dxi-column>
        <dxi-column dataField="email" caption="E-mail"></dxi-column>
        <dxi-column dataField="position" caption="Cargo"></dxi-column>
        <dxi-column dataField="password" caption="Senha" [visible]="false"
          [formItem]="{ visible: true, editorOptions: { mode: 'password' } }"></dxi-column>
        <dxi-column dataField="status" caption="Status" [width]="120"></dxi-column>
      </ng-template>
    </app-crud-page>
  `,
})
export class UsersComponent {}
