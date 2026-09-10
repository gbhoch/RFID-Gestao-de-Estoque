import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import {
  DxTextBoxModule, DxTextAreaModule, DxSelectBoxModule,
  DxButtonModule, DxTabPanelModule, DxCheckBoxModule,
} from 'devextreme-angular';
import notify from 'devextreme/ui/notify';
import { environment } from '../../../environments/environment';
import {
  Gen2Bank, GEN2_BANKS, READ_BANKS, WRITE_BANKS, EPC_MAX_BITS,
  normalizeHex, hexWords, hexBits,
  validateWordHex, validatePassword, validatePc,
} from '../../shared/gen2.util';
import { ReaderCaptureDirective } from '../../shared/reader-capture.directive';

@Component({
  selector: 'app-rfid-tag-manage',
  standalone: true,
  imports: [
    CommonModule, DxTextBoxModule, DxTextAreaModule, DxSelectBoxModule,
    DxButtonModule, DxTabPanelModule, DxCheckBoxModule, ReaderCaptureDirective,
  ],
  template: `
    <div class="mng-head">
      <button class="icon-btn" (click)="back()" title="Voltar">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
          stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
      </button>
      <div class="mng-title">
        <h1>{{ mode === 'create' ? 'Nova etiqueta RFID' : 'Gerenciar etiqueta' }}</h1>
        @if (mode === 'edit') { <span class="mng-epc">EPC: {{ model.epc }}</span> }
      </div>
      @if (model.status) {
        <span class="pill" [class]="pillClass(model.status)">{{ label(model.status) }}</span>
      }
      <div class="spacer"></div>
      <dx-button text="Salvar" type="default" [disabled]="saving" (onClick)="save()"></dx-button>
    </div>

    <!-- Operações físicas com o leitor -->
    <div class="card ops">
      <div class="sec-title">Operações do leitor</div>
      <div class="op-grid">
        <div class="op-row">
          <span class="op-label">Etiqueta no leitor</span>
          <dx-button text="Ler tag" icon="find" type="default"
            [disabled]="scanning" (onClick)="doScan()"></dx-button>
          <span class="op-scan-hint">Escaneia o campo e preenche EPC/TID.</span>
        </div>
        <div class="op-row">
          <span class="op-label">Banco de leitura</span>
          <dx-select-box [items]="readBanks" displayExpr="text" valueExpr="value"
            [(value)]="readBank" [width]="210"></dx-select-box>
          <dx-button text="Ler tag" icon="download"
            [disabled]="reading || mode === 'create'" (onClick)="doRead()"></dx-button>
        </div>
        <div class="op-row">
          <span class="op-label">Tag memory (gravar)</span>
          <dx-select-box [items]="writeBanks" displayExpr="text" valueExpr="value"
            [(value)]="writeBank" [width]="210"></dx-select-box>
          <dx-button text="Gravar" icon="upload"
            [disabled]="writing || mode === 'create'" (onClick)="doWrite()"></dx-button>
        </div>
      </div>
      <p class="reader-hint">
        Operações físicas (ler / gravar / travar) exigem o leitor RFID conectado. O SDK ainda
        não está integrado — estas ações retornam "aguardando leitor".
        @if (mode === 'create') { Salve a etiqueta para habilitá-las. }
      </p>
    </div>

    <!-- Identificação -->
    <div class="card">
      <div class="sec-title">Identificação</div>
      <div class="form-grid">
        <label>EPC *
          <dx-text-box [(value)]="model.epc" valueChangeEvent="keyup"
            appReaderCapture (reading)="onReaderEpc($event)"
            placeholder="Foque aqui e dispare o leitor, ou digite o EPC"></dx-text-box>
          <small [class.err]="epcError()">{{ epcError() || epcInfo() }}</small>
        </label>
        <label>Código RFID
          <dx-text-box [(value)]="model.rfidCode"></dx-text-box>
        </label>
        <label>Nº de série
          <dx-text-box [(value)]="model.serialNumber"></dx-text-box>
        </label>
        <label>Fabricante
          <dx-text-box [(value)]="model.manufacturer"></dx-text-box>
        </label>
        <label>Status
          <dx-select-box [items]="statuses" displayExpr="text" valueExpr="value"
            [(value)]="model.status"></dx-select-box>
        </label>
        <label class="col-2">Observações
          <dx-text-area [(value)]="model.notes" [height]="70"></dx-text-area>
        </label>
      </div>
    </div>

    <!-- Bancos de memória -->
    <div class="card">
      <div class="sec-title">Bancos de memória (EPC Gen2 — words de 16 bits)</div>
      <dx-tab-panel [dataSource]="bankTabs" [selectedIndex]="0"
        [swipeEnabled]="false" [animationEnabled]="true">
        <div *dxTemplate="let tab of 'item'">
          <div class="bank-body">
            @switch (tab.bank) {
              @case (1) {
                <div class="form-grid">
                  <label>PC (Protocol Control)
                    <dx-text-box [(value)]="model.pcWord" valueChangeEvent="keyup"
                      placeholder="1 word — ex.: 3000"></dx-text-box>
                    <small [class.err]="pcError()">{{ pcError() || 'Word 1 do banco EPC' }}</small>
                  </label>
                  <label>CRC-16
                    <dx-text-box value="calculado pela tag" [readOnly]="true"></dx-text-box>
                    <small>Word 0 — somente leitura</small>
                  </label>
                  <label class="col-2">EPC
                    <dx-text-box [(value)]="model.epc" valueChangeEvent="keyup"></dx-text-box>
                    <small [class.err]="epcError()">{{ epcError() || epcInfo() }}</small>
                  </label>
                </div>
              }
              @case (2) {
                <div class="form-grid">
                  <label class="col-2">TID (identificador de fábrica)
                    <dx-text-box [(value)]="model.tid" valueChangeEvent="keyup"
                      placeholder="ex.: E280117000000000..."></dx-text-box>
                    <small [class.err]="tidError()">
                      {{ tidError() || (tidInfo() + ' · banco somente leitura') }}
                    </small>
                  </label>
                </div>
              }
              @case (3) {
                <div class="form-grid">
                  <label class="col-2">User memory
                    <dx-text-area [(value)]="model.userMemory" valueChangeEvent="keyup"
                      [height]="90" placeholder="hex alinhado a word (múltiplos de 4 dígitos)"></dx-text-area>
                    <small [class.err]="userError()">{{ userError() || userInfo() }}</small>
                  </label>
                </div>
              }
              @case (0) {
                <div class="form-grid">
                  <label>Senha de acesso
                    <dx-text-box [(value)]="model.accessPassword" mode="password"
                      placeholder="8 dígitos hex (32 bits)"></dx-text-box>
                    <small [class.err]="accessError()">
                      {{ accessError() || 'Words 2-3 do banco Reservado' }}
                    </small>
                  </label>
                  <label>Senha de kill
                    <dx-text-box [(value)]="model.killPassword" mode="password"
                      placeholder="8 dígitos hex (32 bits)"></dx-text-box>
                    <small [class.err]="killError()">
                      {{ killError() || 'Words 0-1 do banco Reservado' }}
                    </small>
                  </label>
                  <div class="col-2 lock-box">
                    <div class="lock-head">
                      <span class="op-label">Proteção (lock)</span>
                      <dx-select-box [items]="allBanks" displayExpr="text" valueExpr="value"
                        [(value)]="lockBank" [width]="210"></dx-select-box>
                    </div>
                    <div class="lock-actions">
                      <dx-check-box text="Permanente" [(value)]="lockPermanent"
                        class="lock-perm"></dx-check-box>
                      <span class="lock-spacer"></span>
                      <dx-button text="Travar" type="danger"
                        [disabled]="locking || mode === 'create'" (onClick)="doLock(true)"></dx-button>
                      <dx-button text="Destravar" stylingMode="outlined"
                        [disabled]="locking || mode === 'create'" (onClick)="doLock(false)"></dx-button>
                    </div>
                    <small class="lock-hint">
                      Travar impede regravações do banco. “Permanente” é irreversível — use com cautela.
                    </small>
                  </div>
                </div>
              }
            }
          </div>
        </div>
      </dx-tab-panel>
    </div>
  `,
  styles: [`
    .mng-head { display: flex; align-items: center; gap: 14px; margin-bottom: 18px; }
    .mng-head .spacer { flex: 1; }
    .mng-title h1 { font-size: 20px; margin: 0; }
    .mng-epc { font-size: 12.5px; color: var(--text-faint); font-family: monospace; }
    .icon-btn {
      display: grid; place-items: center; width: 38px; height: 38px;
      border: 1px solid var(--border); background: var(--surface); cursor: pointer;
      color: var(--text-soft); border-radius: var(--radius-sm);
    }
    .icon-btn svg { width: 18px; height: 18px; }
    .icon-btn:hover { background: var(--surface-2); color: var(--text); }

    .card { padding: 20px; margin-bottom: 16px; }
    .sec-title { font-size: 14px; font-weight: 650; margin-bottom: 14px; color: var(--text); }

    .ops .op-grid { display: flex; flex-wrap: wrap; gap: 24px; }
    .op-row { display: flex; align-items: center; gap: 10px; }
    .op-label { font-size: 13px; color: var(--text-soft); font-weight: 500; }
    .op-scan-hint { font-size: 12px; color: var(--text-faint); }
    .reader-hint {
      margin: 14px 0 0; font-size: 12.5px; color: var(--warning);
      background: rgba(192,138,30,.08); padding: 8px 12px; border-radius: var(--radius-sm);
    }

    .form-grid {
      display: grid; grid-template-columns: 1fr 1fr; gap: 14px 18px;
    }
    .form-grid label {
      display: flex; flex-direction: column; gap: 5px;
      font-size: 12.5px; font-weight: 600; color: var(--text-soft);
    }
    .form-grid .col-2 { grid-column: 1 / -1; }
    .form-grid small { font-size: 11.5px; font-weight: 500; color: var(--text-faint); }
    .form-grid small.err { color: var(--danger); }

    .bank-body { padding: 16px 4px 4px; }
    .lock-box {
      display: flex; flex-direction: column; align-items: stretch; gap: 12px;
      padding: 14px; background: var(--surface-2);
      border: 1px solid var(--border); border-left: 3px solid var(--danger);
      border-radius: var(--radius-sm);
    }
    .lock-head { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
    .lock-actions { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
    .lock-actions .lock-spacer { flex: 1 1 12px; }
    .lock-hint { font-size: 11.5px; color: var(--text-faint); line-height: 1.5; }

    @media (max-width: 720px) { .form-grid { grid-template-columns: 1fr; } }
  `],
})
export class RfidTagManageComponent {
  private http = inject(HttpClient);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private api = `${environment.apiUrl}/rfid-tags`;

