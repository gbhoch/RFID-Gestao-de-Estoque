import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { DxDataGridModule } from 'devextreme-angular';
import notify from 'devextreme/ui/notify';
import { RestStoreFactory } from '../../shared/rest-store.factory';
import { PageHeaderComponent } from '../../shared/page-header.component';
import { environment } from '../../../environments/environment';

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
        <!-- Edição completa (bancos de memória) acontece no painel dedicado. Aqui só exclui. -->
        <dxo-editing mode="row" [allowAdding]="false" [allowUpdating]="false"
          [allowDeleting]="true" [useIcons]="true"></dxo-editing>

        <dxo-toolbar>
          <dxi-item location="before" widget="dxButton" [options]="scanButton"></dxi-item>
          <dxi-item location="before" widget="dxButton" [options]="newTagButton"></dxi-item>
          <dxi-item name="searchPanel"></dxi-item>
        </dxo-toolbar>

        <dxi-column dataField="epc" caption="EPC"></dxi-column>
        <dxi-column dataField="tid" caption="TID"></dxi-column>
        <dxi-column dataField="rfidCode" caption="Código RFID"></dxi-column>
        <dxi-column dataField="serialNumber" caption="Nº de série"></dxi-column>
        <dxi-column dataField="manufacturer" caption="Fabricante"></dxi-column>
        <dxi-column dataField="status" caption="Status" cellTemplate="statusCell" [width]="140">
          <dxo-lookup [dataSource]="statuses" valueExpr="value" displayExpr="text"></dxo-lookup>
        </dxi-column>

        <dxi-column type="buttons" caption="Ações" [width]="110">
          <dxi-button hint="Gerenciar" icon="preferences" [onClick]="manage"></dxi-button>
          <dxi-button name="delete"></dxi-button>
        </dxi-column>

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
  private router = inject(Router);
  private http = inject(HttpClient);
  store = this.factory.create('rfid-tags');
  scanning = false;

  scanButton = {
    icon: 'find', text: 'Ler tag',
    onClick: () => this.scanTag(),
  };
  newTagButton = {
    icon: 'add', text: 'Nova etiqueta', type: 'default',
    onClick: () => this.router.navigate(['/rfid', 'new']),
  };

  manage = (e: any) => this.router.navigate(['/rfid', e.row.data.id]);

  /** Escaneia o campo do leitor; se a etiqueta já existe, abre-a; senão, novo cadastro pré-preenchido. */
  async scanTag() {
    if (this.scanning) return;
    this.scanning = true;
    try {
      const res: any = await firstValueFrom(
        this.http.post(`${environment.apiUrl}/rfid-tags/scan`, {}),
      );
      const tags = res?.tags ?? [];
      if (!tags.length) {
        notify('Nenhuma etiqueta detectada no campo do leitor.', 'warning', 3000);
        return;
      }
      if (tags.length > 1) {
        notify(`${tags.length} etiquetas no campo — usando a primeira.`, 'warning', 3500);
      }
      const epc = String(tags[0].epc || '').toUpperCase();
      const tid = tags[0].tid ? String(tags[0].tid).toUpperCase() : undefined;

      // Já cadastrada? abre o painel dela; senão, novo cadastro pré-preenchido.
      const found: any = await firstValueFrom(
        this.http.get(`${environment.apiUrl}/rfid-tags`, { params: { search: epc, take: 1 } as any }),
      );
      const existing = (found?.data ?? []).find(
        (r: any) => String(r.epc || '').toUpperCase() === epc,
      );
      if (existing) {
        notify(`Etiqueta já cadastrada — abrindo (${epc}).`, 'success', 2500);
        this.router.navigate(['/rfid', existing.id]);
      } else {
        notify(`Etiqueta lida (${epc}) — novo cadastro.`, 'success', 2500);
        this.router.navigate(['/rfid', 'new'], { queryParams: { epc, tid } });
      }
    } catch (e: any) {
      if (e?.status === 503) notify(e?.error?.message || 'Leitor RFID não conectado.', 'warning', 4000);
      else notify(e?.error?.message || 'Falha ao ler a etiqueta.', 'error', 4000);
    } finally {
      this.scanning = false;
    }
  }

  statuses = [
    { value: 'active', text: 'Ativa' }, { value: 'inactive', text: 'Inativa' },
    { value: 'in_use', text: 'Em uso' }, { value: 'damaged', text: 'Danificada' },
    { value: 'lost', text: 'Perdida' }, { value: 'retired', text: 'Desuso' },
    { value: 'blocked', text: 'Bloqueada' },
  ];
  label = (v: string) => this.statuses.find((s) => s.value === v)?.text ?? v;
  pillClass(v: string) {
    if (['active', 'in_use'].includes(v)) return 'pill-success';
    if (['inactive', 'damaged'].includes(v)) return 'pill-warning';
    if (['lost', 'retired', 'blocked'].includes(v)) return 'pill-danger';
    return 'pill-neutral';
  }
}
