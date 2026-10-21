import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { Subject } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { InventoryApi, type ReadItemBody } from './inventory.api';

/** Leitura guardada na fila. readAt é o momento da captura (o envio pode ser bem depois). */
export interface QueuedRead extends ReadItemBody {
  readAt: string;
}

/**
 * pending  = aguardando envio (ou nova tentativa);
 * blocked  = 409: inventário encerrado — fica retido até o gestor reabrir e alguém pedir
 *            nova tentativa (mesma regra do coletor Android);
 * rejected = outro 4xx: o servidor recusou o lote; não adianta reenviar.
 */
export type BatchState = 'pending' | 'blocked' | 'rejected';

export interface ReadBatch {
  /** Chave de idempotência (índice único client_batch_id + epc no backend). */
  clientBatchId: string;
  inventoryId: string;
  /** Visita do momento da leitura — não a selecionada na hora do envio. */
  sectorVisitId: string;
  reads: QueuedRead[];
  state: BatchState;
  attempts: number;
  createdAt: string;
  lastError?: string;
}

export interface QueueSummary {
  /** Leituras ainda não aceitas pelo servidor (pendentes + retidas + recusadas). */
  reads: number;
  pending: number;
  blocked: number;
  rejected: number;
  batches: number;
}

const KEY_PREFIX = 'rfid_read_queue:v1:';
/** ~130 bytes por leitura: 200 ficam bem abaixo do limite de 100 kB do body-parser. */
export const MAX_READS_PER_BATCH = 200;
/** Leituras que chegam juntas vão no mesmo lote: espera 600 ms de calma, no máximo 1,5 s. */
const COALESCE_IDLE_MS = 600;
const COALESCE_MAX_MS = 1500;
const BACKOFF_MIN_MS = 2000;
const BACKOFF_MAX_MS = 60000;

type Outcome =
  | { kind: 'retry'; message: string }
  | { kind: 'blocked'; message: string }
  | { kind: 'rejected'; message: string };

/**
 * Fila de envio das leituras do inventário (teclado/HID, registro manual e leitor via
 * Capacitor passam todos por aqui).
 *
 * - Persistida no localStorage, numa chave POR USUÁRIO: num PC compartilhado as
 *   pendências de um usuário nunca sobem na sessão de outro. Sobrevive a reload,
 *   logout e expiração da sessão; volta a enviar no próximo login do mesmo usuário.
 * - Envio sequencial, um lote por vez, com o mesmo clientBatchId em todas as tentativas.
 * - Classificação de erro igual à do SyncRepository do app nativo: rede/5xx/408/429/401
 *   tentam de novo (backoff 2 s → 60 s), 409 retém, demais 4xx recusam.
 * - Tenta de novo também quando a rede volta (evento `online`) e quando o app volta do
 *   segundo plano.
 */
@Injectable({ providedIn: 'root' })
export class ReadSyncQueue {
  private api = inject(InventoryApi);
  private auth = inject(AuthService);

  private owner: string | null = null;
  private readonly list = signal<ReadBatch[]>([]);
  readonly batches = this.list.asReadonly();

  readonly summary = computed(() => summarize(this.list()));
  /** Última falha de envio (some no próximo envio bem-sucedido). */
  readonly lastError = signal<string | null>(null);
  /** true enquanto espera o backoff para tentar de novo. */
  readonly waitingRetry = signal(false);
  readonly sending = signal(false);
  /** false se o localStorage recusou gravar: a fila só existe em memória até lá. */
  readonly storageOk = signal(true);
  /** Pendências encontradas ao entrar (sessão anterior expirada, reload, app fechado). */
  readonly restored = signal<QueueSummary | null>(null);

  /** Emitido a cada lote aceito pelo servidor (a tela recarrega o painel). */
  readonly sent$ = new Subject<ReadBatch>();

  /** Lote ainda aberto para receber leituras (nunca é um lote já enviado). */
  private openBatchId: string | null = null;
  private openSince = 0;
  private coalesceTimer: ReturnType<typeof setTimeout> | null = null;
  private backoffTimer: ReturnType<typeof setTimeout> | null = null;
  private failures = 0;
  private running: Promise<void> | null = null;

  constructor() {
    effect(() => {
      const userId = this.auth.userId();
      untracked(() => this.switchOwner(userId));
    });
    window.addEventListener('online', () => this.flushNow());
    // visibilitychange cobre o navegador; pause/resume são os eventos de document que o
    // Capacitor dispara quando o app vai/volta do segundo plano.
    document.addEventListener('visibilitychange', () => this.flushNow());
    document.addEventListener('pause', () => this.flushNow());
    document.addEventListener('resume', () => this.flushNow());
  }

  // ------------------------------------------------------------------ consulta

  summaryFor(inventoryId: string, sectorVisitId?: string): QueueSummary {
    return summarize(this.list().filter((b) =>
      b.inventoryId === inventoryId && (!sectorVisitId || b.sectorVisitId === sectorVisitId)));
  }

  /** Resumo do que NÃO é deste inventário (sobras de inventários anteriores). */
  summaryExcept(inventoryId: string): QueueSummary {
    return summarize(this.list().filter((b) => b.inventoryId !== inventoryId));
  }

