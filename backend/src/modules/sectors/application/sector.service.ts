import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BaseCrudService } from '../../../common/base-crud.service';
import { SectorOrmEntity } from '../infrastructure/sector.orm-entity';

@Injectable()
export class SectorService extends BaseCrudService<SectorOrmEntity> {
  constructor(
    @InjectRepository(SectorOrmEntity) repo: Repository<SectorOrmEntity>,
  ) {
    super(repo, 'Setor');
  }
}