  mode: 'create' | 'edit' = 'create';
  id: string | null = null;
  private loadedId: string | null = null;
  model: any = { status: 'active' };

  reading = false; writing = false; locking = false; saving = false; scanning = false;

  readBanks = READ_BANKS;
  writeBanks = WRITE_BANKS;
  allBanks = GEN2_BANKS;
  readBank: Gen2Bank = Gen2Bank.EPC;
  writeBank: Gen2Bank = Gen2Bank.EPC;
  lockBank: Gen2Bank = Gen2Bank.EPC;
  lockPermanent = false;

  bankTabs = [
    { title: 'EPC', bank: Gen2Bank.EPC },
    { title: 'TID', bank: Gen2Bank.TID },
    { title: 'User', bank: Gen2Bank.USER },
    { title: 'Reservado', bank: Gen2Bank.RESERVED },
  ];

  statuses = [
    { value: 'active', text: 'Ativa' }, { value: 'inactive', text: 'Inativa' },
    { value: 'in_use', text: 'Em uso' }, { value: 'damaged', text: 'Danificada' },
    { value: 'lost', text: 'Perdida' }, { value: 'retired', text: 'Desuso' },
    { value: 'blocked', text: 'Bloqueada' },
  ];

  constructor() {
    this.route.paramMap.subscribe((pm) => {
      const pid = pm.get('id');
      if (pid === this.loadedId) return;
      this.init(pid);
    });
  }

