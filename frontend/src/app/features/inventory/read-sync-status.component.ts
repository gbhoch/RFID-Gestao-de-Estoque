import { Component, EventEmitter, Input, Output, computed, inject, signal } from '@angular/core';
import { confirm } from 'devextreme/ui/dialog';
import notify from 'devextreme/ui/notify';
import { ReadSyncQueue } from './read-sync-queue.service';

/**
 * Aviso de leituras ainda não aceitas pelo servidor, com as ações sobre a fila.
 * Com [inventoryId], mostra as do inventário e, à parte, as sobras de outros inventários;
 * sem ele, mostra tudo.
 */
@Component({
  selector: 'app-read-sync-status',
  standalone: true,
  template: `
    @if (mine().reads > 0) {
      <div class="card sync" [class.bad]="mine().blocked + mine().rejected > 0">
        <div class="s-row">
          <span class="s-title">{{ mine().reads }} {{ mine().reads === 1 ? 'leitura aguardando' : 'leituras aguardando' }}
            envio ao servidor</span>
          <span class="s-state">
            @if (queue.sending()) { Enviando… }
            @else if (queue.waitingRetry()) { Sem resposta do servidor — nova tentativa automática em instantes. }
          </span>
          <span class="spacer"></span>
          <button class="btn secondary sm" [disabled]="busy()" (click)="sendNow()">Enviar agora</button>
          @if (mine().blocked > 0) {
            <button class="btn secondary sm" [disabled]="busy()" (click)="retryBlocked()">Tentar retidas de novo</button>
          }
          <button class="btn ghost sm danger" [disabled]="busy()" (click)="discard()">Descartar pendências</button>
        </div>
        @if (mine().blocked > 0) {
          <p class="s-line">{{ mine().blocked }} retidas: o inventário está encerrado. Depois que o gestor
            reabrir, use "Tentar retidas de novo".</p>
        }
        @if (mine().rejected > 0) {
          <p class="s-line">{{ mine().rejected }} recusadas pelo servidor — não serão reenviadas.</p>
        }
        @if (queue.lastError(); as err) { <p class="s-line muted">Último erro: {{ err }}</p> }
        @if (inventoryId) {
          <p class="s-line muted">Concluir o setor e finalizar o inventário ficam bloqueados até o envio
            terminar: finalizar agora marcaria como "não localizados" bens que foram lidos.</p>
        }
      </div>
    }
    @if (inventoryId && others().reads > 0) {
      <div class="card sync bad">
        <div class="s-row">
          <span class="s-title">{{ others().reads }} leituras de outro inventário não enviadas</span>
          <span class="spacer"></span>
          <button class="btn ghost sm danger" [disabled]="busy()" (click)="discardOthers()">Descartar</button>
        </div>
      </div>
    }
    @if (!queue.storageOk()) {
      <div class="card sync bad"><span class="s-title">Não foi possível gravar a fila de envio neste
        aparelho. Mantenha a tela aberta até as leituras serem enviadas.</span></div>
    }
  `,
  styles: [`
    .card.sync { padding: 12px 16px; margin-bottom: 14px; border-left: 4px solid var(--warning); }
    .card.sync.bad { border-left-color: var(--danger); }
    .s-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
    .s-title { font-size: 13.5px; font-weight: 650; }
    .s-state { font-size: 12.5px; color: var(--text-soft); }
    .s-line { font-size: 12.5px; margin: 6px 0 0; color: var(--text-soft); }
    .muted { color: var(--text-faint); }
    .spacer { flex: 1; }
    .btn { font-size: 13px; font-weight: 600; border-radius: var(--radius-sm); cursor: pointer;
      padding: 7px 11px; border: 1px solid transparent; }
    .btn.secondary { background: var(--surface-2); color: var(--text); border-color: var(--border); }
    .btn.ghost { background: none; color: var(--text-soft); border-color: var(--border); }
    .btn.danger { color: var(--danger); }
    .btn:disabled { opacity: .5; cursor: default; }
  `],
})
export class ReadSyncStatusComponent {
  @Input() inventoryId: string | null = null;
  /** Emitido depois de descartar (a tela refaz a deduplicação). */
  @Output() discarded = new EventEmitter<number>();

  readonly queue = inject(ReadSyncQueue);
  readonly busy = signal(false);

  // inventoryId não é signal, mas é fixo enquanto o componente vive (a tela o recria).
  readonly mine = computed(() =>
    this.inventoryId ? this.queue.summaryFor(this.inventoryId) : this.queue.summary());
  readonly others = computed(() =>
    this.inventoryId ? this.queue.summaryExcept(this.inventoryId) : this.queue.summary());

  async sendNow() {
    await this.withBusy(() => this.queue.flushNow());
    if (this.mine().pending > 0) notify('Ainda não foi possível enviar — a fila segue tentando.', 'warning', 3000);
  }

  retryBlocked() {
    return this.withBusy(() => this.queue.retryBlocked(this.inventoryId ?? undefined));
  }

  async discard() {
    const n = this.mine().reads;
    const ok = await confirm(
      `${n} leituras ainda não chegaram ao servidor e serão <b>apagadas deste aparelho</b>. ` +
      'Os bens correspondentes podem aparecer como "não localizados" na conciliação. Descartar mesmo assim?',
      'Descartar pendências',
    );
    if (!ok) return;
    const dropped = this.queue.discard(this.inventoryId ? { inventoryId: this.inventoryId } : {});
    notify(`${dropped} leituras descartadas.`, 'warning', 3000);
    this.discarded.emit(dropped);
  }

  async discardOthers() {
    const n = this.others().reads;
    const ok = await confirm(
      `${n} leituras de outro inventário serão <b>apagadas deste aparelho</b> sem envio. Descartar?`,
      'Descartar pendências',
    );
    if (!ok || !this.inventoryId) return;
    const dropped = this.queue.discard({ except: this.inventoryId });
    notify(`${dropped} leituras descartadas.`, 'warning', 3000);
  }

  private async withBusy(fn: () => Promise<unknown>) {
    this.busy.set(true);
    try { await fn(); } finally { this.busy.set(false); }
  }
}
