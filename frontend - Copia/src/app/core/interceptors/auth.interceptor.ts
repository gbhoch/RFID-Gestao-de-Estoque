import { inject } from '@angular/core';
import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, switchMap, throwError } from 'rxjs';
import { AuthService } from '../auth/auth.service';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const token = auth.accessToken();
  const authReq = token
    ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
    : req;

  return next(authReq).pipe(
    catchError((err: HttpErrorResponse) => {
      if (err.status === 401 && auth.refreshTokenValue() && !req.url.includes('/auth/')) {
        return auth.refresh().pipe(
          switchMap(() =>
            next(req.clone({ setHeaders: { Authorization: `Bearer ${auth.accessToken()}` } }))),
          catchError((e) => { auth.logout(); return throwError(() => e); }),
        );
      }
      return throwError(() => err);
    }),
  );
};

export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (auth.isAuthenticated()) return true;
  router.navigate(['/login']);
  return false;
};
