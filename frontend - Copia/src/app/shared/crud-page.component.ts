import { Component, Input, ContentChild, TemplateRef, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DxDataGridModule } from 'devextreme-angular';
import { RestStoreFactory } from './rest-store.factory';
import type CustomStore from 'devextreme/data/custom_store';

/**
 * Página de listagem CRUD padronizada. Cada tela passa o título, o recurso
 * REST e projeta as colunas (<dxi-column>) via ng-content nomeado.
 */
@Component({
  selector: 'app-crud-page',
  standalone: true,
  imports: [CommonModule, DxDataGridModule],
  template: `
    <div class="head">
      <div>
        <h1 class="page-title">{{ title }}</h1>
        <p class="page-sub">{{ subtitle }}</p>
      </div>
    </div>

    <div class="card grid-card">
      <dx-data-grid
        [dataSource]="store()"
        [remoteOperations]="{ paging: true }"
        [showBorders]="false"
        [columnAutoWidth]="true"
        [rowAlternationEnabled]="true"
        [hoverStateEnabled]="true"
        [noDataText]="'Nenhum registro encontrado.'"
        height="100%">

        <dxo-load-panel [enabled]="true" [showPane]="false"></dxo-load-panel>
        <dxo-paging [pageSize]="15"></dxo-paging>
        <dxo-pager [visible]="true" [showPageSizeSelector]="true"
          [allowedPageSizes]="[15, 30, 60]" [showInfo]="true"
          [showNavigationButtons]="true"></dxo-pager>
        <dxo-search-panel [visible]="showSearch" [width]="260"
          placeholder="Buscar…"></dxo-search-panel>
        <dxo-header-filter [visible]="true"></dxo-header-filter>

        <dxo-editing [mode]="'popup'"
          [allowAdding]="allowAdding" [allowUpdating]="allowUpdating"
          [allowDeleting]="allowDeleting" [useIcons]="true">
          <dxo-popup [title]="title" [showTitle]="true"
            [width]="popupWidth" [height]="popupHeight"></dxo-popup>
          <dxo-form [colCount]="2"></dxo-form>
        </dxo-editing>

        <ng-container *ngTemplateOutlet="columns"></ng-container>
      </dx-data-grid>
    </div>
  `,
  styles: [`
    .head { display: flex; align-items: flex-start; justify-content: space-between; }
    .grid-card { padding: 8px; height: calc(100vh - var(--topbar-h) - 130px); min-height: 360px; }
    :host ::ng-deep .dx-datagrid-search-panel { margin-left: 0; }
    :host ::ng-deep .dx-toolbar { padding: 6px 8px 10px; }
  `],
})
export class CrudPageComponent implements OnInit {
  private factory = inject(RestStoreFactory);

  @Input({ required: true }) title = '';
  @Input() subtitle = '';
  @Input({ required: true }) resource = '';
  @Input() allowAdding = true;
  @Input() allowUpdating = true;
  @Input() allowDeleting = true;
  @Input() showSearch = true;
  @Input() popupWidth: number | string = 720;
  @Input() popupHeight: number | string = 540;

  @ContentChild('columns') columns!: TemplateRef<any>;

  store = signal<CustomStore | null>(null);

  ngOnInit() {
    this.store.set(this.factory.create(this.resource));
  }
}
