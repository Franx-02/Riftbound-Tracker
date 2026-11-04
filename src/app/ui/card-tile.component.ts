import { Component, computed, inject, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CatalogCard } from '../core/catalog.service';
import { CardQty } from '../core/collection.service';
import { IntercambiablesService } from '../core/intercambiables.service';
import { WishlistService } from '../core/wishlist.service';
import { DescartadasService } from '../core/descartadas.service';
import { estiloDominios } from '../core/dominios';
import { ValuationService } from '../core/valuation.service';
import { ConfidenceBadgeComponent } from './confidence-badge.component';
import { EurPipe, ThumbPipe } from './pipes';
import { QtyControlComponent } from './qty-control.component';
import { InclinarDirective } from './inclinar.directive';
import { volarA } from './volar';

/**
 * Una carta en cuadrícula. El +/− de normal y foil va encima de la imagen: en
 * escritorio aparece al pasar el ratón (o al llegar con el tabulador) y en pantallas
 * táctiles, donde no hay "pasar el ratón", se ve siempre. La usan el catálogo y la
 * vista de carpeta de Mi colección.
 */
@Component({
  selector: 'app-card-tile',
  imports: [
    RouterLink,
    InclinarDirective,
    QtyControlComponent,
    ConfidenceBadgeComponent,
    EurPipe,
    ThumbPipe,
  ],
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
    <div class="marco" appInclinar [holo]="owned().foil > 0">
      <!-- Los botones no pueden ir dentro de un enlace (HTML inválido, y el teclado se
           lía): la imagen es un enlace y el panel, un hermano posicionado encima.
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
        />
      </a>
      @if (copias() > 0) {
        <span class="etiqueta tengo" [title]="detalleCopias()">×{{ copias() }}</span>
      } @else if (descartada()) {
        <span class="etiqueta descartada">no la quiero</span>
      } @else if (deseo()) {
        <span class="etiqueta deseada">♥ ×{{ deseo() }}</span>
      } @else if (dim()) {
        <span class="etiqueta falta">falta</span>
      }
      <div class="panel">
        <app-qty-control
          [cardId]="card().cardId"
          [fixed]="readonly() ? owned() : null"
          [overlay]="true"
        />
        @if (!readonly() && wish.editable()) {
          <div class="deseos">
            @if (deseo()) {
              <button
                type="button"
                class="descartar activo-deseo quitar"
                [attr.aria-label]="'Quitar una copia de ' + card().name + ' de la lista de deseos'"
                (click)="wish.adjust(card().cardId, -1)"
              >
                −
              </button>
            }
            <button
              type="button"
              class="descartar"
              [class.activo-deseo]="deseo()"
              [attr.aria-label]="'Añadir ' + card().name + ' a la lista de deseos'"
              (click)="wish.adjust(card().cardId, 1)"
            >
              {{ deseo() ? '♥ Deseo ×' + deseo() + ' +' : '♡ A deseos' }}
            </button>
          </div>
        }
        @if (!readonly() && descartadas.lista()) {
          <button
            type="button"
            class="descartar"
            [attr.aria-pressed]="descartada()"
            [attr.aria-label]="(descartada() ? 'Volver a querer ' : 'No quiero ') + card().name"
            (click)="descartadas.alternar(card().cardId)"
          >
            {{ descartada() ? 'La quiero' : 'No la quiero' }}
          </button>
        }
        @if (!readonly() && intercambiables.lista() && copias() > 0) {
          <button
            type="button"
            class="descartar"
            [class.activo]="paraCambiar()"
            [attr.aria-pressed]="paraCambiar()"
            (click)="intercambiables.alternar(card().cardId)"
          >
            {{ paraCambiar() ? '⇄ Para cambiar ✓' : '⇄ Para cambiar' }}
          </button>
        }
      </div>
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
    .marco {
      position: relative;
      overflow: hidden;
      border-radius: var(--radio-s);
    }
    .imagen {
      display: block;
    }
    img {
      display: block;
      width: 100%;
      height: auto;
      aspect-ratio: 744 / 1039;
      object-fit: contain;
      background: var(--surface-2);
      transition:
        filter 0.15s ease,
        transform 0.25s ease;
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
    .etiqueta.descartada {
      background: #b3261e;
      color: #fff;
    }
    .descartar {
      display: block;
      width: 100%;
      margin-top: 6px;
      padding: 4px 6px;
      font-size: 0.72rem;
      background: rgb(255 255 255 / 0.08);
      color: var(--muted);
      border: 1px solid rgb(255 255 255 / 0.15);
      box-shadow: none;
      backdrop-filter: blur(6px);
    }

    .deseos {
      display: flex;
      gap: 4px;
    }
    .deseos .descartar {
      flex: 1;
    }
    .deseos .quitar {
      flex: 0 0 30px;
      order: 1;
    }
    .descartar.activo-deseo {
      color: #fb7185;
      border-color: #fb7185;
    }
    .etiqueta.deseada {
      background: rgb(225 29 72 / 0.85);
      color: #fff;
    }
    .descartar.activo {
      color: var(--hextech);
      border-color: var(--hextech);
    }

    /* El panel del +/−: degradado oscuro sobre la parte de abajo de la imagen. */
    .panel {
      position: absolute;
      inset: auto 0 0 0;
      padding: 28px 8px 8px;
      background: linear-gradient(to bottom, transparent, rgb(0 0 0 / 0.85) 40%);
      transition:
        opacity 0.15s ease,
        transform 0.15s ease;
    }

    /* Con ratón: el panel aparece al pasar por encima o al llegar con el tabulador,
       y la carta se levanta un poco. */
    @media (hover: hover) {
      .panel {
        opacity: 0;
        transform: translateY(8px);
        pointer-events: none;
      }
      :host(:hover) .panel,
      :host(:focus-within) .panel {
        opacity: 1;
        transform: none;
        pointer-events: auto;
      }
      :host(:hover) {
        transform: translateY(-4px);
        box-shadow:
          0 14px 32px rgb(0 0 0 / 0.5),
          0 0 24px color-mix(in srgb, var(--dom-a) 35%, transparent);
        border-color: var(--dom-a);
      }
      :host(:hover) img {
        transform: scale(1.03);
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
      .panel {
        transition: none;
      }
      :host(:hover),
      :host(:hover) img {
        transform: none;
      }
    }
    .etiqueta {
      position: absolute;
      top: 6px;
      left: 6px;
      z-index: 1;
      pointer-events: none;
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
    .etiqueta.falta {
      background: rgb(0 0 0 / 0.65);
      color: var(--muted);
      border: 1px solid var(--border);
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
    }
    .precio {
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }
    .codigo {
      overflow: hidden;
      text-overflow: ellipsis;
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
    '[style]': 'colores()',
  },
})
export class CardTileComponent {
  private readonly valuation = inject(ValuationService);
  protected readonly volarA = volarA;
  protected readonly descartadas = inject(DescartadasService);
  protected readonly wish = inject(WishlistService);
  /** Copias que pides en la lista de deseos (0 si no está). */
  protected readonly deseo = computed(() => this.wish.get(this.card().cardId)?.qty ?? 0);
  protected readonly intercambiables = inject(IntercambiablesService);
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
