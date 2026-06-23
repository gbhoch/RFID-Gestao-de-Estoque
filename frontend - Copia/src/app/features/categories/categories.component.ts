import { Component } from '@angular/core';
import { DxDataGridModule } from 'devextreme-angular';
import { CrudPageComponent } from '../../shared/crud-page.component';

@Component({
  selector: 'app-categories',
  standalone: true,
  imports: [DxDataGridModule, CrudPageComponent],
  template: `
    <app-crud-page title="Categorias"
      subtitle="Classificação dos tipos de patrimônio."
      resource="categories" [popupHeight]="380">
      <ng-template #columns>
        <dxi-column dataField="name" caption="Nome"></dxi-column>
        <dxi-column dataField="description" caption="Descrição"></dxi-column>
        <dxi-column dataField="status" caption="Status" [width]="130"></dxi-column>
      </ng-template>
    </app-crud-page>
  `,
})
export class CategoriesComponent {}
