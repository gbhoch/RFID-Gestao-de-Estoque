import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import CustomStore from 'devextreme/data/custom_store';
import { firstValueFrom, Observable } from 'rxjs';
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
      insert: (values) => this.mutate(this.http.post(base, values)),
      update: (key, values) => this.mutate(this.http.put(`${base}/${key}`, values)),
      remove: async (key) => {
        await this.mutate(this.http.delete(`${base}/${key}`));
      },
    });
  }

  /**
   * Executa uma operação de escrita e, em caso de erro, rejeita com uma
   * MENSAGEM LEGÍVEL (o DevExtreme mostra `error.message`). Sem isto, o objeto
   * de erro do backend aparecia para o usuário como "[object Object]".
   */
  private async mutate<T>(obs: Observable<T>): Promise<T> {
    try {
      return await firstValueFrom(obs);
    } catch (e) {
      throw new Error(this.readableError(e));
    }
  }

  /** Extrai a mensagem de erro mais específica do backend, com fallbacks. */
  private readableError(e: any): string {
    if (e?.status === 0) return 'Sem conexão com o servidor. Verifique sua rede.';
    const body = e?.error;
    let msg =
      (typeof body === 'string' ? body : null) ??
      body?.message ??        // corpo achatado (novo AllExceptionsFilter)
      body?.error?.message ?? // corpo aninhado (defensivo)
      e?.message ??
      'Não foi possível salvar. Verifique os dados e tente novamente.';
    if (Array.isArray(msg)) msg = msg.join('; ');
    return String(msg);
  }
}
