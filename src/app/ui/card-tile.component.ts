import { Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CatalogCard } from '../core/catalog.service';
import { CardQty } from '../core/collection.service';
import { IntercambiablesService } from '../core/intercambiables.service';
import { DescartadasService } from '../core/descartadas.service';
import { ValuationService } from '../core/valuation.service';
import { ConfidenceBadgeComponent } from './confidence-badge.component';
import { EurPipe, ThumbPipe } from './pipes';
import { QtyControlComponent } from './qty-control.component';

/**
 * Una carta en cuadrícula. El +/− de normal y foil va encima de la imagen: en
 * escritorio aparece al pasar el ratón (o al llegar con el tabulador) y en pantallas
 * táctiles, donde no hay "pasar el ratón", se ve siempre. La usan el catálogo y la
 * vista de carpeta de Mi colección.
 */
@Component({
  selector: 'app-card-tile',
  imports: [RouterLink, QtyControlComponent, ConfidenceBadgeComponent, EurPipe, ThumbPipe],
  template: `
    <div class="marco">
      <!-- Los botones no pueden ir dentro de un enlace (HTML inválido, y el teclado se
           lía): la imagen es un enlace y el panel, un hermano posicionado encima.
           Fuera del tabulador porque el nombre de abajo lleva al mismo sitio. -->
      <a [routerLink]="['/carta', card().cardId]" class="imagen" tabindex="-1" aria-hidden="true">
        <img
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
      } @else if (dim()) {
        <span class="etiqueta falta">falta</span>
      }
      <div class="panel">
        <app-qty-control
          [cardId]="card().cardId"
          [fixed]="readonly() ? owned() : null"
          [overlay]="true"
        />
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
    <a [routerLink]="['/carta', card().cardId]" class="enlace-carta">
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
    :host {
      display: grid;
      min-width: 0;
      gap: 8px;
      align-content: start;
      padding: 8px;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radio);
      /* Las que quedan fuera de pantalla no se pintan: las carpetas tienen cientos. */
      content-visibility: auto;
      contain-intrinsic-size: auto 320px;
      transition:
        transform 0.15s ease,
        box-shadow 0.15s ease,
        border-color 0.15s ease;
    }
    :host(.tengo) {
      border-color: color-mix(in srgb, var(--accent) 55%, var(--border));
    }
    .enlace-carta {
      display: grid;
      gap: 4px;
      color: inherit;
      text-decoration: none;
    }
    .enlace-carta:hover .nombre {
      color: var(--accent);
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
          0 0 0 1px var(--accent-suave);
        border-color: color-mix(in srgb, var(--accent) 70%, transparent);
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
      border-color: var(--accent);
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
      background: var(--accent);
      color: #15120a;
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
  },
})
export class CardTileComponent {
  private readonly valuation = inject(ValuationService);
  protected readonly descartadas = inject(DescartadasService);
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

  protected readonly pricing = computed(() => this.valuation.pricing(this.card().cardId));
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
