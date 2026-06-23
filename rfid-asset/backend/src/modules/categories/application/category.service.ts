import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BaseCrudService } from '../../../common/base-crud.service';
import { CategoryOrmEntity } from '../infrastructure/category.orm-entity';

@Injectable()
export class CategoryService extends BaseCrudService<CategoryOrmEntity> {
  constructor(@InjectRepository(CategoryOrmEntity) repo: Repository<CategoryOrmEntity>) {
    super(repo, 'Categoria');
  }
}
