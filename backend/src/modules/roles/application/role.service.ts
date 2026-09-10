import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, Repository } from 'typeorm';
import { RoleEntity } from '../../auth/infrastructure/auth.orm-entity';

/**
 * Lista os perfis de acesso para popular o dropdown de "Perfil" no cadastro de
 * usuários. Devolve apenas id/name/description (sem permissões) no formato
 * { data, total } esperado pelos lookups do frontend.
 */
@Injectable()
export class RoleService {
  constructor(
    @InjectRepository(RoleEntity) private repo: Repository<RoleEntity>,
  ) {}

  private view(r: RoleEntity) {
    return { id: r.id, name: r.name, description: r.description };
  }

  async list(params: { skip?: number; take?: number; search?: string }) {
    const where = params.search ? { name: ILike(`%${params.search}%`) } : {};
    const [rows, total] = await this.repo.findAndCount({
      where,
      skip: Number(params.skip ?? 0),
      take: Number(params.take ?? 200),
      order: { name: 'ASC' },
    });
    return { data: rows.map((r) => this.view(r)), total };
  }

  /**
   * Busca por id. É o `byKey` dos lookups do frontend: o DevExtreme chama esta
   * rota para resolver o NOME a partir do id guardado no registro. Sem ela o
   * campo "Perfil" exibia o UUID cru em vez de "operator".
   */
  async findOne(id: string) {
    const role = await this.repo.findOne({ where: { id } });
    if (!role) throw new NotFoundException('Perfil não encontrado');
    return this.view(role);
  }
}