  /** Leituras ainda não aceitas pelo servidor para a visita, deduplicadas por EPC. */
  unsentReadsFor(inventoryId: string, sectorVisitId: string): Map<string, QueuedRead & { state: BatchState }> {
    const out = new Map<string, QueuedRead & { state: BatchState }>();
    for (const b of this.list()) {
      if (b.inventoryId !== inventoryId || b.sectorVisitId !== sectorVisitId) continue;
      for (const r of b.reads) if (!out.has(r.epc)) out.set(r.epc, { ...r, state: b.state });
    }
    return out;
  }

  // ---------------------------------------------------------------- operações

  /** Grava as leituras na fila (já persistidas ao retornar) e agenda o envio. */
  enqueue(inventoryId: string, sectorVisitId: string, reads: QueuedRead[]) {
    if (!this.owner || !reads.length) return;
    const owner = this.owner;
    this.mutate(owner, (list) => {
      const next = [...list];
      let rest = reads;
      while (rest.length) {
        let open = this.openBatchId ? next.find((b) => b.clientBatchId === this.openBatchId) : undefined;
        if (!open || open.inventoryId !== inventoryId || open.sectorVisitId !== sectorVisitId
          || open.reads.length >= MAX_READS_PER_BATCH) {
          open = {
            clientBatchId: uuidV4(), inventoryId, sectorVisitId, reads: [],
            state: 'pending', attempts: 0, createdAt: new Date().toISOString(),
          };
          next.push(open);
          this.openBatchId = open.clientBatchId;
          this.openSince = Date.now();
        }
        const room = MAX_READS_PER_BATCH - open.reads.length;
        const updated = { ...open, reads: [...open.reads, ...rest.slice(0, room)] };
        next[next.indexOf(open)] = updated;
        rest = rest.slice(room);
      }
      return next;
    });
    this.scheduleCoalesced();
  }

  /**
   * Envia agora tudo o que estiver pendente (ignora o backoff) e resolve quando a fila
   * esvaziar ou a primeira tentativa falhar.
   */
  async flushNow(): Promise<void> {
    this.clearTimers();
    if (this.running) await this.running;
    await this.kick();
  }

  /** Devolve os lotes retidos (409) para a fila — use depois que o gestor reabrir. */
  retryBlocked(inventoryId?: string) {
    if (!this.owner) return Promise.resolve();
    this.mutate(this.owner, (list) => list.map((b) =>
      b.state === 'blocked' && (!inventoryId || b.inventoryId === inventoryId)
        ? { ...b, state: 'pending' as const } : b));
    return this.flushNow();
  }

  /**
   * Remove da fila, sem enviar, os lotes do inventário (ou todos, sem inventoryId; ou os
   * de outros inventários, com `except`). Registra no console — no app Android vai para
   * o logcat, tag Capacitor/Console.
   */
  discard(scope: { inventoryId?: string; except?: string }): number {
    if (!this.owner) return 0;
    const matches = (b: ReadBatch) =>
      (!scope.inventoryId || b.inventoryId === scope.inventoryId)
      && (!scope.except || b.inventoryId !== scope.except);
    const dropped = this.list().filter(matches);
    if (!dropped.length) return 0;
    const reads = dropped.reduce((n, b) => n + b.reads.length, 0);
    if (dropped.some((b) => b.clientBatchId === this.openBatchId)) this.openBatchId = null;
    this.mutate(this.owner, (list) => list.filter((b) => !matches(b)));
    console.warn(
      `[ReadSyncQueue] Pendências descartadas pelo usuário ${this.owner}: ${reads} leituras em ${dropped.length} lote(s).`,
      dropped.map((b) => ({
        clientBatchId: b.clientBatchId, inventoryId: b.inventoryId, sectorVisitId: b.sectorVisitId,
        state: b.state, attempts: b.attempts, lastError: b.lastError,
        epcs: b.reads.map((r) => r.epc),
      })),
    );
    return reads;
  }

  // ------------------------------------------------------------------- envio

  private kick(): Promise<void> {
    if (!this.running) this.running = this.drain().finally(() => { this.running = null; });
    return this.running;
  }

  private async drain() {
    const owner = this.owner;
    if (!owner) return;
    this.sending.set(true);
    try {
      while (this.owner === owner) {
        const next = this.list().find((b) => b.state === 'pending');
        if (!next) { this.failures = 0; return; }
        // O lote em envio não recebe mais leituras: as próximas abrem outro lote.
        if (next.clientBatchId === this.openBatchId) this.openBatchId = null;
        this.mutate(owner, (list) => list.map((b) =>
          b.clientBatchId === next.clientBatchId ? { ...b, attempts: b.attempts + 1 } : b));
        try {
          await this.api.addReadBatch(next.inventoryId, {
            sectorVisitId: next.sectorVisitId, clientBatchId: next.clientBatchId, reads: next.reads,
          });
          this.mutate(owner, (list) => list.filter((b) => b.clientBatchId !== next.clientBatchId));
          this.failures = 0;
          this.lastError.set(null);
          this.sent$.next(next);
        } catch (e) {
          const outcome = classify(e);
          if (outcome.kind === 'retry') {
            this.mutate(owner, (list) => list.map((b) =>
              b.clientBatchId === next.clientBatchId ? { ...b, lastError: outcome.message } : b));
            this.lastError.set(outcome.message);
            this.failures++;
            this.scheduleBackoff();
            return;
          }
          // Retido/recusado não segura o resto da fila (pode ser de outro inventário).
          this.mutate(owner, (list) => list.map((b) =>
            b.clientBatchId === next.clientBatchId ? { ...b, state: outcome.kind, lastError: outcome.message } : b));
          this.lastError.set(outcome.message);
        }
      }
    } finally {
      this.sending.set(false);
    }
  }

