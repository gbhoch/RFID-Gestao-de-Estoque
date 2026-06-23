import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import CustomStore from 'devextreme/data/custom_store';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class AssetsDataService {
  private http = inject(HttpClient);
  private base = `${environment.apiUrl}/assets`;

  /** CustomStore conecta o DxDataGrid (paginação server-side) à API REST. */
  createStore(): CustomStore {
    return new CustomStore({
      key: 'id',
      load: async (opts) => {
        const skip = opts.skip ?? 0;
        const take = opts.take ?? 20;
        const res: any = await firstValueFrom(
          this.http.get(this.base, { params: { skip, take } as any }),
        );
        return { data: res.data, totalCount: res.total };
      },
      byKey: (key) => firstValueFrom(this.http.get(`${this.base}/${key}`)),
      insert: (values) => firstValueFrom(this.http.post(this.base, values)),
      update: (key, values) => firstValueFrom(this.http.put(`${this.base}/${key}`, values)),
      remove: async (key) => { await firstValueFrom(this.http.delete(`${this.base}/${key}`)); },
    });
  }
}
