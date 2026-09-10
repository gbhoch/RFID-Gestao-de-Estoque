import {
  Injectable, Logger, BadRequestException,
  ServiceUnavailableException, InternalServerErrorException,
} from '@nestjs/common';
import {
  RfidReaderPort, ReadBankParams, WriteBankParams, LockBankParams, InventoryTag,
} from './rfid-reader.stub';

/**
 * Adapter real da RfidReaderPort: encaminha as operações físicas para o
 * "reader-bridge" — um agente que roda na máquina/rede do leitor (Windows)
 * e chama as CF*Api.dll. O backend continua portátil (Docker/Linux).
 *
 * Ativado quando READER_BRIDGE_URL está definido (ver rfid-tags.module.ts).
 * Sem a variável, usa-se o StubRfidReaderService (503 "aguardando leitor").
 */
@Injectable()
export class HttpBridgeReaderService implements RfidReaderPort {
  private readonly logger = new Logger(HttpBridgeReaderService.name);
  private readonly baseUrl = (process.env.READER_BRIDGE_URL ?? '').replace(/\/+$/, '');
  private readonly timeoutMs = Number(process.env.READER_BRIDGE_TIMEOUT ?? 15000);

  async inventory(): Promise<{ tags: InventoryTag[] }> {
    const data = await this.call('inventory', {});
    return { tags: data?.tags ?? [] };
  }
  async readBank(params: ReadBankParams): Promise<{ dataHex: string }> {
    return this.call('read-bank', params);
  }
  async writeBank(params: WriteBankParams): Promise<void> {
    await this.call('write-bank', params);
  }
  async lockBank(params: LockBankParams): Promise<void> {
    await this.call('lock', params);
  }

  private async call(path: string, body: unknown): Promise<any> {
    if (!this.baseUrl)
      throw new ServiceUnavailableException(
        'Leitor RFID não conectado — configure READER_BRIDGE_URL',
      );

    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (e: any) {
      this.logger.warn(`Bridge inacessível em ${this.baseUrl}/${path}: ${e?.message ?? e}`);
      throw new ServiceUnavailableException(
        `Bridge do leitor inacessível: ${e?.message ?? 'sem resposta'}`,
      );
    }

    const text = await res.text();
    const data = text ? this.safeJson(text) : {};
    if (!res.ok) {
      const msg = data?.message ?? `Bridge retornou HTTP ${res.status}`;
      if (res.status === 400) throw new BadRequestException(msg);
      if (res.status === 503) throw new ServiceUnavailableException(msg);
      throw new InternalServerErrorException(msg);
    }
    return data;
  }

  private safeJson(text: string): any {
    try { return JSON.parse(text); } catch { return { message: text }; }
  }
}
