import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../core/auth/auth.service';

/** Uma leitura no formato de POST /inventory/:id/reads (o backend recusa campos extras). */
export interface ReadItemBody {
  epc: string;
  readAt?: string;
  rssi?: number;
  readCount?: number;
  deviceId?: string;
}

export interface ReadBatchBody {
  sectorVisitId: string;
  /** Chave de idempotência: reenviar o mesmo lote é no-op no backend. */
  clientBatchId: string;
  reads: ReadItemBody[];
}

/**
 * Cliente da API de inventário. O estado da UI vem daqui — nunca de localStorage.
 *
 * As consultas usadas pela tela de captura guardam a última resposta EM MEMÓRIA e a
 * devolvem quando o servidor está inalcançável (status 0): com a rede caída o operador
 * continua vendo o setor e lendo; as leituras vão para a ReadSyncQueue.
 */
@Injectable({ providedIn: 'root' })
export class InventoryApi {
  private http = inject(HttpClient);
  private auth = inject(AuthService);
  private base = `${environment.apiUrl}/inventory`;
  private lastResponses = new Map<string, unknown>();

  current() { return this.cachedGet<any>(`${this.base}/current`); }
  detail(id: string) { return this.cachedGet<any>(`${this.base}/${id}`); }
  async create(description?: string) {
    const inv = await firstValueFrom(this.http.post<any>(this.base, description ? { description } : {}));
    this.lastResponses.clear(); // "current" mudou
    return inv;
  }
  pause(id: string) { return firstValueFrom(this.http.patch<any>(`${this.base}/${id}/pause`, {})); }
  resume(id: string) { return firstValueFrom(this.http.patch<any>(`${this.base}/${id}/resume`, {})); }
  async finish(id: string) {
    const inv = await firstValueFrom(this.http.post<any>(`${this.base}/${id}/finish`, {}));
    this.lastResponses.clear(); // sem rede, não reapresentar o inventário encerrado como aberto
    return inv;
  }

  /** Setores para o seletor da tela de inventário. */
  sectors() {
    return this.cachedGet<any>(`${environment.apiUrl}/sectors`, { skip: 0, take: 500 });
  }
  selectSector(id: string, sectorId: string) {
    return firstValueFrom(this.http.post<any>(`${this.base}/${id}/sectors`, { sectorId }));
  }
  completeSector(id: string, visitId: string) {
    return firstValueFrom(this.http.patch<any>(`${this.base}/${id}/sectors/${visitId}/complete`, {}));
  }
  addReads(id: string, sectorVisitId: string, epcs: string[]) {
    return firstValueFrom(
      this.http.post<any>(`${this.base}/${id}/reads`, { sectorVisitId, reads: epcs.map((epc) => ({ epc })) }),
    );
  }
  /** Envio da fila (ReadSyncQueue): mesmo endpoint e formato do coletor Android. */
  addReadBatch(id: string, body: ReadBatchBody) {
    return firstValueFrom(
      this.http.post<{ received: number; inserted: number }>(`${this.base}/${id}/reads`, body),
    );
  }
  panel(id: string, visitId: string) {
    return this.cachedGet<any>(`${this.base}/${id}/sectors/${visitId}/panel`);
  }
  discrepancies(id: string) {
    return firstValueFrom(this.http.get<any[]>(`${this.base}/${id}/discrepancies`));
  }
  /**
   * Reabre um inventário encerrado para absorver coleta que chegou tarde (coletor
   * que sincronizou depois do fechamento). O servidor recusa se alguma divergência
   * já tiver sido resolvida — movimentação de ativo não é reversível.
   */
  reopen(id: string) { return firstValueFrom(this.http.patch<any>(`${this.base}/${id}/reopen`, {})); }

  resolve(id: string, discId: string, resolution: string, resolutionNotes?: string) {
    return firstValueFrom(
      this.http.patch<any>(`${this.base}/${id}/discrepancies/${discId}/resolve`,
        { resolution, ...(resolutionNotes ? { resolutionNotes } : {}) }),
    );
  }

  /** GET que, sem rede, devolve a última resposta obtida por este mesmo usuário. */
  private async cachedGet<T>(url: string, params?: Record<string, string | number>): Promise<T> {
    const key = `${this.auth.userId() ?? ''} ${url} ${JSON.stringify(params ?? {})}`;
    try {
      const value = await firstValueFrom(this.http.get<T>(url, params ? { params } : {}));
      this.lastResponses.set(key, value);
      return value;
    } catch (e) {
      if (e instanceof HttpErrorResponse && e.status === 0 && this.lastResponses.has(key)) {
        return this.lastResponses.get(key) as T;
      }
      throw e;
    }
  }
}