  private init(pid: string | null) {
    if (!pid || pid === 'new') {
      this.mode = 'create'; this.id = null; this.loadedId = 'new';
      this.model = { status: 'active' };
      // Pré-preenche a partir de uma leitura vinda da grade (?epc=&tid=).
      const qp = this.route.snapshot.queryParamMap;
      const epc = qp.get('epc'); const tid = qp.get('tid');
      if (epc) this.model.epc = epc.toUpperCase();
      if (tid) this.model.tid = tid.toUpperCase();
      return;
    }
    this.mode = 'edit'; this.id = pid; this.loadedId = pid;
    this.loadTag(pid);
  }

  private async loadTag(id: string) {
    try {
      const res = await firstValueFrom(this.http.get(`${this.api}/${id}`));
      this.applyLoaded(res);
    } catch {
      notify('Não foi possível carregar a etiqueta.', 'error', 4000);
    }
  }

  private applyLoaded(res: any) {
    // Preserva senhas digitadas (o backend não as retorna — select:false).
    const { accessPassword, killPassword } = this.model;
    this.model = { ...res };
    if (accessPassword) this.model.accessPassword = accessPassword;
    if (killPassword) this.model.killPassword = killPassword;
  }

  // ---- Validação (mensagem ou null) ----
  epcError = () => validateWordHex(this.model.epc, { required: true, maxBits: EPC_MAX_BITS });
  pcError = () => validatePc(this.model.pcWord);
  tidError = () => validateWordHex(this.model.tid);
  userError = () => validateWordHex(this.model.userMemory);
  accessError = () => validatePassword(this.model.accessPassword);
  killError = () => validatePassword(this.model.killPassword);
  private isValid = () =>
    !this.epcError() && !this.pcError() && !this.tidError() &&
    !this.userError() && !this.accessError() && !this.killError();

