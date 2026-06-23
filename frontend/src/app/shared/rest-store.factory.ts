import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import CustomStore from 'devextreme/data/custom_store';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class RestStoreFactory {
  private http = inject(HttpClient);

  create(resource: string): CustomStore {
    const base = `${environment.apiUrl}/${resource}`;
    return new CustomStore({
      key: 'id',
      load: async (opts) => {
        try {
          const res: any = await firstValueFrom(
            this.http.get(base, {
              params: { skip: opts.skip ?? 0, take: opts.take ?? 20 } as any,
            }),
          );
          // Backend devolve { data, total }. Garante array mesmo se vier vazio.
          return { data: res?.data ?? [], totalCount: res?.total ?? 0 };
        } catch (e) {
          // Em vez de travar em "Loading...", devolve vazio e propaga o erro.
          console.error(`Falha ao carregar ${resource}:`, e);
          throw 'Não foi possível carregar os dados. Verifique sua conexão.';
        }
      },
      byKey: (key) => firstValueFrom(this.http.get(`${base}/${key}`)),
      insert: (values) => firstValueFrom(this.http.post(base, values)),
      update: (key, values) => firstValueFrom(this.http.put(`${base}/${key}`, values)),
      remove: async (key) => {
        await firstValueFrom(this.http.delete(`${base}/${key}`));
      },
    });
  }
}
