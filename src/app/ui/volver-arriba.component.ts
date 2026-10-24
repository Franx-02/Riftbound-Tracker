import { Component, DestroyRef, inject, signal } from '@angular/core';

/** A partir de cuánto scroll aparece el botón. */
const UMBRAL_PX = 800;

/**
 * Botón flotante para volver arriba del todo, para listas largas como la colección.
 * Solo aparece cuando ya se ha bajado bastante.
 */
@Component({
  selector: 'app-volver-arriba',
  template: `
    @if (visible()) {
      <button type="button" aria-label="Volver arriba" title="Volver arriba" (click)="subir()">
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
          <path
            d="M12 5l-7 7m7-7l7 7M12 5v14"
            fill="none"
            stroke="currentColor"
            stroke-width="2.4"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </button>
    }
  `,
  styles: `
    button {
      position: fixed;
      right: 16px;
      bottom: calc(20px + env(safe-area-inset-bottom));
      z-index: 20;
      width: 48px;
      height: 48px;
      padding: 0;
      display: grid;
      place-items: center;
      border-radius: 50%;
      box-shadow: 0 4px 14px rgb(0 0 0 / 45%);
    }
  `,
})
export class VolverArribaComponent {
  protected readonly visible = signal(false);

  constructor() {
    const alMover = () => this.visible.set(window.scrollY > UMBRAL_PX);
    window.addEventListener('scroll', alMover, { passive: true });
    inject(DestroyRef).onDestroy(() => window.removeEventListener('scroll', alMover));
  }

  protected subir(): void {
    const suave = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: suave ? 'smooth' : 'auto' });
  }
}