  epcInfo = () => this.info(this.model.epc);
  tidInfo = () => this.info(this.model.tid);
  userInfo = () => this.info(this.model.userMemory);
  private info(hex: string) {
    const h = normalizeHex(hex);
    return h ? `${hexWords(h)} words · ${hexBits(h)} bits` : 'vazio';
  }

  // ---- Status pill ----
  label = (v: string) => this.statuses.find((s) => s.value === v)?.text ?? v;
  pillClass(v: string) {
    if (['active', 'in_use'].includes(v)) return 'pill-success';
    if (['inactive', 'damaged'].includes(v)) return 'pill-warning';
    if (['lost', 'retired', 'blocked'].includes(v)) return 'pill-danger';
    return 'pill-neutral';
  }

  // ---- Persistência (CRUD) ----
  private buildPayload() {
    const p: any = { epc: normalizeHex(this.model.epc) };
    for (const k of ['rfidCode', 'serialNumber', 'manufacturer', 'notes', 'status']) {
      if (this.model[k]) p[k] = this.model[k];
    }
    const hexFields: Record<string, string> = {
      tid: this.model.tid, pcWord: this.model.pcWord, userMemory: this.model.userMemory,
      accessPassword: this.model.accessPassword, killPassword: this.model.killPassword,
    };
    for (const [k, v] of Object.entries(hexFields)) {
      if (v) p[k] = normalizeHex(v);
    }
    return p;
  }

  async save() {
    if (this.epcError()) { notify(`EPC inválido: ${this.epcError()}`, 'error', 4000); return; }
    if (!this.isValid()) { notify('Corrija os campos destacados antes de salvar.', 'error', 4000); return; }
    this.saving = true;
    try {
      const payload = this.buildPayload();
      if (this.mode === 'create') {
        const res: any = await firstValueFrom(this.http.post(this.api, payload));
        notify('Etiqueta cadastrada.', 'success', 2500);
        this.id = res.id; this.loadedId = res.id; this.mode = 'edit';
        this.applyLoaded(res);
        this.router.navigate(['/rfid', res.id]);
      } else {
        const res = await firstValueFrom(this.http.put(`${this.api}/${this.id}`, payload));
        this.applyLoaded(res);
        notify('Etiqueta atualizada.', 'success', 2500);
      }
    } catch (e: any) {
      notify(e?.error?.message || 'Falha ao salvar a etiqueta.', 'error', 4000);
    } finally {
      this.saving = false;
    }
  }

