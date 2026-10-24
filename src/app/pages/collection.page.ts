import { DatePipe } from '@angular/common';
import {
  Component,
  OnInit,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../core/auth.service';
import { CatalogCard, CatalogService } from '../core/catalog.service';
import { CardQty, CollectionMap, CollectionService, totalsOf } from '../core/collection.service';
import { PricesService } from '../core/prices.service';
import { UsersService } from '../core/users.service';
import { CardPricing, ValuationService } from '../core/valuation.service';
import { ConfidenceBadgeComponent } from '../ui/confidence-badge.component';
import { EurPipe, ThumbPipe } from '../ui/pipes';
import { QtyControlComponent } from '../ui/qty-control.component';

type Orden = 'valor' | 'nombre' | 'set';

interface Fila {
  card: CatalogCard;
  pricing: CardPricing;
  /** El objeto de la colección tal cual: estable entre renders, para el input de +/−. */
  qty: CardQty;
  /** null = alguna copia no tiene precio y no se puede valorar la línea entera. */
  valor: number | null;
  /** Suma de las copias que sí tienen precio, aunque falten otras. */
  valorParcial: number;
}

@Component({
  selector: 'app-collection-page',
  imports: [
    RouterLink,
    DatePipe,
    EurPipe,
    ThumbPipe,
    QtyControlComponent,
    ConfidenceBadgeComponent,
  ],
  template: `
    <main class="pagina">
      <header class="cabecera">
        <h1>
          @if (propia()) {
            Mi colección
          } @else {
            Colección de {{ nombreDueno() }}
          }
        </h1>
        @if (!propia()) {
          <span class="solo-lectura">solo lectura</span>
        }
        <div class="acciones">
          @if (propia()) {
            <a class="enlace-accion" routerLink="/importar">Importar / exportar</a>
          }
          @if (otros().length) {
            <label class="selector">
              <span class="muted">Ver</span>
              <!-- [selected] por opción y no [value] en el select: los perfiles llegan después
                   y un [value] aplicado antes de que exista la opción se pierde. -->
              <select aria-label="Ver la colección de" (change)="cambiarDueno($event)">
                <option value="" [selected]="propia()">Mi colección</option>
                @for (p of otros(); track p.uid) {
                  <option [value]="p.uid" [selected]="p.uid === uid()">{{ p.displayName }}</option>
                }
              </select>
            </label>
          }
        </div>
      </header>

      @if (!catalog.loaded() || !fuente()) {
        <p class="muted">Cargando {{ propia() ? 'tu colección' : 'la colección' }}…</p>
      } @else {
        <section class="resumen" aria-label="Resumen">
          <div class="cifra principal">
            <span class="etiqueta">Valor estimado</span>
            <span class="numero">
              @if (prices.data()) {
                {{ valor().total | eur }}
              } @else if (prices.error()) {
                sin precios
              } @else {
                …
              }
            </span>
            @if (prices.data(); as d) {
              <span class="muted pie"
                >Tendencia de Cardmarket del {{ d.updatedAt | date: 'dd/MM/yyyy' }}</span
              >
            }
          </div>
          <div class="cifra">
            <span class="etiqueta">Cartas distintas</span>
            <span class="numero">{{ totales().cards }}</span>
          </div>
          <div class="cifra">
            <span class="etiqueta">Copias</span>
            <span class="numero">{{ totales().copies }}</span>
            <span class="muted pie"
              >{{ totales().normal }} normales · {{ totales().foil }} foil</span
            >
          </div>
        </section>

        @if (prices.data() && valor().copiasSinPrecio > 0) {
          <details class="aviso">
            <summary>
              <strong
                >{{ valor().copiasSinPrecio }}
                {{ valor().copiasSinPrecio === 1 ? 'copia' : 'copias' }} sin precio</strong
              >
              no {{ valor().copiasSinPrecio === 1 ? 'cuenta' : 'cuentan' }} en el total: Cardmarket
              aún no tiene datos de
              {{ valor().sinPrecio.length === 1 ? 'esa carta' : 'esas cartas' }}. El valor real es
              mayor.
            </summary>
            <ul>
              @for (s of valor().sinPrecio; track s.cardId + s.finish) {
                <li>
                  <a [routerLink]="['/carta', s.cardId]">{{ nombre(s.cardId) }}</a>
                  <span class="muted">
                    · {{ s.cardId }} · {{ s.copias }}
                    {{ s.finish === 'foil' ? 'foil' : 'normal' }}</span
                  >
                </li>
              }
            </ul>
          </details>
        }

        @if (totales().cards === 0) {
          <section class="vacio">
            @if (propia()) {
              <h2>Aún no tienes cartas</h2>
              <p class="muted">
                Búscalas en el catálogo y añádelas con el botón +, o importa la que tengas en
                Riftbound.gg o Riftatlas.
              </p>
              <div class="botones-vacio">
                <a class="boton" routerLink="/catalogo">Ir al catálogo</a>
                <a class="boton secundario" routerLink="/importar">Importar CSV</a>
              </div>
            } @else {
              <h2>{{ nombreDueno() }} aún no tiene cartas</h2>
            }
          </section>
        } @else {
          <section class="controles">
            <input
              type="search"
              placeholder="Buscar en esta colección"
              aria-label="Buscar en esta colección"
              [value]="texto()"
              (input)="texto.set($any($event.target).value)"
            />
            <select
              aria-label="Ordenar"
              [value]="orden()"
              (change)="orden.set($any($event.target).value)"
            >
              <option value="valor">Más valiosas primero</option>
              <option value="nombre">Por nombre</option>
              <option value="set">Por set y número</option>
            </select>
          </section>

          <ul class="lista">
            @for (f of filas(); track f.card.cardId) {
              <li class="fila">
                <a [routerLink]="['/carta', f.card.cardId]" class="miniatura">
                  <img
                    [src]="f.card.imgUrl | thumb: 120"
                    [alt]="f.card.name"
                    loading="lazy"
                    decoding="async"
                    width="60"
                    height="84"
                  />
                </a>
                <div class="info">
                  <a [routerLink]="['/carta', f.card.cardId]" class="nombre">{{ f.card.name }}</a>
                  <span class="muted meta">{{ f.card.cardId }} · {{ f.card.setName }}</span>
                  <app-confidence-badge [pricing]="f.pricing" />
                </div>
                <app-qty-control
                  class="qty"
                  [cardId]="f.card.cardId"
                  [fixed]="propia() ? null : f.qty"
                />
                <div class="valor">
                  @if (f.valor !== null) {
                    {{ f.valor | eur }}
                  } @else if (f.valorParcial > 0) {
                    <span [title]="'Faltan precios de alguna copia: es un mínimo'"
                      >≥ {{ f.valorParcial | eur }}</span
                    >
                  } @else {
                    <span class="muted">sin precio</span>
                  }
                </div>
              </li>
            } @empty {
              <li class="muted">Ninguna carta de esta colección coincide con «{{ texto() }}».</li>
            }
          </ul>
        }

        @if (huerfanas().length) {
          <p class="muted nota">
            {{ huerfanas().length }}
            {{
              huerfanas().length === 1
                ? 'carta guardada no aparece'
                : 'cartas guardadas no aparecen'
            }}
            en el catálogo y no {{ huerfanas().length === 1 ? 'se muestra' : 'se muestran' }}:
            {{ huerfanas().join(', ') }}.
          </p>
        }
      }

      @if (col.error()) {
        <p class="error" role="alert">
          {{ propia() ? 'No se pudo guardar' : 'No se pudo leer la colección' }}: {{ col.error() }}
        </p>
      }
    </main>
  `,
  styles: `
    .pagina {
      padding: 12px 16px 48px;
      max-width: 900px;
      margin: 0 auto;
      display: grid;
      gap: 16px;
    }
    .cabecera {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px 12px;
    }
    .cabecera h1 {
      margin: 0;
      font-size: 1.3rem;
    }
    .solo-lectura {
      font-size: 0.75rem;
      color: var(--muted);
      border: 1px solid var(--border);
      border-radius: 999px;
      padding: 1px 8px;
    }
    .acciones {
      margin-left: auto;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px 16px;
    }
    .enlace-accion {
      font-size: 0.9rem;
    }
    .selector {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 0.9rem;
    }
    .botones-vacio {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      justify-content: center;
    }
    .boton.secundario {
      background: transparent;
      color: var(--text);
      border: 1px solid var(--border);
    }
    .resumen {
      display: grid;
      grid-template-columns: 2fr 1fr 1fr;
      gap: 12px;
    }
    .cifra {
      display: grid;
      gap: 2px;
      align-content: start;
      padding: 14px 16px;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 12px;
    }
    .etiqueta {
      font-size: 0.8rem;
      color: var(--muted);
    }
    .numero {
      font-size: 1.6rem;
      font-weight: 700;
      font-variant-numeric: tabular-nums;
    }
    .principal .numero {
      color: var(--accent);
      font-size: 2rem;
    }
    .pie {
      font-size: 0.75rem;
    }
    .aviso {
      padding: 12px 16px;
      border: 1px dashed var(--accent);
      border-radius: 12px;
      font-size: 0.9rem;
    }
    .aviso summary {
      cursor: pointer;
    }
    .aviso ul {
      margin: 8px 0 0;
      padding-left: 18px;
    }
    .vacio {
      text-align: center;
      padding: 48px 16px;
      display: grid;
      gap: 8px;
      justify-items: center;
    }
    .boton {
      display: inline-block;
      padding: 10px 18px;
      border-radius: 8px;
      background: var(--accent);
      color: #15120a;
      font-weight: 600;
      text-decoration: none;
    }
    .controles {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 8px;
    }
    .lista {
      list-style: none;
      margin: 0;
      padding: 0;
      display: grid;
      gap: 8px;
    }
    .fila {
      display: grid;
      grid-template-columns: 60px minmax(0, 1fr) 190px 90px;
      gap: 12px;
      align-items: center;
      padding: 8px 12px;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 12px;
    }
    .miniatura img {
      display: block;
      width: 60px;
      height: auto;
      aspect-ratio: 744 / 1039;
      object-fit: contain;
      border-radius: 4px;
      background: var(--surface-2);
    }
    .info {
      display: grid;
      gap: 2px;
      justify-items: start;
      min-width: 0;
    }
    .nombre {
      color: var(--text);
      font-weight: 600;
      text-decoration: none;
    }
    .meta {
      font-size: 0.8rem;
    }
    .valor {
      text-align: right;
      font-variant-numeric: tabular-nums;
      font-weight: 600;
    }

    @media (max-width: 640px) {
      .controles {
        grid-template-columns: 1fr;
      }
      .resumen {
        grid-template-columns: 1fr 1fr;
      }
      .principal {
        grid-column: 1 / -1;
      }
      .fila {
        grid-template-columns: 48px minmax(0, 1fr) auto;
        grid-template-areas: 'img info valor' 'img qty qty';
        row-gap: 6px;
      }
      .miniatura {
        grid-area: img;
        align-self: start;
      }
      .miniatura img {
        width: 48px;
      }
      .info {
        grid-area: info;
      }
      .qty {
        grid-area: qty;
      }
      .valor {
        grid-area: valor;
        align-self: start;
      }
    }
  `,
})
export class CollectionPage implements OnInit {
  protected readonly catalog = inject(CatalogService);
  protected readonly col = inject(CollectionService);
  protected readonly prices = inject(PricesService);
  private readonly valuation = inject(ValuationService);
  private readonly users = inject(UsersService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  /** De la ruta `/coleccion/:uid`. Sin él, o si es el tuyo, es tu colección. */
  readonly uid = input<string>();

  protected readonly texto = signal('');
  protected readonly orden = signal<Orden>('valor');

  protected readonly propia = computed(() => {
    const uid = this.uid();
    return !uid || uid === this.auth.user()?.uid;
  });

  /** La colección que se pinta. null mientras se lee. */
  protected readonly fuente = computed<CollectionMap | null>(() => {
    if (this.propia()) return this.col.uid() ? this.col.cards() : null;
    return this.col.other(this.uid()!) ?? null;
  });

  /** Los demás miembros del grupo, para el selector. */
  protected readonly otros = computed(() =>
    this.users.profiles().filter((p) => p.uid !== this.auth.user()?.uid),
  );

  protected readonly nombreDueno = computed(
    () => this.users.profile(this.uid() ?? '')?.displayName ?? 'otro miembro',
  );

  protected readonly totales = computed(() => totalsOf(this.fuente() ?? new Map()));
  protected readonly valor = computed(() => this.valuation.value(this.fuente() ?? new Map()));

  constructor() {
    // Al cambiar de miembro en el selector cambia :uid sin destruir la página.
    // Solo depende de :uid. loadOther lee signals antes de su primer await; sin untracked
    // el efecto se volvería a lanzar al llegar los datos y borraría la búsqueda.
    effect(() => {
      const uid = this.uid();
      const ajena = !this.propia();
      untracked(() => {
        if (uid && ajena) void this.col.loadOther(uid);
        this.texto.set('');
      });
    });
  }

  ngOnInit(): void {
    void this.users.loadProfiles();
  }

  protected cambiarDueno(ev: Event): void {
    const uid = (ev.target as HTMLSelectElement).value;
    void this.router.navigate(uid ? ['/coleccion', uid] : ['/coleccion']);
  }

  private readonly todas = computed<Fila[]>(() => {
    const filas: Fila[] = [];
    for (const [cardId, q] of this.fuente() ?? new Map<string, CardQty>()) {
      const card = this.catalog.card(cardId);
      // Una carta guardada que ya no está en el catálogo (o un id mal importado) no se pierde de vista.
      if (!card) continue;
      const pricing = this.valuation.pricing(cardId);
      const parte = (precio: number | null, n: number) =>
        n === 0 ? 0 : precio === null ? null : precio * n;
      const vn = parte(pricing.normal, q.normal);
      const vf = parte(pricing.foil, q.foil);
      filas.push({
        card,
        pricing,
        qty: q,
        valor: vn === null || vf === null ? null : vn + vf,
        valorParcial: (vn ?? 0) + (vf ?? 0),
      });
    }
    return filas;
  });

  /** Cartas guardadas que no aparecen en el catálogo. */
  protected readonly huerfanas = computed(() => this.valor().fueraDeCatalogo);

  protected readonly filas = computed(() => {
    const q = this.texto().trim().toLowerCase();
    const filtradas = q
      ? this.todas().filter(
          (f) => f.card.name.toLowerCase().includes(q) || f.card.cardId.toLowerCase().includes(q),
        )
      : this.todas();
    const ordenadas = [...filtradas];
    switch (this.orden()) {
      case 'valor':
        ordenadas.sort(
          (a, b) => b.valorParcial - a.valorParcial || a.card.name.localeCompare(b.card.name),
        );
        break;
      case 'nombre':
        ordenadas.sort((a, b) => a.card.name.localeCompare(b.card.name));
        break;
      case 'set':
        ordenadas.sort(
          (a, b) =>
            a.card.set.localeCompare(b.card.set) || a.card.cardId.localeCompare(b.card.cardId),
        );
        break;
    }
    return ordenadas;
  });

  protected nombre(cardId: string): string {
    return this.catalog.card(cardId)?.name ?? cardId;
  }
}
