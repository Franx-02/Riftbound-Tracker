import {
  Component,
  ElementRef,
  Injectable,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationStart, Router, RouterLink } from '@angular/router';
import { CatalogCard } from '../core/catalog.service';
import { CollectionService } from '../core/collection.service';
import { DescartadasService } from '../core/descartadas.service';
import { estiloDominios } from '../core/dominios';
import { IntercambiablesService } from '../core/intercambiables.service';
import { ValuationService } from '../core/valuation.service';
import { MAX_DESEO, WishlistService } from '../core/wishlist.service';
import { EurPipe, ThumbPipe } from './pipes';
import { QtyControlComponent } from './qty-control.component';

/** Qué carta tiene abierta la hoja de acciones (una sola para toda la app). */
@Injectable({ providedIn: 'root' })
export class AccionesCarta {
  readonly carta = signal<CatalogCard | null>(null);

  abrir(carta: CatalogCard): void {
    this.carta.set(carta);
  }

  cerrar(): void {
    this.carta.set(null);
  }
}

/**
 * Hoja con todo lo que se puede hacer con una carta: copias normales y foil, lista de
 * deseos, "no la quiero" y "para cambiar". La abre el botón ⋯ de cada tarjeta, así las
 * tarjetas solo llevan el "+" rápido y la rejilla no es un muro de botones. En móvil sube
 * desde abajo; en escritorio es una ventana pequeña. Es un `<dialog>` nativo: atrapa el
 * foco, se cierra con Escape y va por encima de todo sin pelearse con ningún z-index.
 */