  // ---- Leitor em modo teclado (HID): captura no campo EPC ----
  private readerEpc = '';
  private readerClusterTimer: any = null;

  /**
   * Chamado pela ReaderCaptureDirective a cada etiqueta lida no campo EPC.
   * A primeira leitura da rajada preenche o EPC; se outra etiqueta aparecer no
   * campo em seguida, apenas avisa (não sobrescreve) para não cadastrar a tag
   * errada. Re-fixa o campo no EPC escolhido para limpar qualquer resíduo que
   * o leitor tenha digitado em modo contínuo.
   */
  onReaderEpc(epc: string) {
    if (!this.readerEpc) {
      this.readerEpc = epc;
      notify(`Etiqueta lida: ${epc}`, 'success', 2000);
    } else if (epc !== this.readerEpc) {
      notify('Mais de uma etiqueta no campo — mantendo a primeira. Afaste as demais.', 'warning', 3500);
    }
    this.model.epc = this.readerEpc;
    if (this.readerClusterTimer) clearTimeout(this.readerClusterTimer);
    this.readerClusterTimer = setTimeout(() => (this.readerEpc = ''), 1500);
  }

  // ---- Operações do leitor (stub → 503 até o SDK) ----
  async doScan() {
    this.scanning = true;
    try {
      const res: any = await firstValueFrom(this.http.post(`${this.api}/scan`, {}));
      const tags = res?.tags ?? [];
      if (!tags.length) {
        notify('Nenhuma etiqueta detectada no campo do leitor.', 'warning', 3000);
        return;
      }
      if (tags.length > 1) {
        notify(`${tags.length} etiquetas no campo — usando a primeira.`, 'warning', 3500);
      }
      const t = tags[0];
      if (t.epc) this.model.epc = normalizeHex(t.epc);
      if (t.tid) this.model.tid = normalizeHex(t.tid);
      notify(`Etiqueta lida: ${this.model.epc}`, 'success', 2500);
    } catch (e) { this.readerError(e); } finally { this.scanning = false; }
  }

  async doRead() {
    if (this.mode === 'create') return;
    this.reading = true;
    try {
      const res = await firstValueFrom(
        this.http.post(`${this.api}/${this.id}/read-bank`, { bank: this.readBank }),
      );
      this.applyLoaded(res);
      notify('Leitura concluída.', 'success', 2500);
    } catch (e) { this.readerError(e); } finally { this.reading = false; }
  }

  async doWrite() {
    if (this.mode === 'create') return;
    const dataHex = this.writeBank === Gen2Bank.EPC ? this.model.epc : this.model.userMemory;
    const err = validateWordHex(dataHex || '', {
      required: true, maxBits: this.writeBank === Gen2Bank.EPC ? EPC_MAX_BITS : undefined,
    });
    if (err) { notify(`Dados inválidos para gravação: ${err}`, 'error', 4000); return; }
    this.writing = true;
    try {
      const res = await firstValueFrom(
        this.http.post(`${this.api}/${this.id}/write-bank`, {
          bank: this.writeBank, dataHex: normalizeHex(dataHex),
        }),
      );
      this.applyLoaded(res);
      notify('Gravação concluída.', 'success', 2500);
    } catch (e) { this.readerError(e); } finally { this.writing = false; }
  }

  async doLock(lock: boolean) {
    if (this.mode === 'create') return;
    this.locking = true;
    try {
      const res = await firstValueFrom(
        this.http.post(`${this.api}/${this.id}/lock`, {
          bank: this.lockBank, lock, permanent: this.lockPermanent,
        }),
      );
      this.applyLoaded(res);
      notify(lock ? 'Banco travado.' : 'Banco destravado.', 'success', 2500);
    } catch (e) { this.readerError(e); } finally { this.locking = false; }
  }

  private readerError(e: any) {
    if (e?.status === 503) {
      notify(e?.error?.message || 'Leitor RFID não conectado — SDK pendente', 'warning', 4000);
    } else {
      notify(e?.error?.message || 'Falha na operação com o leitor.', 'error', 4000);
    }
  }

  back() { this.router.navigate(['/rfid']); }
}
