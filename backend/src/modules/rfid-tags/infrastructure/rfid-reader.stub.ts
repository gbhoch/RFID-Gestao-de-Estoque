import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { Gen2Bank } from '../domain/gen2';

/** Token de injeção da porta do leitor. O adapter real do SDK usa o mesmo token. */
export const RFID_READER = Symbol('RFID_READER');

export interface ReadBankParams {
  epc?: string; // seleciona a tag no campo de leitura (opcional em leitor single-tag)
  bank: Gen2Bank;
  wordPtr: number; // endereço inicial em words
  wordCount: number; // quantidade de words a ler
  accessPassword?: string;
}

export interface WriteBankParams {
  epc?: string;
  bank: Gen2Bank;
  wordPtr: number;
  dataHex: string; // dados alinhados a word (múltiplo de 4 dígitos hex)
  accessPassword?: string;
}

export interface LockBankParams {
  epc?: string;
  bank: Gen2Bank;
  lock: boolean; // true = travar, false = destravar
  permanent?: boolean; // permalock (irreversível)
  accessPassword?: string;
}

/** Etiqueta detectada num inventário (varredura do campo do leitor). */
export interface InventoryTag {
  epc: string;
  tid?: string;
  rssi?: number;
}

/**
 * Porta (contrato) das operações físicas do leitor RFID.
 * O service da etiqueta depende apenas desta interface — o SDK real será
 * um adapter que a implementa e é registrado no token RFID_READER.
 */
export interface RfidReaderPort {
  inventory(): Promise<{ tags: InventoryTag[] }>;
  readBank(params: ReadBankParams): Promise<{ dataHex: string }>;
  writeBank(params: WriteBankParams): Promise<void>;
  lockBank(params: LockBankParams): Promise<void>;
}

/**
 * Implementação temporária até o SDK do leitor ser integrado.
 * Responde 503 para que a UI exiba "aguardando leitor". Trocar por um
 * adapter real (ex.: ChafonReaderService) não exige mudar service/controller.
 */
@Injectable()
export class StubRfidReaderService implements RfidReaderPort {
  private unavailable() {
    return new ServiceUnavailableException(
      'Leitor RFID não conectado — SDK pendente',
    );
  }

  async inventory(): Promise<{ tags: InventoryTag[] }> {
    throw this.unavailable();
  }
  async readBank(_params: ReadBankParams): Promise<{ dataHex: string }> {
    throw this.unavailable();
  }
  async writeBank(_params: WriteBankParams): Promise<void> {
    throw this.unavailable();
  }
  async lockBank(_params: LockBankParams): Promise<void> {
    throw this.unavailable();
  }
}
