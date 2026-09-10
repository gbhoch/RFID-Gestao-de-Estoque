import {
  Directive, EventEmitter, HostListener, Input, OnDestroy, Output,
} from '@angular/core';
import { normalizeHex, validateWordHex, EPC_MAX_BITS } from './gen2.util';

/**
 * Captura leituras de um leitor RFID em modo teclado (HID keyboard-wedge).
 *
 * O leitor "digita" o EPC (hex) no input focado — muitas vezes em modo
 * contínuo, o que faz os EPCs de várias leituras se concatenarem no mesmo
 * campo. Esta diretiva separa o fluxo de teclas em leituras individuais e
 * emite UM EPC limpo e já validado (`reading`) por etiqueta lida.
 *
 * Segmentação (agnóstica de hardware, sem limite fixo de caracteres — funciona
 * de 96 até 512 bits):
 *  - Rajada por tempo: as teclas do leitor chegam muito mais rápido que a
 *    digitação humana. Um intervalo entre teclas acima de `burstGapMs` encerra
 *    a leitura corrente e começa outra.
 *  - Terminador Tab: alguns leitores enviam Tab após cada tag — encerra a
 *    leitura e evita que o foco saia do campo. (Enter é deixado para o
 *    componente tratar seu fluxo manual.)
 *  - Digitação humana (lenta) nunca acumula uma leitura válida → a diretiva
 *    fica em silêncio e o input continua funcionando para entrada manual.
 *
 * Dica de robustez: se o leitor puder ser configurado para enviar um sufixo
 * (CR/Tab) por tag, a segmentação fica 100% determinística.
 */
@Directive({
  selector: '[appReaderCapture]',
  standalone: true,
})
export class ReaderCaptureDirective implements OnDestroy {
  /** Intervalo máximo (ms) entre teclas da mesma leitura. Acima disso, encerra. */
  @Input() burstGapMs = 60;
  /** Mínimo de dígitos hex para considerar uma leitura válida (filtra ruído). */
  @Input() minHexLen = 16; // 64 bits
  /** Emite um EPC limpo (hex, alinhado a word) por etiqueta lida. */
  @Output() reading = new EventEmitter<string>();

  private buffer = '';
  private lastKeyAt = 0;
  private idleTimer: any = null;

  @HostListener('keydown', ['$event'])
  onKeydown(e: KeyboardEvent) {
    const key = e.key;

    // Tab: terminador de leitura (sem deixar o foco escapar do campo).
    if (key === 'Tab' && this.buffer) {
      e.preventDefault();
      this.commit();
      return;
    }

    // Só interessam caracteres únicos (dígitos hex); ignora setas, Shift, etc.
    if (key.length !== 1) return;

    const now = performance.now();
    const gap = now - this.lastKeyAt;
    this.lastKeyAt = now;

    // Intervalo grande → nova leitura (ou digitação humana): recomeça o buffer.
    if (gap > this.burstGapMs) this.buffer = '';
    this.buffer += key;

    // (Re)agenda o encerramento por ociosidade.
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => this.commit(), this.burstGapMs);
  }

  private commit() {
    if (this.idleTimer) { clearTimeout(this.idleTimer); this.idleTimer = null; }
    const epc = normalizeHex(this.buffer);
    this.buffer = '';
    if (epc.length < this.minHexLen) return;                     // ruído / parcial
    if (validateWordHex(epc, { maxBits: EPC_MAX_BITS })) return; // hex inválido/desalinhado
    this.reading.emit(epc);
  }

  ngOnDestroy() { if (this.idleTimer) clearTimeout(this.idleTimer); }
}
