import { Component, computed, inject, input } from '@angular/core';
import { CollectionService, Finish } from '../core/collection.service';

/** Copias normales y foil de una carta, con +/−. En solo lectura enseña los números sin botones. */
@Component({
  selector: 'app-qty-control',
  template: `
    @for (f of finishes; track f.id) {
      <div class="fila" [class.tiene]="qty()[f.id] > 0">
        <span class="etiqueta">{{ f.label }}</span>
        @if (col.editable()) {
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
        @if (col.editable()) {
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
    .paso:not(:disabled):hover {
      border-color: var(--accent);
    }
  `,
})
export class QtyControlComponent {
  protected readonly col = inject(CollectionService);
  readonly cardId = input.required<string>();
  protected readonly qty = computed(() => this.col.qty(this.cardId()));
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
