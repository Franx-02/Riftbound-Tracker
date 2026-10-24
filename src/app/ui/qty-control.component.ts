import { Component, computed, inject, input } from '@angular/core';
import { CardQty, CollectionService, Finish } from '../core/collection.service';

/**
 * Copias normales y foil de una carta, con +/−. Con `fixed` enseña esas cifras sin
 * botones: es como se pinta la colección de otro miembro del grupo.
 */
@Component({
  selector: 'app-qty-control',
  template: `
    @for (f of finishes; track f.id) {
      <div class="fila" [class.tiene]="qty()[f.id] > 0" [class.foil]="f.id === 'foil'">
        <span class="etiqueta">{{ f.label }}</span>
        @if (editable()) {
          <button
            type="button"
            class="paso"
            [disabled]="qty()[f.id] === 0"
            [attr.aria-label]="'Quitar una ' + f.label.toLowerCase()"
            (click)="ajustar($event, f.id, -1)"
          >
            −
          </button>
        }
        <span class="n" aria-live="polite">{{ qty()[f.id] }}</span>
        @if (editable()) {
          <button
            type="button"
            class="paso"
            [attr.aria-label]="'Añadir una ' + f.label.toLowerCase()"
            (click)="ajustar($event, f.id, 1)"
          >
            +
          </button>
        }
      </div>
    }
  `,
  styles: `
    :host {
      display: grid;
      gap: 4px;
    }
    .fila {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .etiqueta {
      flex: 1;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      font-size: 0.8rem;
      color: var(--muted);
    }
    .tiene .etiqueta {
      color: var(--text);
    }
    .n {
      min-width: 1.6em;
      text-align: center;
      font-variant-numeric: tabular-nums;
      font-weight: 600;
    }
    .paso {
      width: 32px;
      height: 32px;
      padding: 0;
      display: grid;
      place-items: center;
      font-size: 1.1rem;
      line-height: 1;
      background: var(--surface-2);
      color: var(--text);
      border-color: var(--border);
    }
    /* En las tarjetas de dos columnas del móvil no caben botones de 32 px. */
    @media (max-width: 420px) {
      .fila {
        gap: 4px;
      }
      .paso {
        width: 28px;
        height: 28px;
      }
    }
    @media (hover: hover) {
      .paso:not(:disabled):hover {
        border-color: var(--accent);
      }
    }

    /* Variante para ir encima de la imagen de la carta (ver card-tile). */
    :host(.overlay) {
      gap: 3px;
      color: #fff;
    }
    :host(.overlay) .etiqueta {
      color: rgb(255 255 255 / 0.7);
      font-size: 0.72rem;
      font-weight: 700;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }
    :host(.overlay) .tiene .etiqueta {
      color: #fff;
    }
    :host(.overlay) .tiene.foil .etiqueta {
      background: linear-gradient(90deg, #f6d365, #fda085, #a1c4fd, #c2e9fb);
      -webkit-background-clip: text;
      background-clip: text;
      color: transparent;
    }
    :host(.overlay) .n {
      text-shadow: 0 1px 2px rgb(0 0 0 / 0.8);
    }
    :host(.overlay) .paso {
      width: 28px;
      height: 28px;
      background: rgb(0 0 0 / 0.55);
      border-color: rgb(255 255 255 / 0.25);
      color: #fff;
      backdrop-filter: blur(2px);
    }
    :host(.overlay) .paso:focus-visible {
      background: var(--accent);
      border-color: var(--accent);
      color: #15120a;
    }
    /* Solo con ratón: en táctil el :hover se queda "pegado" al botón tras tocarlo. */
    @media (hover: hover) {
      :host(.overlay) .paso:not(:disabled):hover {
        background: var(--accent);
        border-color: var(--accent);
        color: #15120a;
      }
    }
    :host(.overlay) .paso:disabled {
      opacity: 0.35;
    }
  `,
  host: {
    '[class.overlay]': 'overlay()',
  },
})
export class QtyControlComponent {
  protected readonly col = inject(CollectionService);
  readonly cardId = input.required<string>();
  /** Cifras ajenas, en solo lectura. Sin él se usan y se editan las de tu colección. */
  readonly fixed = input<CardQty | null>(null);
  /** Estilo para ir encima de la imagen de la carta. */
  readonly overlay = input(false);
  protected readonly qty = computed(() => this.fixed() ?? this.col.qty(this.cardId()));
  protected readonly editable = computed(() => !this.fixed() && this.col.editable());
  protected readonly finishes: { id: Finish; label: string }[] = [
    { id: 'normal', label: 'Normal' },
    { id: 'foil', label: 'Foil' },
  ];

  protected ajustar(ev: Event, finish: Finish, delta: number): void {
    // Va dentro de enlaces a la ficha: el clic en +/− no debe navegar.
    ev.preventDefault();
    ev.stopPropagation();
    this.col.adjust(this.cardId(), finish, delta);
  }
}
