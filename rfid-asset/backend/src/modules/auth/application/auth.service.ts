import {
  Injectable, UnauthorizedException, ForbiddenException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { createHash } from 'crypto';
import {
  UserEntity, RefreshTokenEntity,
} from '../infrastructure/auth.orm-entity';
import { JwtPayload } from './dtos/auth.dto';

@Injectable()
export class AuthService {
  private readonly maxAttempts = Number(process.env.MAX_LOGIN_ATTEMPTS ?? 5);

  constructor(
    @InjectRepository(UserEntity) private users: Repository<UserEntity>,
    @InjectRepository(RefreshTokenEntity)
    private refreshTokens: Repository<RefreshTokenEntity>,
    private jwt: JwtService,
  ) {}

  private hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private async issueTokens(user: UserEntity, ip?: string) {
    const permissions = user.role?.permissions?.map((p) => p.code) ?? [];
    const payload: JwtPayload = {
      sub: user.id,
      login: user.login,
      role: user.role?.name,
      permissions,
    };

    const accessToken = await this.jwt.signAsync(payload, {
      secret: process.env.JWT_ACCESS_SECRET,
      expiresIn: process.env.JWT_ACCESS_TTL ?? '900s',
    });
    const refreshToken = await this.jwt.signAsync(
      { sub: user.id },
      {
        secret: process.env.JWT_REFRESH_SECRET,
        expiresIn: process.env.JWT_REFRESH_TTL ?? '7d',
      },
    );

    await this.refreshTokens.save(
      this.refreshTokens.create({
        userId: user.id,
        tokenHash: this.hash(refreshToken),
        expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
        ip,
      }),
    );
    return { accessToken, refreshToken };
  }

  async login(login: string, password: string, ip?: string) {
    const user = await this.users.findOne({ where: { login } });
    if (!user) throw new UnauthorizedException('Credenciais inválidas');

    if (user.status === 'blocked' && user.blockedUntil && user.blockedUntil > new Date())
      throw new ForbiddenException('Conta bloqueada temporariamente');

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      user.failedAttempts += 1;
      if (user.failedAttempts >= this.maxAttempts) {
        user.status = 'blocked';
        user.blockedUntil = new Date(Date.now() + 15 * 60 * 1000);
      }
      await this.users.save(user);
      throw new UnauthorizedException('Credenciais inválidas');
    }

    if (user.status === 'inactive') throw new ForbiddenException('Usuário inativo');

    user.failedAttempts = 0;
    user.status = 'active';
    user.blockedUntil = null;
    user.lastLoginAt = new Date();
    await this.users.save(user);

    return this.issueTokens(user, ip);
  }

  async refresh(refreshToken: string, ip?: string) {
    let decoded: { sub: string };
    try {
      decoded = await this.jwt.verifyAsync(refreshToken, {
        secret: process.env.JWT_REFRESH_SECRET,
      });
    } catch {
      throw new UnauthorizedException('Refresh token inválido');
    }

    const stored = await this.refreshTokens.findOne({
      where: { tokenHash: this.hash(refreshToken), revoked: false },
    });
    if (!stored || stored.expiresAt < new Date())
      throw new UnauthorizedException('Sessão expirada');

    stored.revoked = true; // rotação
    await this.refreshTokens.save(stored);

    const user = await this.users.findOne({ where: { id: decoded.sub } });
    if (!user) throw new UnauthorizedException();
    return this.issueTokens(user, ip);
  }

  async logout(refreshToken: string) {
    await this.refreshTokens.update(
      { tokenHash: this.hash(refreshToken) },
      { revoked: true },
    );
    return { success: true };
  }

  async changePassword(userId: string, current: string, next: string) {
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user || !(await bcrypt.compare(current, user.passwordHash)))
      throw new UnauthorizedException('Senha atual incorreta');
    user.passwordHash = await bcrypt.hash(next, 12);
    await this.users.save(user);
    // revoga todas as sessões
    await this.refreshTokens.update({ userId }, { revoked: true });
    return { success: true };
  }
}
