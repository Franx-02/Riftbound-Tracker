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
      { path: '', pathMatch: 'full', redirectTo: 'inicio' },
      {
        path: 'inicio',
        title: 'Inicio · Riftbound Tracker',
        loadComponent: () => import('./pages/inicio.page').then((m) => m.InicioPage),
      },
      {
        path: 'coleccion',
        title: 'Mi colección · Riftbound Tracker',
        loadComponent: () => import('./pages/collection.page').then((m) => m.CollectionPage),
      },
      {
        // La de otro miembro del grupo, en solo lectura.
        path: 'coleccion/:uid',
        title: 'Colección · Riftbound Tracker',
        loadComponent: () => import('./pages/collection.page').then((m) => m.CollectionPage),
      },
      {
        path: 'importar',
        title: 'Importar y exportar · Riftbound Tracker',
        loadComponent: () => import('./pages/import.page').then((m) => m.ImportPage),
      },
      {
        path: 'intercambios',
        title: 'Intercambios · Riftbound Tracker',
        loadComponent: () => import('./pages/intercambios.page').then((m) => m.IntercambiosPage),
      },
      {
        path: 'deseos',
        title: 'Lista de deseos · Riftbound Tracker',
        loadComponent: () => import('./pages/wishlist.page').then((m) => m.WishlistPage),
      },
      {
        path: 'mazos',
        title: 'Mazos · Riftbound Tracker',
        loadComponent: () => import('./pages/mazos.page').then((m) => m.MazosPage),
      },
      {
        path: 'mazos/:id',
        title: 'Mazo · Riftbound Tracker',
        loadComponent: () => import('./pages/mazo.page').then((m) => m.MazoPage),
      },
      {
        path: 'escanear',
        title: 'Escanear · Riftbound Tracker',
        loadComponent: () => import('./pages/scanner.page').then((m) => m.ScannerPage),
      },
      {
        path: 'catalogo',
        title: 'Catálogo · Riftbound Tracker',
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
