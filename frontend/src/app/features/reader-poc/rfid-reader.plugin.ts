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

export interface RfidReaderPlugin {
  /** Leitores TSL pareados nas configurações de Bluetooth do Android. Pede permissão se preciso. */
  listPairedDevices(): Promise<{ devices: ReaderDevice[] }>;
  /** Inicia a conexão; o resultado chega pelo evento connectionChanged. */
  connect(options: { address: string }): Promise<ReaderStatus>;
  disconnect(): Promise<ReaderStatus>;
  startInventory(): Promise<void>;
  stopInventory(): Promise<void>;
  getStatus(): Promise<ReaderStatus>;

  /** Uma vez por leitura física — a mesma tag chega várias vezes. */
  addListener(eventName: 'tagRead', listener: (event: TagReadEvent) => void): Promise<PluginListenerHandle>;
  addListener(eventName: 'connectionChanged', listener: (status: ReaderStatus) => void): Promise<PluginListenerHandle>;
  removeAllListeners(): Promise<void>;
}

export const RfidReader = registerPlugin<RfidReaderPlugin>('RfidReader');
