import { Routes } from '@angular/router';
import { signedInGuard, loginGuard } from './core/guards';

export const routes: Routes = [
  {
    path: 'login',
    canActivate: [loginGuard],
    loadComponent: () => import('./pages/login.page').then((m) => m.LoginPage),
  },
  {
    path: '',
    canActivate: [signedInGuard],
    loadComponent: () => import('./pages/shell.component').then((m) => m.ShellComponent),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'coleccion' },
      {
        path: 'coleccion',
        title: 'Mi colección · Riftbound',
        loadComponent: () => import('./pages/collection.page').then((m) => m.CollectionPage),
      },
      {
        // La de otro miembro del grupo, en solo lectura.
        path: 'coleccion/:uid',
        title: 'Colección · Riftbound',
        loadComponent: () => import('./pages/collection.page').then((m) => m.CollectionPage),
      },
      {
        path: 'catalogo',
        title: 'Catálogo · Riftbound',
        loadComponent: () => import('./pages/catalog.page').then((m) => m.CatalogPage),
      },
      {
        path: 'carta/:cardId',
        loadComponent: () => import('./pages/card.page').then((m) => m.CardPage),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