@Component({
  selector: 'app-acciones-carta',
  imports: [RouterLink, QtyControlComponent, EurPipe, ThumbPipe],
  template: `
    <dialog
      #hoja
      aria-labelledby="titulo-acciones"
      (close)="acciones.cerrar()"
      (click)="alPulsarFondo($event)"
    >
      @if (acciones.carta(); as c) {
        <div class="contenido" [style]="colores()">
          <header>
            <img [src]="c.imgUrl | thumb: 160" alt="" width="64" height="89" />
            <div class="titulo">
              <h2 id="titulo-acciones">{{ c.name }}</h2>
              <p class="muted">{{ c.cardId }} · {{ c.setName }}</p>
              <p class="precios">
                @if (pricing().normal !== null) {
                  {{ pricing().normal | eur }}
                }
                @if (pricing().foil !== null) {
                  <span class="muted">foil {{ pricing().foil | eur }}</span>
                }
                @if (pricing().normal === null && pricing().foil === null) {
                  <span class="muted">sin precio</span>
                }
              </p>
            </div>
            <button type="button" class="cerrar" aria-label="Cerrar" (click)="cerrar()">×</button>
          </header>

          <section aria-label="Mis copias">
            <h3>Mis copias</h3>
            <app-qty-control [cardId]="c.cardId" />
          </section>

          <ul class="opciones">
            @if (wish.editable()) {
              <li>
                <span class="opcion-texto">
                  <span aria-hidden="true" class="icono deseo">♥</span>
                  Lista de deseos
                </span>
                @if (deseo()) {
                  <span class="pasos">
                    <button
                      type="button"
                      class="paso"
                      aria-label="Querer una copia menos"
                      (click)="wish.adjust(c.cardId, -1)"
                    >
                      −
                    </button>
                    <span class="n" aria-live="polite">{{ deseo() }}</span>
                    <button
                      type="button"
                      class="paso"
                      aria-label="Querer una copia más"
                      [disabled]="deseo() >= maxDeseo"
                      (click)="wish.adjust(c.cardId, 1)"
                    >
                      +
                    </button>
                  </span>
                } @else {
                  <button type="button" class="secondary" (click)="wish.adjust(c.cardId, 1)">
                    Añadir
                  </button>
                }
              </li>
            }
            @if (intercambiables.lista() && copias() > 0) {
              <li>
                <span class="opcion-texto">
                  <span aria-hidden="true" class="icono cambio">⇄</span>
                  Para cambiar
                  <small class="muted">Sale en Intercambios aunque solo tengas una</small>
                </span>
                <button
                  type="button"
                  class="interruptor"
                  role="switch"
                  [attr.aria-checked]="paraCambiar()"
                  aria-label="Para cambiar"
                  (click)="intercambiables.alternar(c.cardId)"
                ></button>
              </li>
            }
            @if (descartadas.lista()) {
              <li>
                <span class="opcion-texto">
                  <span aria-hidden="true" class="icono no">✕</span>
                  No la quiero
                  <small class="muted">No cuenta como que te falta</small>
                </span>
                <button
                  type="button"
                  class="interruptor"
                  role="switch"
                  [attr.aria-checked]="descartada()"
                  aria-label="No la quiero"
                  (click)="descartadas.alternar(c.cardId)"
                ></button>
              </li>
            }
          </ul>

          <a class="ficha" [routerLink]="['/carta', c.cardId]" (click)="cerrar()"
            >Ver la ficha completa →</a
          >
        </div>
      }
    </dialog>
  `,
  styles: `
    dialog {
      width: min(400px, calc(100vw - 24px));
      max-height: min(640px, calc(100dvh - 24px));
      padding: 0;
      overflow: auto;
      color: var(--text);
      background: var(--surface);
      border: 1px solid var(--border-claro);
      border-radius: 18px;
      box-shadow: 0 30px 80px rgb(0 0 0 / 0.7);
    }
    dialog[open] {
      animation: entra 0.18s ease-out both;
    }
    dialog::backdrop {
      background: rgb(4 6 12 / 0.6);
      backdrop-filter: blur(3px);
    }
    @keyframes entra {
      from {
        opacity: 0;
        transform: translateY(12px) scale(0.98);
      }
    }
    .contenido {
      display: grid;
      gap: 14px;
      padding: 16px;
      border-top: 3px solid transparent;
      border-image: linear-gradient(90deg, var(--dom-a), var(--dom-b)) 1;
    }
    header {
      display: grid;
      grid-template-columns: 64px minmax(0, 1fr) auto;
      gap: 12px;
      align-items: start;
    }
    header img {
      width: 64px;
      height: auto;
      aspect-ratio: 744 / 1039;
      border-radius: 6px;
      background: var(--surface-2);
    }
    .titulo {
      display: grid;
      gap: 2px;
    }
    h2 {
      margin: 0;
      font-size: 1.05rem;
      line-height: 1.25;
    }
    p {
      margin: 0;
      font-size: 0.85rem;
    }
    .precios {
      display: flex;
      flex-wrap: wrap;
      gap: 2px 10px;
      font-weight: 600;
      font-variant-numeric: tabular-nums;
    }
    .precios .muted {
      font-weight: 400;
    }
    .cerrar {
      width: 36px;
      height: 36px;
      padding: 0;
      font-size: 1.3rem;
      line-height: 1;
      border-radius: 50%;
      background: var(--surface-2);
      color: var(--muted);
      border-color: var(--border);
      box-shadow: none;
    }
    h3 {
      margin: 0 0 8px;
      font-family: var(--fuente);
      font-size: 0.75rem;
      font-weight: 600;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--muted);
    }
    section {
      padding: 12px 14px;
      border-radius: var(--radio);
      background: var(--surface-2);
    }
    .opciones {
      list-style: none;
      margin: 0;
      padding: 0;
      display: grid;
      border-radius: var(--radio);
      background: var(--surface-2);
    }
    .opciones li {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      min-height: 56px;
      padding: 8px 14px;
      border-top: 1px solid var(--border);
    }
    .opciones li:first-child {
      border-top: 0;
    }
    .opcion-texto {
      display: grid;
      grid-template-columns: 22px minmax(0, 1fr);
      column-gap: 8px;
      align-items: center;
      font-weight: 600;
      font-size: 0.95rem;
    }
    .opcion-texto small {
      grid-column: 2;
      font-weight: 400;
      font-size: 0.78rem;
    }
    .icono {
      text-align: center;
    }
    .icono.deseo {
      color: #fb7185;
    }
    .icono.cambio {
      color: var(--hextech);
    }
    .icono.no {
      color: var(--muted);
    }
    .pasos {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .paso {
      width: 32px;
      height: 32px;
      padding: 0;
      display: grid;
      place-items: center;
      font-size: 1.1rem;
      line-height: 1;
      background: var(--surface);
      color: var(--text);
      border-color: var(--border-claro);
      box-shadow: none;
    }
    .n {
      min-width: 1.6em;
      text-align: center;
      font-weight: 600;
      font-variant-numeric: tabular-nums;
    }
    .opciones .secondary {
      padding: 6px 14px;
    }
    /* Interruptor: se ve de un vistazo si está puesto, sin leer el texto del botón. */
    .interruptor {
      flex: none;
      position: relative;
      width: 46px;
      height: 28px;
      padding: 0;
      border-radius: 999px;
      background: var(--surface);
      border: 1px solid var(--border-claro);
      box-shadow: none;
      transition:
        background-color 0.15s ease,
        border-color 0.15s ease;
    }
    .interruptor::after {
      content: '';
      position: absolute;
      top: 3px;
      left: 3px;
      width: 20px;
      height: 20px;
      border-radius: 50%;
      background: var(--muted);
      transition:
        transform 0.15s ease,
        background-color 0.15s ease;
    }
    .interruptor[aria-checked='true'] {
      background: var(--accent-suave);
      border-color: var(--accent);
    }
    .interruptor[aria-checked='true']::after {
      transform: translateX(18px);
      background: var(--accent);
    }
    .interruptor:hover:not(:disabled) {
      filter: none;
      border-color: var(--accent);
    }
    .ficha {
      justify-self: center;
      padding: 6px 12px;
      font-size: 0.9rem;
      text-decoration: none;
    }

    /* Móvil: hoja pegada abajo, a todo el ancho, al alcance del pulgar. */
    @media (max-width: 700px) {
      dialog {
        width: 100vw;
        max-width: 100vw;
        margin: auto 0 0;
        border-radius: 20px 20px 0 0;
        border-width: 1px 0 0;
        max-height: 86dvh;
      }
      dialog[open] {
        animation-name: sube;
      }
      .contenido {
        padding-bottom: calc(16px + env(safe-area-inset-bottom));
      }
    }
    @keyframes sube {
      from {
        transform: translateY(40px);
        opacity: 0;
      }
    }
    @media (prefers-reduced-motion: reduce) {
      dialog[open] {
        animation: none;
      }
      .interruptor,
      .interruptor::after {
        transition: none;
      }
    }
  `,
})
export class AccionesCartaComponent {
  protected readonly acciones = inject(AccionesCarta);
  protected readonly wish = inject(WishlistService);
  protected readonly descartadas = inject(DescartadasService);
  protected readonly intercambiables = inject(IntercambiablesService);
  private readonly col = inject(CollectionService);
  private readonly valuation = inject(ValuationService);
  private readonly hoja = viewChild.required<ElementRef<HTMLDialogElement>>('hoja');

