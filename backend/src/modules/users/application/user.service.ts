import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike, FindOptionsWhere } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { UserEntity } from '../../auth/infrastructure/auth.orm-entity';
import { CreateUserDto, UpdateUserDto } from './dtos/user.dto';

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(UserEntity) private repo: Repository<UserEntity>,
  ) {}

  private strip(u: UserEntity): any {
    const { passwordHash, ...rest } = u;
    return rest;
  }

  async create(dto: CreateUserDto) {
    // O e-mail é opcional. Montar a condição como [{login}, {email: undefined}]
    // seria uma armadilha: o TypeORM DESCARTA chaves undefined, o segundo ramo
    // vira {} e casa com qualquer usuário — todo cadastro sem e-mail seria
    // recusado como duplicado. Por isso o ramo só entra quando há valor.
    const where: FindOptionsWhere<UserEntity>[] = [{ login: dto.login }];
    if (dto.email) where.push({ email: dto.email });

    const exists = await this.repo.findOne({ where });
    if (exists) {
      throw new ConflictException(
        exists.login === dto.login ? 'Login já cadastrado' : 'E-mail já cadastrado',
      );
    }

    const { password, ...data } = dto;
    const user = this.repo.create({
      ...data,
      email: dto.email ?? null,
      passwordHash: await bcrypt.hash(password, 12),
      status: 'active',
    });
    return this.strip(await this.repo.save(user));
  }

  async update(id: string, dto: UpdateUserDto) {
    const user = await this.findEntity(id);
    const { password, ...data } = dto;
    Object.assign(user, data);
    if (password) user.passwordHash = await bcrypt.hash(password, 12);
    return this.strip(await this.repo.save(user));
  }

  async findOne(id: string) {
    return this.strip(await this.findEntity(id));
  }

  private async findEntity(id: string): Promise<UserEntity> {
    const u = await this.repo.findOne({ where: { id } });
    if (!u) throw new NotFoundException('Usuário não encontrado');
    return u;
  }

  async list(params: { skip?: number; take?: number; search?: string }) {
    const where = params.search ? { name: ILike(`%${params.search}%`) } : {};
    const [rows, total] = await this.repo.findAndCount({
      where,
      skip: Number(params.skip ?? 0),
      take: Number(params.take ?? 20),
      order: { createdAt: 'DESC' },
    });
    return { data: rows.map((r) => this.strip(r)), total };
  }

  async setStatus(id: string, status: 'active' | 'blocked' | 'inactive') {
    const user = await this.findEntity(id);
    user.status = status;
    if (status === 'active') {
      user.failedAttempts = 0;
      user.blockedUntil = null;
    }
    return this.strip(await this.repo.save(user));
  }

  async remove(id: string) {
    await this.findEntity(id);
    await this.repo.softDelete(id);
  }
}
