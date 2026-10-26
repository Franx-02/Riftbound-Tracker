import { ApplicationConfig, provideBrowserGlobalErrorListeners, isDevMode } from '@angular/core';
import {
  PreloadAllModules,
  provideRouter,
  withComponentInputBinding,
  withInMemoryScrolling,
  withPreloading,
  withViewTransitions,
} from '@angular/router';
import { routes } from './app.routes';
import { provideServiceWorker } from '@angular/service-worker';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(
      routes,
      // :cardId de la ruta llega como input() de la ficha.
      withComponentInputBinding(),
      // Al volver de una ficha, el catálogo recupera el scroll donde estaba.
      withInMemoryScrolling({ scrollPositionRestoration: 'enabled' }),
      // Tras la primera página se descargan las demás en segundo plano: cambiar de sección
      // ya no espera a la red.
      withPreloading(PreloadAllModules),
      withViewTransitions({ skipInitialTransition: true }),
    ),
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
    }),
  ],
};
