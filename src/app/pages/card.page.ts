import { DatePipe, Location } from '@angular/common';
import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { Router, RouterLink } from '@angular/router';
import { CatalogService } from '../core/catalog.service';
import { CollectionService } from '../core/collection.service';
import { MappingOverridesService } from '../core/mapping-overrides.service';
import { PricesService } from '../core/prices.service';
import { ValuationService } from '../core/valuation.service';
import { ConfidenceBadgeComponent } from '../ui/confidence-badge.component';
import { EurPipe, ThumbPipe } from '../ui/pipes';
import { QtyControlComponent } from '../ui/qty-control.component';
import { RulesTextComponent } from '../ui/rules-text.component';

@Component({
  selector: 'app-card-page',
  imports: [
    RouterLink,
    DatePipe,
    EurPipe,
    ThumbPipe,
    QtyControlComponent,
    ConfidenceBadgeComponent,
    RulesTextComponent,
  ],
  template: `
    <main class="pagina">
      <button class="secondary volver" type="button" (click)="volver()">← Volver</button>

      @if (!catalog.loaded()) {
        <p class="muted">Cargando…</p>
      } @else if (!card()) {
        <p>
          No hay ninguna carta con el código <strong>{{ cardId() }}</strong
          >.
        </p>
        <a routerLink="/catalogo">Ir al catálogo</a>
      } @else {
        @let c = card()!;
        @let p = pricing();
        <article class="ficha">
          <img
            class="imagen"
            [src]="c.imgUrl | thumb: 600"
            [alt]="c.name"
            width="372"
            height="520"
          />

          <div class="datos">
            <header>
              <h1>{{ c.name }}</h1>
              <p class="muted">{{ c.cardId }} · {{ c.setName }} · {{ c.rarity }}</p>
              <p class="tipo">
                {{ c.supertype ? c.supertype + ' ' : '' }}{{ c.type }}
                @if (c.domains.length) {
                  · {{ c.domains.join(', ') }}
                }
                @if (c.energy !== null) {
                  · energía {{ c.energy }}
                }
                @if (c.might !== null) {
                  · might {{ c.might }}
                }
                @if (c.power !== null) {
                  · power {{ c.power }}
                }
              </p>
            </header>

            <section class="bloque">
              <h2>Mis copias</h2>
              @if (col.editable()) {
                <app-qty-control [cardId]="c.cardId" />
              } @else {
                <p class="muted">Cargando tu colección…</p>
              }
              @if (col.error()) {
                <p class="error" role="alert">No se pudo guardar: {{ col.error() }}</p>
              }
            </section>

            <section class="bloque">
              <h2>
                Precio en Cardmarket
                <app-confidence-badge [pricing]="p" />
              </h2>
              @if (!prices.data() && !prices.error()) {
                <p class="muted">Cargando precios…</p>
              } @else if (!p.idProduct) {
                <p>
                  Esta carta no se vende suelta en Cardmarket, o no se ha encontrado su producto.
                </p>
              } @else {
                <dl class="precios">
                  <div>
                    <dt>Normal</dt>
                    <dd class="grande">{{ p.normal | eur }}</dd>
                    @if (p.detalle; as d) {
                      <dd class="muted">
                        desde {{ d.low | eur: '—' }} · media 7 días {{ d.avg7 | eur: '—' }}
                      </dd>
                    }
                  </div>
                  <div>
                    <dt>Foil</dt>
                    <dd class="grande">{{ p.foil | eur }}</dd>
                    @if (p.detalle; as d) {
                      <dd class="muted">desde {{ d.lowFoil | eur: '—' }}</dd>
                    }
                  </div>
                </dl>
                <p class="muted nota">
                  Tendencia del día. Producto {{ p.idProduct }}
                  @if (prices.data(); as d) {
                    · actualizado {{ d.updatedAt | date: 'dd/MM/yyyy HH:mm' }}
                  }
                </p>
              }
              <p class="motivo">{{ p.motivo }}</p>

              @if (candidatos().length > 1 || p.corregido) {
                <button
                  class="secondary"
                  type="button"
                  (click)="corrigiendo.set(!corrigiendo())"
                  [attr.aria-expanded]="corrigiendo()"
                >
                  {{ corrigiendo() ? 'Cerrar' : '¿Precio equivocado? Elegir otro producto' }}
                </button>
              }

              @if (corrigiendo()) {
                <div class="corregir">
                  <p class="muted">
                    Cardmarket tiene {{ candidatos().length }}
                    {{ candidatos().length === 1 ? 'producto' : 'productos' }} con este nombre.
                    Elige el que corresponde a esta carta; el cambio vale para todo el grupo.
                  </p>
                  <ul>
                    @for (k of candidatos(); track k.idProduct) {
                      @let precio = valuation.productPrice(k.idProduct);
                      <li [class.actual]="k.idProduct === p.idProduct">
                        <span class="exp">{{ catalog.setName(k.set) }}</span>
                        <span class="cifras">
                          {{ precio?.trend ?? null | eur: '—' }} · foil
                          {{ precio?.trendFoil ?? null | eur: '—' }}
                        </span>
                        <span class="id muted">#{{ k.idProduct }}</span>
                        @if (k.idProduct === p.idProduct) {
                          <span class="ok elegido">elegido</span>
                        } @else {
                          <button type="button" class="secondary" (click)="elegir(k.idProduct)">
                            Usar este
                          </button>
                        }
                      </li>
                    }
                  </ul>
                  @if (p.corregido) {
                    <p class="muted">
                      {{ p.motivo }}.
                      <button type="button" class="enlace" (click)="restaurar()">
                        Volver al cálculo automático
                      </button>
                    </p>
                  }
                  @if (overrides.error()) {
                    <p class="error" role="alert">
                      No se pudo guardar la corrección: {{ overrides.error() }}
                    </p>
                  }
                </div>
              }
            </section>

            @if (c.text) {
              <section class="bloque">
                <h2>Texto</h2>
                <app-rules-text [text]="c.text" />
                @if (c.flavour) {
                  <p class="flavour">{{ c.flavour }}</p>
                }
              </section>
            }

            @if (c.artist) {
              <p class="muted nota">Ilustración: {{ c.artist }}</p>
            }
          </div>
        </article>
      }
    </main>
  `,
  styles: `
    .pagina {
      padding: 12px 16px 48px;
      max-width: 1000px;
      margin: 0 auto;
    }
    .volver {
      margin-bottom: 12px;
      padding: 6px 12px;
    }
    .ficha {
      display: grid;
      grid-template-columns: minmax(0, 372px) minmax(0, 1fr);
      gap: 24px;
      align-items: start;
    }
    .imagen {
      width: 100%;
      height: auto;
      aspect-ratio: 744 / 1039;
      object-fit: contain;
      border-radius: 12px;
      background: var(--surface-2);
      position: sticky;
      top: 72px;
    }
    h1 {
      margin-bottom: 4px;
    }
    header p {
      margin: 0;
    }
    .tipo {
      margin-top: 4px;
    }
    .datos {
      display: grid;
      gap: 16px;
    }
    .bloque {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 16px;
    }
    .bloque h2 {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .bloque app-qty-control {
      max-width: 260px;
    }
    .precios {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
      margin: 0;
    }
    dt {
      color: var(--muted);
      font-size: 0.85rem;
    }
    dd {
      margin: 0;
    }
    .grande {
      font-size: 1.5rem;
      font-weight: 700;
      font-variant-numeric: tabular-nums;
    }
    .nota {
      font-size: 0.8rem;
      margin: 8px 0 0;
    }
    .motivo {
      font-size: 0.85rem;
      color: var(--muted);
      margin: 8px 0 12px;
    }
    .corregir {
      margin-top: 12px;
    }
    .corregir ul {
      list-style: none;
      padding: 0;
      margin: 8px 0;
      display: grid;
      gap: 6px;
    }
    .corregir li {
      display: grid;
      grid-template-columns: 1fr auto auto auto;
      gap: 12px;
      align-items: center;
      padding: 8px 10px;
      border: 1px solid var(--border);
      border-radius: 8px;
    }
    .corregir li.actual {
      border-color: var(--ok);
    }
    .corregir li button {
      padding: 4px 10px;
    }
    .cifras {
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }
    .id {
      font-size: 0.75rem;
    }
    .elegido {
      font-weight: 600;
      font-size: 0.85rem;
    }
    .enlace {
      background: none;
      border: 0;
      padding: 0;
      color: var(--accent);
      font-weight: inherit;
      text-decoration: underline;
    }
    .flavour {
      font-style: italic;
      color: var(--muted);
      margin: 12px 0 0;
    }

    @media (max-width: 700px) {
      .ficha {
        grid-template-columns: 1fr;
      }
      .imagen {
        position: static;
        max-width: 320px;
        margin: 0 auto;
      }
      .corregir li {
        grid-template-columns: 1fr auto;
      }
      .corregir li .id {
        display: none;
      }
    }
  `,
})
export class CardPage {
  protected readonly catalog = inject(CatalogService);
  protected readonly col = inject(CollectionService);
  protected readonly prices = inject(PricesService);
  protected readonly overrides = inject(MappingOverridesService);
  protected readonly valuation = inject(ValuationService);
  private readonly location = inject(Location);
  private readonly title = inject(Title);
  private readonly router = inject(Router);

