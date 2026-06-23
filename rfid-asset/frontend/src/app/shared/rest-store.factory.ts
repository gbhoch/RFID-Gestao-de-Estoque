import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import CustomStore from 'devextreme/data/custom_store';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';

/**
 * Cria um CustomStore DevExtreme apontando para um recurso REST padrão
 * (GET lista paginada {data,total}, GET/:id, POST, PUT/:id, DELETE/:id).
 * Reaproveitado por todos os grids CRUD do sistema.
 */
@Injectable({ providedIn: 'root' })
export class RestStoreFactory {
  private http = inject(HttpClient);

  create(resource: string): CustomStore {
    const base = `${environment.apiUrl}/${resource}`;
    return new CustomStore({
      key: 'id',
      load: async (opts) => {
        const res: any = await firstValueFrom(
          this.http.get(base, {
            params: { skip: opts.skip ?? 0, take: opts.take ?? 20 } as any,
          }),
        );
        return { data: res.data, totalCount: res.total };
      },
      byKey: (key) => firstValueFrom(this.http.get(`${base}/${key}`)),
      insert: (values) => firstValueFrom(this.http.post(base, values)),
      update: (key, values) => firstValueFrom(this.http.put(`${base}/${key}`, values)),
      remove: (key) => firstValueFrom(this.http.delete(`${base}/${key}`)),
    });
  }
}
