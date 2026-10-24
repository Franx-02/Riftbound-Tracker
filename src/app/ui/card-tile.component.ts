import { Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CatalogCard } from '../core/catalog.service';
import { CardQty } from '../core/collection.service';
import { ValuationService } from '../core/valuation.service';
import { ConfidenceBadgeComponent } from './confidence-badge.component';
import { EurPipe, ThumbPipe } from './pipes';
import { QtyControlComponent } from './qty-control.component';

/**
 * Una carta en cuadrícula: imagen, nombre, código, precio y +/−. La usan el catálogo
 * y la vista de carpeta de Mi colección.
 */
@Component({
  selector: 'app-card-tile',
  imports: [RouterLink, QtyControlComponent, ConfidenceBadgeComponent, EurPipe, ThumbPipe],
  template: `
    <a [routerLink]="['/carta', card().cardId]" class="enlace-carta">
      <span class="marco">
        <img
          [src]="card().imgUrl | thumb: 300"
          [alt]="card().name"
          loading="lazy"
          decoding="async"
          width="240"
          height="335"
        />
        @if (copias() > 0) {
          <span class="etiqueta tengo" [title]="detalleCopias()">×{{ copias() }}</span>
        } @else if (dim()) {
          <span class="etiqueta falta">falta</span>
        }
      </span>
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
    <app-qty-control [cardId]="card().cardId" [fixed]="readonly() ? owned() : null" />
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
      border-radius: 12px;
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
    .marco {
      position: relative;
      display: block;
    }
    img {
      display: block;
      width: 100%;
      height: auto;
      aspect-ratio: 744 / 1039;
      object-fit: contain;
      border-radius: 6px;
      background: var(--surface-2);
      transition: filter 0.15s ease;
    }
    /* La que no tienes se ve apagada, como un hueco en la carpeta, pero reconocible. */
    :host(.apagada) img {
      filter: grayscale(0.85) brightness(0.4);
    }
    :host(.apagada) .enlace-carta:hover img,
    :host(.apagada) .enlace-carta:focus-visible img {
      filter: grayscale(0.4) brightness(0.75);
    }
    .etiqueta {
      position: absolute;
      top: 6px;
      left: 6px;
      padding: 1px 7px;
      border-radius: 6px;
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
  },
})
export class CardTileComponent {
  private readonly valuation = inject(ValuationService);

  readonly card = input.required<CatalogCard>();
  /** Copias que se enseñan: las tuyas, o las de otro usuario si `readonly`. */
  readonly owned = input.required<CardQty>();
  /** Copias de otro usuario: números sin botones. */
  readonly readonly = input(false);
  /** Oscurecer si no hay copias (vista de carpeta). */
  readonly dim = input(false);

  protected readonly pricing = computed(() => this.valuation.pricing(this.card().cardId));
  protected readonly copias = computed(() => this.owned().normal + this.owned().foil);
  protected readonly detalleCopias = computed(() => {
    const { normal, foil } = this.owned();
    return `${normal} ${normal === 1 ? 'normal' : 'normales'}, ${foil} foil`;
  });
}
