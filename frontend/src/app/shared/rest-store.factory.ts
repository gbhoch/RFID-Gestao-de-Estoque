import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import CustomStore from 'devextreme/data/custom_store';
import { firstValueFrom, Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface RestStoreOptions {
  /**
   * Filtros extras enviados a cada carga, lidos no momento da chamada (valores
   * vazios são omitidos). Ex.: () => ({ sectorId: 'none', status: 'active' }).
   */
  params?: () => Record<string, string | null | undefined>;
  /** Chamado após cada carga com o total do backend (para "N registros"). */
  onLoaded?: (total: number) => void;
  /**
   * Repassa a ordenação do grid como sortBy/sortDir (1ª coluna ordenada).
   * Use junto com remoteOperations { paging: true, sorting: true }: com
   * ordenação local o DevExtreme desliga a paginação remota e passa a carregar
   * sem skip/take (o grid ficaria preso no take padrão).
   */
  remoteSort?: boolean;
}

type SortOption = { selector: string; desc?: boolean };

@Injectable({ providedIn: 'root' })
export class RestStoreFactory {
  private http = inject(HttpClient);

  create(resource: string, options: RestStoreOptions = {}): CustomStore {
    const base = `${environment.apiUrl}/${resource}`;
    return new CustomStore({
      key: 'id',
      load: async (opts) => {
        const params: Record<string, string | number> = {
          skip: opts.skip ?? 0, take: opts.take ?? 20,
        };
        for (const [k, v] of Object.entries(options.params?.() ?? {}))
          if (v !== null && v !== undefined && v !== '') params[k] = v;
        if (options.remoteSort) {
          const sort = (Array.isArray(opts.sort) ? opts.sort[0] : opts.sort) as SortOption | undefined;
          if (sort?.selector) {
            params['sortBy'] = sort.selector;
            params['sortDir'] = sort.desc ? 'desc' : 'asc';
          }
        }
        try {
          const res: any = await firstValueFrom(this.http.get(base, { params }));
          // Backend devolve { data, total }. Garante array mesmo se vier vazio.
          const totalCount = res?.total ?? 0;
          options.onLoaded?.(totalCount);
          return { data: res?.data ?? [], totalCount };
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
