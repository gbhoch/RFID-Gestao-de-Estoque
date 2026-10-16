import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, map, of } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';

/**
 * Libera a rota só para o papel "admin". Depois de um reload o perfil ainda não foi
 * carregado (AuthService só guarda os tokens), então busca /auth/me antes de decidir.
 */
export const adminGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const deny = () => router.createUrlTree(['/dashboard']);

  const user = auth.user();
  if (user) return user.role === 'admin' ? true : deny();

  return auth.loadProfile().pipe(
    map((u) => (u?.role === 'admin' ? true : deny())),
    catchError(() => of(deny())),
  );
};
