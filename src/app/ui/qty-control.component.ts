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
      <div class="fila" [class.tiene]="qty()[f.id] > 0">
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
    .paso:not(:disabled):hover {
      border-color: var(--accent);
    }
  `,
})
export class QtyControlComponent {
  protected readonly col = inject(CollectionService);
  readonly cardId = input.required<string>();
  /** Cifras ajenas, en solo lectura. Sin él se usan y se editan las de tu colección. */
  readonly fixed = input<CardQty | null>(null);
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