  /** De la ruta `/carta/:cardId`. */
  readonly cardId = input.required<string>();

  protected readonly card = computed(() => this.catalog.card(this.cardId()));
  protected readonly pricing = computed(() => this.valuation.pricing(this.cardId()));
  /** Ordenados por precio, como hace el mapeo: así se ve de un vistazo cuál es cuál. */
  protected readonly candidatos = computed(() => {
    const ref = (id: number) => {
      const p = this.valuation.productPrice(id);
      const total = (p?.trend ?? 0) + (p?.trendFoil ?? 0);
      return total || Number.POSITIVE_INFINITY;
    };
    return [...this.catalog.candidates(this.cardId())].sort(
      (a, b) => ref(a.idProduct) - ref(b.idProduct),
    );
  });
  protected readonly corrigiendo = signal(false);

  constructor() {
    effect(() => {
      const c = this.card();
      this.title.setTitle(c ? `${c.name} · Riftbound` : 'Carta · Riftbound');
    });
  }

  protected async elegir(idProduct: number): Promise<void> {
    await this.overrides.set(this.cardId(), idProduct);
    if (!this.overrides.error()) this.corrigiendo.set(false);
  }

  protected async restaurar(): Promise<void> {
    await this.overrides.clear(this.cardId());
  }

  protected volver(): void {
    // Si se entró directo por URL no hay historial dentro de la app: al catálogo.
    if (history.length > 1) this.location.back();
    else void this.router.navigateByUrl('/catalogo');
  }
}
