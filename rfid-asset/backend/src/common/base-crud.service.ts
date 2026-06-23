import { NotFoundException } from '@nestjs/common';
import { Repository, ObjectLiteral, ILike, FindOptionsWhere } from 'typeorm';

export interface ListParams {
  skip?: number;
  take?: number;
  search?: string;
  searchField?: string;
  where?: Record<string, unknown>;
}

/**
 * Base de CRUD com soft delete, paginação server-side e busca.
 * Módulos simples (setores, categorias) estendem isto e ganham
 * create/update/findOne/list/remove de graça.
 */
export abstract class BaseCrudService<T extends ObjectLiteral> {
  protected constructor(
    protected readonly repo: Repository<T>,
    protected readonly entityName = 'Registro',
  ) {}

  async create(dto: Partial<T>): Promise<T> {
    return this.repo.save(this.repo.create(dto as T));
  }

  async update(id: string, dto: Partial<T>): Promise<T> {
    await this.findOne(id);
    await this.repo.update(id, dto as any);
    return this.findOne(id);
  }

  async findOne(id: string): Promise<T> {
    const found = await this.repo.findOne({ where: { id } as FindOptionsWhere<T> });
    if (!found) throw new NotFoundException(`${this.entityName} não encontrado`);
    return found;
  }

  async list(params: ListParams): Promise<{ data: T[]; total: number }> {
    const where: any = { ...(params.where ?? {}) };
    if (params.search && params.searchField)
      where[params.searchField] = ILike(`%${params.search}%`);

    const [data, total] = await this.repo.findAndCount({
      where,
      skip: Number(params.skip ?? 0),
      take: Number(params.take ?? 20),
      order: { createdAt: 'DESC' } as any,
    });
    return { data, total };
  }

  async remove(id: string): Promise<void> {
    await this.findOne(id);
    await this.repo.softDelete(id);
  }
}
