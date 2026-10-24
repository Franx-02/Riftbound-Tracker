import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

/** Solo usuarios invitados. Si no, a /login. */
export const allowedGuard: CanActivateFn = async () => {
  const authService = inject(AuthService);
  const router = inject(Router);
  await authService.ready;
  return authService.access() === 'allowed' ? true : router.parseUrl('/login');
};

/** La pantalla de login no tiene sentido si ya hay acceso. */
export const loginGuard: CanActivateFn = async () => {
  const authService = inject(AuthService);
  const router = inject(Router);
  await authService.ready;
  return authService.access() === 'allowed' ? router.parseUrl('/') : true;
};