  private scheduleCoalesced() {
    if (this.backoffTimer || this.running) return; // backoff ou envio em curso: segue o ciclo dele
    if (this.coalesceTimer) clearTimeout(this.coalesceTimer);
    const wait = Math.max(0, Math.min(COALESCE_IDLE_MS, this.openSince + COALESCE_MAX_MS - Date.now()));
    this.coalesceTimer = setTimeout(() => { this.coalesceTimer = null; this.kick(); }, wait);
  }

  private scheduleBackoff() {
    const delay = Math.min(BACKOFF_MAX_MS, BACKOFF_MIN_MS * 2 ** Math.max(0, this.failures - 1));
    if (this.backoffTimer) clearTimeout(this.backoffTimer);
    this.waitingRetry.set(true);
    this.backoffTimer = setTimeout(() => {
      this.backoffTimer = null;
      this.waitingRetry.set(false);
      this.kick();
    }, delay);
  }

  private clearTimers() {
    if (this.coalesceTimer) { clearTimeout(this.coalesceTimer); this.coalesceTimer = null; }
    if (this.backoffTimer) { clearTimeout(this.backoffTimer); this.backoffTimer = null; }
    this.waitingRetry.set(false);
  }

  // ------------------------------------------------------------- persistência

  private switchOwner(userId: string | null) {
    if (userId === this.owner) return;
    this.clearTimers();
    this.owner = userId;
    this.openBatchId = null;
    this.failures = 0;
    this.lastError.set(null);
    const list = userId ? this.load(userId) : [];
    this.list.set(list);
    const s = summarize(list);
    this.restored.set(s.reads ? s : null);
    if (s.pending) this.kick();
  }

  /** Aplica a mudança na lista do dono (em memória se for o atual) e grava. */
  private mutate(owner: string, fn: (list: ReadBatch[]) => ReadBatch[]) {
    if (owner === this.owner) {
      const next = fn(this.list());
      this.list.set(next);
      this.persist(owner, next);
    } else {
      // Resposta de um envio que terminou depois do logout/troca de usuário.
      this.persist(owner, fn(this.load(owner)));
    }
  }

  private load(owner: string): ReadBatch[] {
    try {
      const raw = localStorage.getItem(KEY_PREFIX + owner);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.filter(isBatch) : [];
    } catch {
      return [];
    }
  }

  private persist(owner: string, list: ReadBatch[]) {
    try {
      if (list.length) localStorage.setItem(KEY_PREFIX + owner, JSON.stringify(list));
      else localStorage.removeItem(KEY_PREFIX + owner);
      this.storageOk.set(true);
    } catch {
      this.storageOk.set(false);
    }
  }
}

function summarize(list: ReadBatch[]): QueueSummary {
  const s: QueueSummary = { reads: 0, pending: 0, blocked: 0, rejected: 0, batches: list.length };
  for (const b of list) {
    s.reads += b.reads.length;
    s[b.state] += b.reads.length;
  }
  return s;
}

function classify(e: unknown): Outcome {
  if (!(e instanceof HttpErrorResponse)) {
    return { kind: 'retry', message: 'Falha inesperada ao enviar leituras.' };
  }
  const message = typeof e.error?.message === 'string' ? e.error.message : '';
  const s = e.status;
  if (s === 0) return { kind: 'retry', message: 'Sem conexão com o servidor.' };
  if (s === 401) return { kind: 'retry', message: 'Sessão expirada — faça login para continuar o envio.' };
  if (s === 408 || s === 429 || s >= 500) return { kind: 'retry', message: `Servidor indisponível (HTTP ${s}).` };
  if (s === 409) return { kind: 'blocked', message: message || 'Inventário encerrado.' };
  return { kind: 'rejected', message: message || `Lote recusado pelo servidor (HTTP ${s}).` };
}

function isBatch(b: any): b is ReadBatch {
  return b && typeof b.clientBatchId === 'string' && typeof b.inventoryId === 'string'
    && typeof b.sectorVisitId === 'string' && Array.isArray(b.reads)
    && (b.state === 'pending' || b.state === 'blocked' || b.state === 'rejected');
}

/**
 * UUID v4 com crypto.getRandomValues: crypto.randomUUID só existe em contexto seguro
 * (HTTPS/localhost), e o app Capacitor carrega o sistema por http://IP.
 */
function uuidV4(): string {
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
