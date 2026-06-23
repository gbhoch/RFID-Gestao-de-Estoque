import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
} from 'typeorm';
import {
  Injectable, NestInterceptor, ExecutionContext, CallHandler,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Observable, tap } from 'rxjs';

@Entity('audit_logs')
export class AuditLogOrmEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'user_id', nullable: true }) userId: string;
  @Column() operation: string;
  @Column({ nullable: true }) entity: string;
  @Column({ name: 'entity_id', nullable: true }) entityId: string;
  @Column({ nullable: true }) ip: string;
  @Column({ type: 'jsonb', nullable: true }) changes: any;
  @Column({ name: 'occurred_at', type: 'timestamptz', default: () => 'now()' })
  occurredAt: Date;
}

// Registra automaticamente toda operação mutante (POST/PUT/PATCH/DELETE).
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    @InjectRepository(AuditLogOrmEntity)
    private repo: Repository<AuditLogOrmEntity>,
  ) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<any> {
    const req = ctx.switchToHttp().getRequest();
    const method = req.method as string;
    const mutating = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);

    return next.handle().pipe(
      tap((result) => {
        if (!mutating) return;
        const entity = (req.route?.path ?? req.url).split('/')[3] ?? 'unknown';
        this.repo
          .save(
            this.repo.create({
              userId: req.user?.id ?? null,
              operation: method,
              entity,
              entityId: result?.id ?? req.params?.id ?? null,
              ip: req.ip,
              changes: this.sanitize(req.body),
            }),
          )
          .catch(() => void 0); // auditoria nunca quebra a request principal
      }),
    );
  }

  private sanitize(body: any) {
    if (!body || typeof body !== 'object') return body;
    const clone = { ...body };
    for (const k of ['password', 'currentPassword', 'newPassword'])
      if (k in clone) clone[k] = '***';
    return clone;
  }
}
