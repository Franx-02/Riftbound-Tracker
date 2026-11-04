import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { CatalogService } from '../core/catalog.service';
import { estiloDominios } from '../core/dominios';
import { MazoImportado, importarMazo } from '../core/importar-mazo';
import { esLegal, tamanoPrincipal, validar } from '../core/mazos';
import { MazosService } from '../core/mazos.service';
import { ThumbPipe } from '../ui/pipes';
import { InclinarDirective } from '../ui/inclinar.directive';
import { CabeceraComponent } from '../ui/cabecera.component';

/** Lista de tus mazos, con su Leyenda de portada y si cumplen las reglas. */
@Component({
  selector: 'app-mazos-page',
  imports: [CabeceraComponent, RouterLink, ThumbPipe, InclinarDirective],
  template: `
    <main class="pagina">
      <app-cabecera
        titulo="Mazos"
        subtitulo="Crea mazos con las reglas oficiales y mira qué te falta de tu colección."
      >
        <button type="button" class="secondary" (click)="abierto.set(!abierto())">Importar</button>
        <button type="button" (click)="nuevo()">+ Nuevo mazo</button>
      </app-cabecera>

      @if (abierto()) {
        <section class="importar">
          <h2>Importar un mazo</h2>
          <p class="muted">
            Pega la lista (una carta por línea, como "3 Brawl" o "3x Brawl") o sube un .txt. Vale la
            que exporta esta app y la de las webs de mazos habituales.
          </p>
          <textarea
            rows="10"
            aria-label="Lista del mazo"
            placeholder="Legend:&#10;1 Jinx, Loose Cannon&#10;&#10;Main Deck:&#10;3 Brawl&#10;..."
            [value]="texto()"
            (input)="texto.set($any($event.target).value)"
          ></textarea>
          <div class="acciones">
            <label class="secondary fichero">
              Subir .txt
              <input type="file" accept=".txt,text/plain" (change)="leerFichero($event)" />
            </label>
            <button type="button" [disabled]="!texto().trim()" (click)="importar()">
              Importar
            </button>
          </div>
          @if (resultado(); as r) {
            @if (r.cartas === 0) {
              <p class="error" role="alert">No se ha reconocido ninguna carta.</p>
            } @else if (r.noEncontradas.length) {
              <p class="error" role="alert">
                Importadas {{ r.cartas }} cartas, pero no se han encontrado estas líneas:
              </p>
              <ul class="no-encontradas">
                @for (l of r.noEncontradas; track $index) {
                  <li>{{ l }}</li>
                }
              </ul>
              <button type="button" (click)="abrir(r.mazo.id)">Abrir el mazo</button>
            }
          }
        </section>
      }

      @if (mazos.error()) {
        <p class="error" role="alert">{{ mazos.error() }}</p>
      }

      @if (!mazos.cargado() || !catalog.loaded()) {
        <p class="muted">Cargando tus mazos…</p>
      } @else {
        <ul class="rejilla entrada">
          @for (m of lista(); track m.mazo.id) {
            <li>
              <a
                class="mazo"
                [appInclinar]="6"
                [routerLink]="['/mazos', m.mazo.id]"
                [style]="m.colores"
              >
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
    .acciones {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      align-items: center;
    }
    .importar {
      display: grid;
      gap: 10px;
      padding: 16px;
      border: 1px solid var(--border);
      border-radius: 12px;
      background: var(--surface);
    }
    .importar h2,
    .importar p {
      margin: 0;
    }
    .importar textarea {
      width: 100%;
      font-family: ui-monospace, monospace;
      font-size: 0.85rem;
      resize: vertical;
    }
    .fichero {
      position: relative;
      cursor: pointer;
      padding: 8px 14px;
      border: 1px solid var(--border);
      border-radius: 8px;
    }
    .fichero input {
      position: absolute;
      inset: 0;
      opacity: 0;
      cursor: pointer;
    }
    .no-encontradas {
      margin: 0;
      font-family: ui-monospace, monospace;
      font-size: 0.8rem;
      color: var(--muted);
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
        transform 0.35s cubic-bezier(0.2, 0.8, 0.2, 1),
        box-shadow 0.15s ease;
    }
    .mazo img {
      transition: transform 0.5s cubic-bezier(0.2, 0.8, 0.2, 1);
    }
    .mazo:hover img {
      transform: scale(1.06);
    }
    .mazo:hover {
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

  protected readonly abierto = signal(false);
  protected readonly texto = signal('');
  protected readonly resultado = signal<MazoImportado | null>(null);

  protected async leerFichero(e: Event): Promise<void> {
    const fichero = (e.target as HTMLInputElement).files?.[0];
    if (fichero) this.texto.set(await fichero.text());
  }

  protected importar(): void {
    const id = crypto.randomUUID().replace(/-/g, '').slice(0, 20);
    const r = importarMazo(this.texto(), this.catalog.cards(), id);
    this.resultado.set(r);
    if (r.cartas === 0) return;
    this.mazos.guardar(r.mazo);
    if (!r.noEncontradas.length) this.abrir(id);
  }

  protected abrir(id: string): void {
    void this.router.navigate(['/mazos', id]);
  }

  protected nuevo(): void {
    const id = this.mazos.crear();
    void this.router.navigate(['/mazos', id]);
  }
}
