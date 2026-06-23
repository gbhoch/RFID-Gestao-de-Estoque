import { Component } from '@angular/core';
import { DxDataGridModule } from 'devextreme-angular';
import { CrudPageComponent } from '../../shared/crud-page.component';

@Component({
  selector: 'app-sectors',
  standalone: true,
  imports: [DxDataGridModule, CrudPageComponent],
  template: `
    <app-crud-page title="Setores"
      subtitle="Áreas da planta para localização e transferência de ativos."
      resource="sectors" [popupHeight]="420">
      <ng-template #columns>
        <dxi-column dataField="name" caption="Nome"></dxi-column>
        <dxi-column dataField="acronym" caption="Sigla" [width]="120"></dxi-column>
        <dxi-column dataField="location" caption="Localização"></dxi-column>
        <dxi-column dataField="status" caption="Status" [width]="130"></dxi-column>
      </ng-template>
    </app-crud-page>
  `,
})
export class SectorsComponent {}
