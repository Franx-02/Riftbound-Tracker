import { Component, DestroyRef, computed, inject, input, output, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CatalogCard } from '../core/catalog.service';
import { CardQty, CollectionService } from '../core/collection.service';
import { IntercambiablesService } from '../core/intercambiables.service';
import { WishlistService } from '../core/wishlist.service';
import { DescartadasService } from '../core/descartadas.service';
import { estiloDominios } from '../core/dominios';
import { ValuationService } from '../core/valuation.service';
import { ConfidenceBadgeComponent } from './confidence-badge.component';
import { EurPipe, ThumbPipe } from './pipes';
import { AccionesCarta } from './acciones-carta.component';
import { InclinarDirective } from './inclinar.directive';
import { volarA } from './volar';

/** Cuánto se queda abierto el "− N +" tras el último toque antes de volver a ser un "+". */
const CIERRE_MS = 2500;

/**
 * Una carta en cuadrícula. La imagen manda: encima solo lleva una insignia con las copias
 * y, abajo a la derecha, un "+" que suma una copia normal de un toque y se abre en
 * "− N +" mientras se usa (como el botón de añadir al carrito de cualquier tienda). Todo
 * lo demás (foil, deseos, "no la quiero", "para cambiar") vive en la hoja que abre ⋯:
 * antes cada carta llevaba hasta nueve botones encima. Con ratón, "+" y ⋯ aparecen al
 * pasar por la carta; en táctil se ven siempre. La usan el catálogo y Mi colección.
 */
