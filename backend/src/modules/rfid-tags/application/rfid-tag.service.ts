import { Injectable, BadRequestException, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BaseCrudService } from '../../../common/base-crud.service';
import { RfidTagOrmEntity } from '../infrastructure/rfid-tag.orm-entity';
import { RFID_READER, RfidReaderPort } from '../infrastructure/rfid-reader.stub';
import {
  Gen2Bank, hexBits, hexWords, normalizeHex, isHexWordAligned, GEN2_BANK_LABELS,
} from '../domain/gen2';
import { ReadBankDto, WriteBankDto, LockBankDto } from './dtos/rfid-tag.dto';

// Quantidade padrão de words lidas por banco quando o cliente não especifica.
function defaultWordCount(bank: Gen2Bank): number {
  switch (bank) {
    case Gen2Bank.EPC: return 6; // 96 bits
    case Gen2Bank.TID: return 6;
    case Gen2Bank.USER: return 4;
    default: return 2;
  }
}
// Ponteiro inicial padrão: EPC começa na word 2 (após CRC e PC).
const defaultWordPtr = (bank: Gen2Bank): number => (bank === Gen2Bank.EPC ? 2 : 0);

@Injectable()
export class RfidTagService extends BaseCrudService<RfidTagOrmEntity> {
  constructor(
    @InjectRepository(RfidTagOrmEntity) repo: Repository<RfidTagOrmEntity>,
    @Inject(RFID_READER) private reader: RfidReaderPort,
  ) {
    super(repo, 'Etiqueta RFID');
  }

  // Transições de status com regra: toda mudança preserva histórico via audit log.
  async changeStatus(id: string, status: string) {
    const tag = await this.findOne(id);
    if (tag.status === 'retired')
      throw new BadRequestException('Etiqueta já recebeu baixa definitiva');
    return this.update(id, { status } as any);
  }

  inactivate(id: string) { return this.changeStatus(id, 'inactive'); }
  reactivate(id: string) { return this.changeStatus(id, 'active'); }
  retire(id: string) { return this.changeStatus(id, 'retired'); }

  // ---- Operações físicas de banco de memória Gen2 ----

  /** Varre o campo do leitor e devolve as etiquetas detectadas (EPC/TID). */
  inventory() {
    return this.reader.inventory();
  }

  /** Lê um banco via leitor e reflete o resultado no cadastro. */
  async readBank(id: string, dto: ReadBankDto) {
    const tag = await this.findOne(id);
    const { dataHex } = await this.reader.readBank({
      epc: tag.epc,
      bank: dto.bank,
      wordPtr: dto.wordPtr ?? defaultWordPtr(dto.bank),
      wordCount: dto.wordCount ?? defaultWordCount(dto.bank),
      accessPassword: dto.accessPassword,
    });
    const hex = normalizeHex(dataHex);
    if (!isHexWordAligned(hex))
      throw new BadRequestException('Retorno do leitor não está alinhado a word');
    return this.applyBankData(id, dto.bank, hex, { readback: true });
  }

  /** Grava um banco via leitor e reflete o valor no cadastro. */
  async writeBank(id: string, dto: WriteBankDto) {
    await this.findOne(id);
    const hex = normalizeHex(dto.dataHex);
    if (!isHexWordAligned(hex))
      throw new BadRequestException(
        'Dados devem ser hexadecimais alinhados a word (múltiplo de 4 dígitos)',
      );
    if (dto.bank === Gen2Bank.TID)
      throw new BadRequestException('Banco TID é somente leitura');

    const tag = await this.findOne(id);
    const wordPtr = dto.wordPtr ?? defaultWordPtr(dto.bank);
    await this.reader.writeBank({
      epc: tag.epc,
      bank: dto.bank,
      wordPtr,
      dataHex: hex,
      accessPassword: dto.accessPassword,
    });
    return this.applyBankData(id, dto.bank, hex, { readback: false, wordPtr });
  }

  /** Trava/destrava um banco e registra o estado de lock. */
  async lockBank(id: string, dto: LockBankDto) {
    const tag = await this.findOne(id);
    await this.reader.lockBank({
      epc: tag.epc,
      bank: dto.bank,
      lock: dto.lock,
      permanent: dto.permanent,
      accessPassword: dto.accessPassword,
    });
    const lockState = {
      ...(tag.lockState ?? {}),
      [GEN2_BANK_LABELS[dto.bank]]: {
        locked: dto.lock,
        permanent: !!dto.permanent,
        at: new Date().toISOString(),
      },
    };
    return this.update(id, { lockState } as any);
  }

  /** Persiste o dado de um banco no campo correspondente da etiqueta. */
  private applyBankData(
    id: string,
    bank: Gen2Bank,
    hex: string,
    opts: { readback: boolean; wordPtr?: number },
  ) {
    const patch: Partial<RfidTagOrmEntity> = { lastReadAt: new Date() };
    switch (bank) {
      case Gen2Bank.EPC:
        patch.epc = hex; patch.epcBits = hexBits(hex); patch.epcWordCount = hexWords(hex);
        break;
      case Gen2Bank.TID:
        patch.tid = hex; patch.tidBits = hexBits(hex);
        break;
      case Gen2Bank.USER:
        patch.userMemory = hex; patch.userBits = hexBits(hex);
        break;
      case Gen2Bank.RESERVED:
        // Senhas não são lidas em claro; só refletimos numa gravação.
        // words 0-1 = kill, words 2-3 = access (ver Gen2).
        if (!opts.readback) {
          if ((opts.wordPtr ?? 0) >= 2) patch.accessPassword = hex;
          else patch.killPassword = hex;
        }
        break;
    }
    return this.update(id, patch as any);
  }
}
