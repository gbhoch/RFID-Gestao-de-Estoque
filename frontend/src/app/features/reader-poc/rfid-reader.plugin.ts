import { registerPlugin, type PluginListenerHandle } from '@capacitor/core';

/**
 * Contrato do plugin nativo "RfidReader" (leitor TSL via Bluetooth Classic).
 * Implementação: frontend/android/app/src/main/java/com/megagoglio/rfidgestao/rfidreader/RfidReaderPlugin.kt
 *
 * Só existe dentro do app Android (Capacitor). No navegador comum não há
 * implementação web: qualquer chamada rejeita com "not implemented".
 */

export type ReaderConnectionState =
  | 'disconnected' | 'connecting' | 'connected' | 'interrupted' | 'lost' | 'undefined';

export interface ReaderDevice {
  /** MAC Bluetooth — é o valor a passar para connect(). */
  address: string;
  name: string;
  serialNumber?: string;
  info?: string;
  connected: boolean;
}

export interface ReaderStatus {
  state: ReaderConnectionState;
  connected: boolean;
  /** Scan contínuo iniciado por startInventory() (o gatilho físico não altera este campo). */
  scanning: boolean;
  /** Gatilho físico apertado agora (ver evento triggerChanged). */
  triggerPressed: boolean;
  /** Filtro EPC em vigor no plugin; prefixes vazio = sem filtro. */
  epcFilter: EpcFilterResult;
  batchIntervalMs: number;
  bluetoothPermission: boolean;
  readerName?: string;
  serialNumber?: string;
  address?: string;
  /** Motivo informado pelo SDK na última mudança de estado. */
  reason?: string;
}

export interface TagReadEvent {
  epc: string;
  rssi?: number;
}

/** Uma tag dentro de um lote do evento tagsRead. */
export interface TagBatchItem {
  epc: string;
  /** RSSI mais forte entre as leituras do lote. */
  rssi?: number;
  /** Leituras físicas desta tag dentro do lote. */
  count: number;
}

export interface TagsReadEvent {
  tags: TagBatchItem[];
}

export interface TriggerChangedEvent {
  pressed: boolean;
}

export interface EpcFilterResult {
  /** Prefixos normalizados (maiúsculas, sem repetidos/cobertos). */
  prefixes: string[];
  /**
   * Trecho aplicado no próprio leitor (Gen2 Select): o maior prefixo comum. O restante
   * é conferido no app. Ausente quando os prefixos não têm trecho comum.
   */
  hardwarePrefix?: string;
}

export interface RfidReaderPlugin {
  /** Leitores TSL pareados nas configurações de Bluetooth do Android. Pede permissão se preciso. */
  listPairedDevices(): Promise<{ devices: ReaderDevice[] }>;
  /** Inicia a conexão; o resultado chega pelo evento connectionChanged. */
  connect(options: { address: string }): Promise<ReaderStatus>;
  disconnect(): Promise<ReaderStatus>;
  startInventory(): Promise<void>;
  stopInventory(): Promise<void>;
  getStatus(): Promise<ReaderStatus>;

  /** Filtro inclusivo: só tags cujo EPC começa com algum prefixo (hex). Substitui o anterior. */
  applyEpcFilter(options: { prefixes: string[] }): Promise<EpcFilterResult>;
  clearEpcFilter(): Promise<void>;
  /** Intervalo do evento tagsRead, 50–5000 ms (padrão 200). */
  setBatchInterval(options: { intervalMs: number }): Promise<{ intervalMs: number }>;

  /** Lote de leituras deduplicado por EPC, a cada batchIntervalMs (só quando houve leitura). */
  addListener(eventName: 'tagsRead', listener: (event: TagsReadEvent) => void): Promise<PluginListenerHandle>;
  /** @deprecated Uma vez por leitura física; use tagsRead. Mantido por compatibilidade. */
  addListener(eventName: 'tagRead', listener: (event: TagReadEvent) => void): Promise<PluginListenerHandle>;
  addListener(eventName: 'triggerChanged', listener: (event: TriggerChangedEvent) => void): Promise<PluginListenerHandle>;
  addListener(eventName: 'connectionChanged', listener: (status: ReaderStatus) => void): Promise<PluginListenerHandle>;
  removeAllListeners(): Promise<void>;
}

export const RfidReader = registerPlugin<RfidReaderPlugin>('RfidReader');