@Component({
  selector: 'app-card-tile',
  imports: [RouterLink, InclinarDirective, ConfidenceBadgeComponent, EurPipe, ThumbPipe],
  template: `
    @if (seleccion()) {
      <button
        type="button"
        class="capa-seleccion"
        [class.marcada]="seleccionada()"
        [attr.aria-pressed]="seleccionada()"
        [attr.aria-label]="
          (seleccionada() ? 'Quitar de la selección ' : 'Seleccionar ') + card().name
        "
        (click)="alternarSeleccion.emit()"
      >
        <span class="check" aria-hidden="true">✓</span>
      </button>
    }
    <div class="marco" [appInclinar]="5" [holo]="owned().foil > 0">
      <!-- Los botones no pueden ir dentro de un enlace (HTML inválido, y el teclado se
           lía): la imagen es un enlace y los controles, hermanos posicionados encima.
           Fuera del tabulador porque el nombre de abajo lleva al mismo sitio. -->
      <a
        [routerLink]="['/carta', card().cardId]"
        class="imagen"
        tabindex="-1"
        aria-hidden="true"
        (click)="volarA(img)"
      >
        <img
          #img
          [src]="card().imgUrl | thumb: 300"
          alt=""
          loading="lazy"
          decoding="async"
          width="240"
          height="335"
          [class.cargada]="cargada()"
          (load)="cargada.set(true)"
          (error)="sinImagen.set(true)"
        />
        @if (sinImagen()) {
          <span class="sin-imagen">{{ card().name }}</span>
        }
      </a>
      @if (copias() > 0) {
        <span class="etiqueta tengo" [title]="detalleCopias()">
          ×{{ copias() }}
          @if (owned().foil > 0) {
            <span class="foil" aria-hidden="true">✦{{ owned().foil }}</span>
          }
        </span>
      } @else if (descartada()) {
        <span class="etiqueta descartada">no la quiero</span>
      } @else if (deseo()) {
        <span class="etiqueta deseada">♥ ×{{ deseo() }}</span>
      } @else if (dim()) {
        <span class="etiqueta falta">falta</span>
      }
      @if (copias() > 0 && (paraCambiar() || deseo())) {
        <span class="marcas" aria-hidden="true">
          @if (paraCambiar()) {
            <span class="marca cambio" title="Para cambiar">⇄</span>
          }
          @if (deseo()) {
            <span class="marca deseo" title="En tu lista de deseos">♥</span>
          }
        </span>
      }
      @if (!readonly() && col.editable()) {
        <button
          type="button"
          class="mas-acciones"
          [attr.aria-label]="'Más acciones de ' + card().name"
          (click)="acciones.abrir(card())"
        >
          <span aria-hidden="true">⋯</span>
        </button>
        <div class="rapido" [class.abierto]="abierto()">
          @if (owned().normal > 0) {
            <button
              type="button"
              class="paso menos"
              [attr.aria-label]="'Quitar una copia normal de ' + card().name"
              (click)="ajustar(-1)"
            >
              −
            </button>
            <span class="n" aria-live="polite">{{ owned().normal }}</span>
          }
          <button
            type="button"
            class="paso suma"
            [attr.aria-label]="'Añadir una copia normal de ' + card().name"
            (click)="ajustar(1)"
          >
            +
          </button>
        </div>
      }
    </div>
    <a [routerLink]="['/carta', card().cardId]" class="enlace-carta" (click)="volarA(img)">
      <span class="nombre">{{ card().name }}</span>
      <span class="meta">
        <span class="codigo">{{ card().cardId }}</span>
        <!-- Si no hay precio normal pero sí foil, se dice: si no, parecería el de la normal. -->
        <span class="precio">
          @if (pricing().normal !== null) {
            {{ pricing().normal | eur }}
          } @else if (pricing().foil !== null) {
            <span class="muted">foil</span> {{ pricing().foil | eur }}
          } @else {
            —
          }
        </span>
      </span>
      <app-confidence-badge [pricing]="pricing()" />
    </a>
  `,
  styles: `
    /* --dom-a y --dom-b: el color de su dominio (o los dos, en degradado). */
    :host {
      position: relative;
      display: grid;
      min-width: 0;
      gap: 8px;
      align-content: start;
      padding: 8px;
      background:
        linear-gradient(180deg, color-mix(in srgb, var(--dom-a) 10%, transparent), transparent 45%),
        var(--surface);
      border: 1px solid color-mix(in srgb, var(--dom-a) 22%, var(--border));
      border-radius: var(--radio);
      overflow: hidden;
      /* Las que quedan fuera de pantalla no se pintan: las carpetas tienen cientos. */
      content-visibility: auto;
      contain-intrinsic-size: auto 320px;
      transition:
        transform 0.15s ease,
        box-shadow 0.15s ease,
        border-color 0.15s ease;
    }
    /* Franja de arriba con el color del dominio. */
    :host::before {
      content: '';
      position: absolute;
      inset: 0 0 auto;
      height: 3px;
      background: linear-gradient(90deg, var(--dom-a), var(--dom-b));
      opacity: 0.55;
    }
    :host(.tengo) {
      border-color: color-mix(in srgb, var(--dom-a) 60%, transparent);
      box-shadow: 0 0 18px color-mix(in srgb, var(--dom-a) 18%, transparent);
    }
    :host(.tengo)::before {
      opacity: 1;
    }
    :host(.apagada)::before {
      opacity: 0.25;
    }
    .enlace-carta {
      display: grid;
      gap: 4px;
      color: inherit;
      text-decoration: none;
    }
    .enlace-carta:hover .nombre {
      color: color-mix(in srgb, var(--dom-a) 70%, white);
    }
    .capa-seleccion {
      all: unset;
      position: absolute;
      inset: 0;
      z-index: 5;
      cursor: pointer;
      border-radius: inherit;
      border: 2px solid transparent;
      transition:
        border-color 0.15s ease,
        background 0.15s ease;
    }
    .capa-seleccion:hover {
      background: rgb(255 255 255 / 0.05);
    }
    .capa-seleccion .check {
      position: absolute;
      top: 10px;
      right: 10px;
      width: 26px;
      height: 26px;
      display: grid;
      place-items: center;
      border-radius: 50%;
      font-size: 0.9rem;
      font-weight: 700;
      color: transparent;
      background: rgb(0 0 0 / 0.55);
      border: 2px solid rgb(255 255 255 / 0.7);
      transition:
        transform 0.2s cubic-bezier(0.2, 0.8, 0.2, 1),
        background 0.2s ease,
        color 0.2s ease;
    }
    .capa-seleccion.marcada {
      border-color: var(--accent);
      background: color-mix(in srgb, var(--accent) 10%, transparent);
    }
    .capa-seleccion.marcada .check {
      color: #111;
      background: var(--accent);
      border-color: var(--accent);
      transform: scale(1.15);
    }
    :host(.seleccionada) {
      box-shadow:
        0 0 0 2px var(--accent),
        0 10px 30px rgb(0 0 0 / 0.5);
      transform: translateY(-2px) scale(0.98);
    }
    /* En modo selección los controles de la carta sobran: toda ella es el botón. */
    :host(.seleccionando) .mas-acciones,
    :host(.seleccionando) .rapido {
      display: none;
    }
    .marco {
      position: relative;
      overflow: hidden;
      border-radius: var(--radio-s);
    }
    /* Mientras llega la imagen, el hueco late; al llegar, aparece fundiéndose. */
    .imagen {
      display: block;
      position: relative;
      background: var(--surface-2);
      animation: late 1.4s ease-in-out infinite;
    }
    .imagen:has(img.cargada),
    .imagen:has(.sin-imagen) {
      animation: none;
    }
    @keyframes late {
      50% {
        background: var(--surface-hover);
      }
    }
    img {
      display: block;
      width: 100%;
      height: auto;
      aspect-ratio: 744 / 1039;
      object-fit: contain;
      opacity: 0;
      transition:
        opacity 0.2s ease,
        filter 0.2s ease;
    }
    img.cargada {
      opacity: 1;
    }
    /* Sin imagen (sin conexión, o el CDN no la tiene): al menos el nombre. */
    .sin-imagen {
      position: absolute;
      inset: 0;
      display: grid;
      place-items: center;
      padding: 12px;
      text-align: center;
      font-size: 0.85rem;
      font-weight: 600;
      color: var(--muted);
    }
    /* La que no tienes se ve apagada, como un hueco en la carpeta, pero reconocible. */
    :host(.apagada) img {
      filter: grayscale(0.85) brightness(0.4);
    }
    /* La que no quieres: fondo rojizo, para distinguirla de un hueco que hay que llenar. */
    :host(.descartada) {
      background: color-mix(in srgb, #b3261e 28%, var(--surface));
      border-color: color-mix(in srgb, #e05a4f 60%, var(--border));
    }
    :host(.descartada) img {
      filter: grayscale(0.6) sepia(0.35) hue-rotate(-25deg) saturate(1.6) brightness(0.45);
    }

    /* ── Insignias (no se pulsan) ─────────────────────────────────────────────── */
    .etiqueta {
      position: absolute;
      top: 6px;
      left: 6px;
      z-index: 1;
      pointer-events: none;
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 1px 7px;
      border-radius: var(--radio-s);
      font-size: 0.72rem;
      font-weight: 700;
      letter-spacing: 0.03em;
      text-transform: uppercase;
    }
    .etiqueta.tengo {
      background: var(--dom-a);
      color: #0d0f13;
    }
    .etiqueta .foil {
      padding-left: 5px;
      border-left: 1px solid rgb(0 0 0 / 0.3);
      letter-spacing: 0;
    }
    .etiqueta.falta {
      background: rgb(0 0 0 / 0.65);
      color: var(--muted);
      border: 1px solid var(--border);
    }
    .etiqueta.descartada {
      background: #b3261e;
      color: #fff;
    }
    .etiqueta.deseada {
      background: rgb(225 29 72 / 0.85);
      color: #fff;
    }
    .marcas {
      position: absolute;
      left: 6px;
      bottom: 6px;
      z-index: 1;
      display: flex;
      gap: 4px;
      pointer-events: none;
    }
    .marca {
      width: 22px;
      height: 22px;
      display: grid;
      place-items: center;
      border-radius: 50%;
      font-size: 0.75rem;
      background: rgb(0 0 0 / 0.7);
      border: 1px solid rgb(255 255 255 / 0.2);
    }
    .marca.cambio {
      color: var(--hextech);
    }
    .marca.deseo {
      color: #fb7185;
    }

    /* ── Controles sobre la imagen ────────────────────────────────────────────── */
    .mas-acciones,
    .paso {
      padding: 0;
      display: grid;
      place-items: center;
      line-height: 1;
      color: #fff;
      /* Fondo opaco y sin desenfoque: un backdrop-filter que aparece con opacidad sobre una
         carta inclinada en 3D se pinta de golpe en vez de fundirse. */
      background: rgb(8 10 14 / 0.86);
      border: 1px solid rgb(255 255 255 / 0.22);
      box-shadow: 0 2px 8px rgb(0 0 0 / 0.5);
    }
    .mas-acciones {
      position: absolute;
      top: 6px;
      right: 6px;
      /* Por encima de los brillos de la carta (z-index 1 y 2 en styles.scss). */
      z-index: 3;
      width: 32px;
      height: 32px;
      border-radius: 50%;
      font-size: 1.15rem;
    }
    /* El "+" rápido: una píldora que se estira hacia la izquierda al abrirse. */
    .rapido {
      position: absolute;
      right: 6px;
      bottom: 6px;
      z-index: 3;
      display: flex;
      align-items: center;
      gap: 2px;
      padding: 0;
      border-radius: 999px;
      transition:
        background-color 0.15s ease,
        padding 0.15s ease;
    }
    /* Tamaño fijo, abierta o cerrada: si cambiara al abrirse, el "+" saltaría bajo el dedo. */
    .paso {
      width: 34px;
      height: 34px;
      border-radius: 50%;
      font-size: 1.25rem;
      font-weight: 700;
    }
    .paso.suma {
      background: linear-gradient(180deg, #fde68a, var(--accent-fuerte));
      border-color: transparent;
      color: #1a1305;
    }
    .rapido .menos,
    .rapido .n {
      display: none;
    }
    .rapido .n {
      min-width: 1.5em;
      text-align: center;
      font-weight: 700;
      font-variant-numeric: tabular-nums;
      color: #fff;
    }
    .rapido.abierto {
      padding: 3px;
      background: rgb(8 10 14 / 0.86);
      box-shadow:
        0 0 0 1px rgb(255 255 255 / 0.18),
        0 6px 18px rgb(0 0 0 / 0.55);
    }
    .rapido.abierto .menos {
      display: grid;
      box-shadow: none;
      background: rgb(255 255 255 / 0.1);
      animation: asoma 0.15s ease-out both;
    }
    .rapido.abierto .n {
      display: block;
      animation: asoma 0.15s ease-out both;
    }
    @keyframes asoma {
      from {
        opacity: 0;
      }
    }
    .paso:active:not(:disabled),
    .mas-acciones:active {
      transform: scale(0.92);
    }

    /* Con ratón: los controles aparecen al pasar por la carta (o al llegar con el
       tabulador), la píldora se abre sola y la carta se levanta un poco. */
    @media (hover: hover) {
      .mas-acciones,
      .rapido {
        opacity: 0;
        transition: opacity 0.18s ease;
      }
      :host(:hover) .mas-acciones,
      :host(:hover) .rapido,
      :host(:focus-within) .mas-acciones,
      :host(:focus-within) .rapido,
      .rapido.abierto {
        opacity: 1;
      }
      .paso.menos:hover,
      .mas-acciones:hover {
        filter: none;
        border-color: var(--accent);
      }
      /* La carta no se mueve ni se amplía al pasar: al levantarla, su borde se iba de
         debajo del puntero, perdía el hover y volvía (parpadeo). Solo se ilumina. */
      :host(:hover) {
        box-shadow:
          0 10px 28px rgb(0 0 0 / 0.45),
          0 0 22px color-mix(in srgb, var(--dom-a) 35%, transparent);
        border-color: var(--dom-a);
      }
      :host(.apagada:hover) img,
      :host(.apagada:focus-within) img {
        filter: grayscale(0.3) brightness(0.8);
      }
    }
    :host(:focus-within) {
      border-color: var(--dom-a);
    }
    @media (prefers-reduced-motion: reduce) {
      :host,
      img,
      .rapido,
      .mas-acciones {
        transition: none;
      }
      .imagen {
        animation: none;
      }
    }
    .nombre {
      font-weight: 600;
      font-size: 0.9rem;
      line-height: 1.25;
    }
    .meta {
      display: flex;
      justify-content: space-between;
      gap: 8px;
      font-size: 0.8rem;
    }
    .codigo {
      color: var(--muted);
      font-variant-numeric: tabular-nums;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .precio {
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }
    @media (max-width: 420px) {
      :host {
        padding: 6px;
      }
    }
  `,
  host: {
    '[class.tengo]': 'copias() > 0',
    '[class.apagada]': 'dim() && copias() === 0',
    '[class.descartada]': 'descartada() && copias() === 0',
    '[class.seleccionada]': 'seleccionada()',
    '[class.seleccionando]': 'seleccion()',
    '[style]': 'colores()',
  },
})
export class CardTileComponent {
  private readonly valuation = inject(ValuationService);
  protected readonly col = inject(CollectionService);
  protected readonly acciones = inject(AccionesCarta);
  protected readonly volarA = volarA;
  private readonly descartadas = inject(DescartadasService);
  private readonly wish = inject(WishlistService);
  private readonly intercambiables = inject(IntercambiablesService);
  /** Copias que pides en la lista de deseos (0 si no está). */
  protected readonly deseo = computed(() => this.wish.get(this.card().cardId)?.qty ?? 0);
  protected readonly paraCambiar = computed(() =>
    this.intercambiables.ids().has(this.card().cardId.toUpperCase()),
  );

