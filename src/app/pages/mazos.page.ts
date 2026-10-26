import { Component, computed, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { CatalogService } from '../core/catalog.service';
import { estiloDominios } from '../core/dominios';
import { esLegal, tamanoPrincipal, validar } from '../core/mazos';
import { MazosService } from '../core/mazos.service';
import { ThumbPipe } from '../ui/pipes';

/** Lista de tus mazos, con su Leyenda de portada y si cumplen las reglas. */
@Component({
  selector: 'app-mazos-page',
  imports: [RouterLink, ThumbPipe],
  template: `
    <main class="pagina">
      <header class="cabecera">
        <div>
          <h1>Mazos</h1>
          <p class="muted">
            Crea mazos con las reglas oficiales y mira qué te falta de tu colección.
          </p>
        </div>
        <button type="button" (click)="nuevo()">+ Nuevo mazo</button>
      </header>

      @if (mazos.error()) {
        <p class="error" role="alert">{{ mazos.error() }}</p>
      }

      @if (!mazos.cargado() || !catalog.loaded()) {
        <p class="muted">Cargando tus mazos…</p>
      } @else {
        <ul class="rejilla">
          @for (m of lista(); track m.mazo.id) {
            <li>
              <a class="mazo" [routerLink]="['/mazos', m.mazo.id]" [style]="m.colores">
                @if (m.leyenda) {
                  <img [src]="m.leyenda.imgUrl | thumb: 400" alt="" aria-hidden="true" />
                } @else {
                  <span class="sin-leyenda" aria-hidden="true">?</span>
                }
                <span class="info">
                  <span class="nombre">{{ m.mazo.nombre }}</span>
                  <span class="muted">{{ m.leyenda?.name ?? 'Sin Leyenda' }}</span>
                  <span class="pie">
                    <span>{{ m.tamano }}/40</span>
                    <span class="estado" [class.legal]="m.legal">{{
                      m.legal ? 'Legal' : 'Incompleto'
                    }}</span>
                  </span>
                </span>
              </a>
            </li>
          } @empty {
            <li class="vacio muted">Aún no tienes mazos. Crea el primero.</li>
          }
        </ul>
      }
    </main>
  `,
  styles: `
    .pagina {
      padding: 20px 16px 48px;
      max-width: 1240px;
      margin: 0 auto;
      display: grid;
      gap: 20px;
    }
    .cabecera {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      gap: 16px;
      flex-wrap: wrap;
    }
    .cabecera p {
      margin: 0;
    }
    .rejilla {
      list-style: none;
      margin: 0;
      padding: 0;
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
      gap: 16px;
    }
    .mazo {
      --dom-a: var(--colorless);
      --dom-b: var(--colorless);
      position: relative;
      display: grid;
      align-items: end;
      height: 300px;
      border-radius: var(--radio);
      overflow: hidden;
      color: var(--text);
      text-decoration: none;
      border: 1px solid color-mix(in srgb, var(--dom-a) 40%, transparent);
      background: var(--surface);
      box-shadow: var(--sombra);
      isolation: isolate;
      transition:
        transform 0.15s ease,
        box-shadow 0.15s ease;
    }
    .mazo:hover {
      transform: translateY(-3px);
      box-shadow: 0 0 26px color-mix(in srgb, var(--dom-a) 35%, transparent);
      border-color: var(--dom-a);
    }
    .mazo img {
      position: absolute;
      inset: 0;
      z-index: -1;
      width: 100%;
      height: 100%;
      object-fit: cover;
      object-position: center 20%;
    }
    .mazo::after {
      content: '';
      position: absolute;
      inset: 0;
      z-index: -1;
      background: linear-gradient(180deg, transparent 35%, rgb(13 15 19 / 95%) 75%);
    }
    .sin-leyenda {
      position: absolute;
      inset: 0;
      display: grid;
      place-items: center;
      font-size: 4rem;
      color: var(--muted);
      opacity: 0.3;
    }
    .info {
      display: grid;
      gap: 2px;
      padding: 14px 16px;
      border-top: 3px solid transparent;
      border-image: linear-gradient(90deg, var(--dom-a), var(--dom-b)) 1;
    }
    .nombre {
      font-family: var(--fuente-titulos);
      font-weight: 600;
      font-size: 1.1rem;
    }
    .info .muted {
      font-size: 0.85rem;
    }
    .pie {
      display: flex;
      justify-content: space-between;
      margin-top: 6px;
      font-size: 0.85rem;
      font-variant-numeric: tabular-nums;
    }
    .estado {
      padding: 1px 10px;
      border-radius: 999px;
      background: rgb(244 63 94 / 18%);
      color: #fda4af;
    }
    .estado.legal {
      background: rgb(34 197 94 / 18%);
      color: #86efac;
    }
    .vacio {
      grid-column: 1 / -1;
      padding: 40px 0;
      text-align: center;
    }
  `,
})
export class MazosPage {
  protected readonly mazos = inject(MazosService);
  protected readonly catalog = inject(CatalogService);
  private readonly router = inject(Router);

  constructor() {
    void this.mazos.load();
  }

  protected readonly lista = computed(() =>
    this.mazos.mazos().map((mazo) => {
      const leyenda = mazo.leyenda ? this.catalog.card(mazo.leyenda) : undefined;
      return {
        mazo,
        leyenda,
        colores: estiloDominios(leyenda?.domains ?? []),
        tamano: tamanoPrincipal(mazo),
        legal: esLegal(validar(mazo, (id) => this.catalog.card(id))),
      };
    }),
  );

  protected nuevo(): void {
    const id = this.mazos.crear();
    void this.router.navigate(['/mazos', id]);
  }
}
