import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BaseCrudService } from '../../../common/base-crud.service';
import { RfidTagOrmEntity } from '../infrastructure/rfid-tag.orm-entity';

@Injectable()
export class RfidTagService extends BaseCrudService<RfidTagOrmEntity> {
  constructor(@InjectRepository(RfidTagOrmEntity) repo: Repository<RfidTagOrmEntity>) {
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
}
