import { Routes } from '@angular/router';
import { allowedGuard, loginGuard } from './core/guards';

export const routes: Routes = [
  { path: 'login', canActivate: [loginGuard], loadComponent: () => import('./pages/login.page').then((m) => m.LoginPage) },
  { path: '', canActivate: [allowedGuard], loadComponent: () => import('./pages/home.page').then((m) => m.HomePage) },
  { path: '**', redirectTo: '' },
];
