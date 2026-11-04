import { Component, input } from '@angular/core';

/**
 * Cabecera común de las páginas: título, una línea de resumen y, a la derecha, las
 * acciones que se proyecten dentro. Así todas las secciones arrancan igual.
 */
@Component({
  selector: 'app-cabecera',
  template: `
    <header class="cabecera-pagina entrada">
      <div class="textos">
        <h1>{{ titulo() }}</h1>
        @if (subtitulo()) {
          <p class="muted">{{ subtitulo() }}</p>
        }
      </div>
      <div class="acciones-cabecera">
        <ng-content />
      </div>
    </header>
  `,
  styles: `
    .cabecera-pagina {
      display: flex;
      flex-wrap: wrap;
      align-items: flex-end;
      justify-content: space-between;
      gap: 10px 16px;
      padding-bottom: 12px;
      border-bottom: 1px solid var(--border);
    }
    .textos {
      display: grid;
      gap: 2px;
      min-width: 0;
    }
    h1 {
      margin: 0;
    }
    p {
      margin: 0;
      font-size: 0.9rem;
      max-width: 70ch;
    }
    .acciones-cabecera {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      align-items: center;
    }
    .acciones-cabecera:empty {
      display: none;
    }
  `,
})
export class CabeceraComponent {
  readonly titulo = input.required<string>();
  readonly subtitulo = input('');
}