  readonly card = input.required<CatalogCard>();
  /** Copias que se enseñan: las tuyas, o las de otro usuario si `readonly`. */
  readonly owned = input.required<CardQty>();
  /** Copias de otro usuario: números sin botones. */
  readonly readonly = input(false);
  /** Oscurecer si no hay copias (vista de carpeta). */
  readonly dim = input(false);
  /** Modo selección múltiple: la tarjeta entera marca o desmarca en vez de abrir la ficha. */
  readonly seleccion = input(false);
  readonly seleccionada = input(false);
  readonly alternarSeleccion = output<void>();

  protected readonly cargada = signal(false);
  protected readonly sinImagen = signal(false);
  /** La píldora "− N +" está desplegada (se cierra sola al rato de no tocarla). */
  protected readonly abierto = signal(false);
  private cierre: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      if (this.cierre) clearTimeout(this.cierre);
    });
  }

  /** Suma o quita una copia normal y deja la píldora abierta un momento, para seguir. */
  protected ajustar(delta: number): void {
    this.col.adjust(this.card().cardId, 'normal', delta);
    this.abierto.set(true);
    if (this.cierre) clearTimeout(this.cierre);
    this.cierre = setTimeout(() => this.abierto.set(false), CIERRE_MS);
  }

  protected readonly pricing = computed(() => this.valuation.pricing(this.card().cardId));
  protected readonly colores = computed(() => estiloDominios(this.card().domains));
  protected readonly copias = computed(() => this.owned().normal + this.owned().foil);
  /** Marcada como "No la quiero". Solo en la colección propia: es una preferencia personal. */
  protected readonly descartada = computed(
    () => !this.readonly() && this.descartadas.ids().has(this.card().cardId),
  );
  protected readonly detalleCopias = computed(() => {
    const { normal, foil } = this.owned();
    return `${normal} ${normal === 1 ? 'normal' : 'normales'}, ${foil} foil`;
  });
}
