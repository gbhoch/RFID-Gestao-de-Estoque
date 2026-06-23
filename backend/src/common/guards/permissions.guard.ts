import {
  CanActivate,
  ExecutionContext,
  Injectable,
  SetMetadata,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

export const PERMISSION_KEY = 'required_permission';
export const RequirePermission = (code: string) =>
  SetMetadata(PERMISSION_KEY, code);

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string>(PERMISSION_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!required) return true;

    const { user } = ctx.switchToHttp().getRequest();
    const perms: string[] = user?.permissions ?? [];
    if (perms.includes('*') || perms.includes(required)) return true;

    throw new ForbiddenException(`Missing permission: ${required}`);
  }
}
