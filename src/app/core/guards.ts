import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

/** Solo con sesión. Si no, a /login. */
export const signedInGuard: CanActivateFn = async () => {
  const authService = inject(AuthService);
  const router = inject(Router);
  await authService.ready;
  return authService.access() === 'signed-in' ? true : router.parseUrl('/login');
};

/** La pantalla de login no tiene sentido si ya hay sesión. */
export const loginGuard: CanActivateFn = async () => {
  const authService = inject(AuthService);
  const router = inject(Router);
  await authService.ready;
  return authService.access() === 'signed-in' ? router.parseUrl('/') : true;
};
