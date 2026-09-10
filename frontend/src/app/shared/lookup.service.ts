import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import CustomStore from 'devextreme/data/custom_store';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';

/**
 * Fornece CustomStores para campos de seleção (lookup) nos formulários.
 * Carrega listas completas (até 200 itens) de cada recurso para popular
 * dropdowns de categoria, setor, responsável e etiqueta.
 */
@Injectable({ providedIn: 'root' })
export class LookupService {
  private http = inject(HttpClient);

  private listStore(resource: string): CustomStore {
    const base = `${environment.apiUrl}/${resource}`;
    return new CustomStore({
      key: 'id',
      loadMode: 'raw',
      load: async () => {
        try {
          const res: any = await firstValueFrom(
            this.http.get(base, { params: { skip: 0, take: 200 } as any }),
          );
          return res?.data ?? [];
        } catch {
          return [];
        }
      },
      byKey: async (key) => {
        try { return await firstValueFrom(this.http.get(`${base}/${key}`)); }
        catch { return null; }
      },
    });
  }

  categories() { return this.listStore('categories'); }
  sectors() { return this.listStore('sectors'); }
  users() { return this.listStore('users'); }
  roles() { return this.listStore('roles'); }
  assets() { return this.listStore('assets'); }
  rfidTags() { return this.listStore('rfid-tags'); }
}
