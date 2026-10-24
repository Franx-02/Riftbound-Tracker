import { Component, ElementRef, OnDestroy, effect, inject, input, output } from '@angular/core';

/**
 * Botón "Mostrar más" que además se pulsa solo al acercarse al final de la página.
 * El botón se queda para teclado y lectores de pantalla. Se pinta debajo de cada
 * tanda nueva, así que vuelve a observarse cada vez que cambia `remaining`.
 */
@Component({
  selector: 'app-load-more',
  template: `
    <button class="secondary" type="button" (click)="more.emit()">
      Mostrar más ({{ remaining() }} {{ remaining() === 1 ? 'restante' : 'restantes' }})
    </button>
  `,
  styles: `
    :host {
      display: grid;
      place-items: center;
      padding: 24px;
    }
  `,
})
export class LoadMoreComponent implements OnDestroy {
  readonly remaining = input.required<number>();
  readonly more = output<void>();

  private readonly el = inject(ElementRef<HTMLElement>);
  private readonly observador =
    typeof IntersectionObserver === 'undefined'
      ? null
      : new IntersectionObserver(
          (entradas) => {
            if (entradas.some((e) => e.isIntersecting)) this.more.emit();
          },
          { rootMargin: '600px' },
        );

  constructor() {
    effect(() => {
      this.remaining();
      this.observador?.disconnect();
      this.observador?.observe(this.el.nativeElement);
    });
  }

  ngOnDestroy(): void {
    this.observador?.disconnect();
  }
}
