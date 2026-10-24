import { Component, computed, input } from '@angular/core';
import { CardPricing } from '../core/valuation.service';

/**
 * Avisa cuando el precio no es de fiar del todo. Con confianza alta no enseña nada:
 * es lo normal y llenar la pantalla de marcas verdes solo mete ruido.
 */
@Component({
  selector: 'app-confidence-badge',
  template: `
    @if (texto(); as t) {
      <span class="badge" [class]="clase()" [title]="pricing().motivo">{{ t }}</span>
    }
  `,
  styles: `
    .badge {
      display: inline-block;
      font-size: 0.7rem;
      font-weight: 600;
      padding: 1px 6px;
      border-radius: 999px;
      border: 1px solid currentColor;
      white-space: nowrap;
    }
    .corregido {
      color: var(--ok);
    }
    .baja {
      color: var(--accent);
    }
    .sin-mapear {
      color: var(--error);
    }
  `,
})
export class ConfidenceBadgeComponent {
  readonly pricing = input.required<CardPricing>();

  protected readonly clase = computed(() =>
    this.pricing().corregido ? 'corregido' : this.pricing().confianza,
  );

  protected readonly texto = computed(() => {
    const p = this.pricing();
    if (p.corregido) return 'corregido';
    // Media no se marca: casi siempre son alt arts bien emparejados, y la ficha ya
    // explica el motivo. El traspaso pide marcar solo la baja (sección 6).
    switch (p.confianza) {
      case 'baja':
        return 'precio aproximado';
      case 'sin-mapear':
        return 'sin producto';
      default:
        return null;
    }
  });
}
