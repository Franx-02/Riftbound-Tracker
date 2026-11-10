import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { CollectionService } from '../core/collection.service';
import { ValuationService } from '../core/valuation.service';
import { GraficaPrecioComponent, PuntoPrecio, puntosValidos } from './grafica-precio.component';

/** Tras el último cambio en la colección, cuánto se espera antes de volver a pedir el historial. */
const ESPERA_MS = 2000;
/** La última respuesta, por cuerpo de la petición: volver a la página no repite la llamada. */
const cache = new Map<string, PuntoPrecio[]>();

/**
 * Cómo ha evolucionado el valor de tu colección: lo que habría valido cada día lo que
 * tienes ahora, con los precios de ese día (netlify/functions/historial-coleccion.mts).
 */
@Component({
  selector: 'app-valor-coleccion',
  imports: [GraficaPrecioComponent],
  template: `
    <h2>Cómo ha evolucionado su valor</h2>
    @if (error()) {
      <p class="muted">No se pudo cargar el historial: {{ error() }}</p>
    } @else if (historial(); as h) {
      @if (h.length) {
        <app-grafica-precio [puntos]="h" [nombres]="['Valor de la colección', '']" />
        <p class="muted nota">
          Lo que habría valido cada día lo que tienes ahora, con los precios de ese día. Se guarda
          un precio al día desde el 25/10/2026.
        </p>
      } @else {
        <p class="muted">Aún no hay historial: se guarda el precio de las cartas una vez al día.</p>
      }
    } @else {
      <p class="muted">Cargando…</p>
    }
  `,
  styles: `
    :host {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      gap: 8px;
    }
    h2 {
      margin: 0;
      font-size: 1.05rem;
    }
    .nota {
      margin: 0;
      font-size: 0.8rem;
    }
  `,
})
export class ValorColeccionComponent {
  private readonly col = inject(CollectionService);
  private readonly valuation = inject(ValuationService);

  protected readonly historial = signal<PuntoPrecio[] | null>(null);
  protected readonly error = signal<string | null>(null);

  /** Cada producto de Cardmarket con tus copias. Cambia si cambia la colección. */
  private readonly pedido = computed(() => {
    const porProducto = new Map<number, { id: number; n: number; f: number }>();
    for (const [cardId, q] of this.col.cards()) {
      const id = this.valuation.pricing(cardId).idProduct;
      if (!id) continue;
      const it = porProducto.get(id) ?? { id, n: 0, f: 0 };
      it.n += q.normal;
      it.f += q.foil;
      porProducto.set(id, it);
    }
    return JSON.stringify({ items: [...porProducto.values()].sort((a, b) => a.id - b.id) });
  });

  constructor() {
    effect((onCleanup) => {
      const cuerpo = this.pedido();
      if (cuerpo === '{"items":[]}') {
        // Nada con producto de Cardmarket: sin esto se quedaba en "Cargando…" para siempre.
        this.historial.set([]);
        return;
      }
      const guardado = cache.get(cuerpo);
      if (guardado) {
        this.historial.set(guardado);
        this.error.set(null);
        return;
      }
      const ctrl = new AbortController();
      // Cada petición es una función de Netlify que lee el historial entero y, al ser un
      // POST, no se cachea: se espera a que dejes de tocar los +/− en vez de lanzar una
      // por clic (abortar el fetch no para la función, que ya está contada).
      const espera = setTimeout(
        () => {
          fetch('/api/historial-coleccion', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: cuerpo,
            signal: ctrl.signal,
          })
            .then(async (r) => {
              if (!r.ok) throw new Error(`HTTP ${r.status}`);
              const puntos = puntosValidos(await r.json());
              cache.clear();
              cache.set(cuerpo, puntos);
              this.historial.set(puntos);
              this.error.set(null);
            })
            .catch((e: unknown) => {
              if (!ctrl.signal.aborted) this.error.set(e instanceof Error ? e.message : String(e));
            });
        },
        untracked(this.historial) === null ? 0 : ESPERA_MS,
      );
      onCleanup(() => {
        clearTimeout(espera);
        ctrl.abort();
      });
    });
  }
}