  protected readonly maxDeseo = MAX_DESEO;
  private readonly id = computed(() => this.acciones.carta()?.cardId ?? '');
  protected readonly pricing = computed(() => this.valuation.pricing(this.id()));
  protected readonly colores = computed(() => estiloDominios(this.acciones.carta()?.domains ?? []));
  protected readonly copias = computed(() => {
    const q = this.col.qty(this.id());
    return q.normal + q.foil;
  });
  protected readonly deseo = computed(() => this.wish.get(this.id())?.qty ?? 0);
  protected readonly descartada = computed(() => this.descartadas.ids().has(this.id()));
  protected readonly paraCambiar = computed(() =>
    this.intercambiables.ids().has(this.id().toUpperCase()),
  );

  constructor() {
    effect(() => {
      const d = this.hoja().nativeElement;
      const abierta = !!this.acciones.carta();
      if (abierta && !d.open) d.showModal();
      else if (!abierta && d.open) d.close();
    });
    // Al cambiar de página (el botón atrás incluido) la hoja no se queda encima.
    inject(Router)
      .events.pipe(takeUntilDestroyed())
      .subscribe((e) => {
        if (e instanceof NavigationStart) this.acciones.cerrar();
      });
  }

  protected cerrar(): void {
    this.acciones.cerrar();
  }

  /** Un clic fuera del contenido (en el fondo oscuro) cierra, como cualquier hoja. */
  protected alPulsarFondo(ev: MouseEvent): void {
    if (ev.target === this.hoja().nativeElement) this.cerrar();
  }
}
