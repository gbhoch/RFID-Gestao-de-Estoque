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

  async create(dto: Partial<SectorOrmEntity>) {
    return super.create(this.normalize(dto));
  }

  async update(id: string, dto: Partial<SectorOrmEntity>) {
    return super.update(id, this.normalize(dto));
  }

  // Sigla é opcional e UNIQUE: converte '' / só-espaços em NULL para não
  // colidir na constraint quando o campo é deixado em branco no popup.
  private normalize(dto: Partial<SectorOrmEntity>) {
    if ('acronym' in dto && !dto.acronym?.trim()) dto.acronym = null;
    return dto;
  }
}
