import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';

/** Cliente da API de inventário. O estado da UI vem daqui — nunca de localStorage. */
@Injectable({ providedIn: 'root' })
export class InventoryApi {
  private http = inject(HttpClient);
  private base = `${environment.apiUrl}/inventory`;

  current() { return firstValueFrom(this.http.get<any>(`${this.base}/current`)); }
  detail(id: string) { return firstValueFrom(this.http.get<any>(`${this.base}/${id}`)); }
  create(description?: string) {
    return firstValueFrom(this.http.post<any>(this.base, description ? { description } : {}));
  }
  pause(id: string) { return firstValueFrom(this.http.patch<any>(`${this.base}/${id}/pause`, {})); }
  resume(id: string) { return firstValueFrom(this.http.patch<any>(`${this.base}/${id}/resume`, {})); }
  finish(id: string) { return firstValueFrom(this.http.post<any>(`${this.base}/${id}/finish`, {})); }

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
  panel(id: string, visitId: string) {
    return firstValueFrom(this.http.get<any>(`${this.base}/${id}/sectors/${visitId}/panel`));
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
}
