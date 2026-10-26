import { DatePipe, Location } from '@angular/common';
import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { Router, RouterLink } from '@angular/router';
import { CatalogService } from '../core/catalog.service';
import { CollectionService } from '../core/collection.service';
import { MappingOverridesService } from '../core/mapping-overrides.service';
import { PricesService } from '../core/prices.service';
import { TraduccionService } from '../core/traduccion.service';
import { ValuationService } from '../core/valuation.service';
import { WishlistService } from '../core/wishlist.service';
import { IntercambiablesService } from '../core/intercambiables.service';
import { DescartadasService } from '../core/descartadas.service';
import { colorDominio, estiloDominios } from '../core/dominios';
import { ConfidenceBadgeComponent } from '../ui/confidence-badge.component';
import { EurPipe, ThumbPipe } from '../ui/pipes';
import { QtyControlComponent } from '../ui/qty-control.component';
import { RulesTextComponent } from '../ui/rules-text.component';
import { GraficaPrecioComponent, PuntoPrecio } from '../ui/grafica-precio.component';

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
    GraficaPrecioComponent,
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
        <!-- El arte de la carta, muy difuminado, de fondo de toda la página. -->
        <img class="fondo" [src]="c.imgUrl | thumb: 240" alt="" aria-hidden="true" />
        <article class="ficha" [style]="colores()">
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
              <p class="muted">{{ c.cardId }} · {{ c.setName }} · {{ t.etiqueta(c.rarity) }}</p>
              @if (c.domains.length) {
                <p class="chips">
                  @for (d of c.domains; track d) {
                    <span class="chip-dominio" [style.--dom]="color(d)">{{ t.etiqueta(d) }}</span>
                  }
                </p>
              }
              <p class="tipo">
                {{ tipo() }}
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
              @if (descartadas.lista()) {
                <label class="no-la-quiero">
                  <input
                    type="checkbox"
                    [checked]="descartadas.tiene(c.cardId)"
                    (change)="descartadas.alternar(c.cardId)"
                  />
                  No la quiero en mi colección
                  <span class="muted">(no cuenta como que te falta)</span>
                </label>
              }
              @if (intercambiables.lista()) {
                <label class="no-la-quiero">
                  <input
                    type="checkbox"
                    [checked]="intercambiables.tiene(c.cardId)"
                    (change)="intercambiables.alternar(c.cardId)"
                  />
                  Para cambiar
                  <span class="muted">(sale en Intercambios aunque solo tengas una)</span>
                </label>
              }
              @if (intercambiables.error()) {
                <p class="error" role="alert">{{ intercambiables.error() }}</p>
              }
              @if (descartadas.error()) {
                <p class="error" role="alert">{{ descartadas.error() }}</p>
              }
            </section>

            <section class="bloque">
              <h2>Lista de deseos</h2>
              @if (!wish.editable()) {
                <p class="muted">Cargando tu lista…</p>
              } @else if (wish.get(c.cardId); as w) {
                <div class="deseo">
                  <span>Quiero</span>
                  <button
                    type="button"
                    class="paso"
                    aria-label="Querer una copia menos"
                    (click)="wish.adjust(c.cardId, -1)"
                  >
                    −
                  </button>
                  <span class="n" aria-live="polite">{{ w.qty }}</span>
                  <button
                    type="button"
                    class="paso"
                    aria-label="Querer una copia más"
                    (click)="wish.adjust(c.cardId, 1)"
                  >
                    +
                  </button>
                  <button type="button" class="secondary" (click)="wish.remove(c.cardId)">
                    Quitar
                  </button>
                  <a routerLink="/deseos">Ver la lista</a>
                </div>
              } @else {
                <button type="button" class="secondary" (click)="wish.add(c.cardId)">
                  Añadir a la lista de deseos
                </button>
              }
              @if (wish.error()) {
                <p class="error" role="alert">{{ wish.error() }}</p>
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
                <a
                  class="cardmarket"
                  [href]="urlCardmarket()"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Ver en Cardmarket ↗
                </a>

                <div class="historial">
                  <h3>Evolución del precio</h3>
                  @if (historialError()) {
                    <p class="muted">No se pudo cargar el historial: {{ historialError() }}</p>
                  } @else if (historial(); as h) {
                    @if (h.length) {
                      <app-grafica-precio [puntos]="h" />
                    } @else {
                      <p class="muted">
                        Aún no hay historial de esta carta: se guarda el precio una vez al día.
                      </p>
                    }
                  } @else {
                    <p class="muted">Cargando historial…</p>
                  }
                </div>
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
                <h2>
                  Texto
                  <span class="idiomas" role="group" aria-label="Idioma del texto">
                    <button
                      type="button"
                      [class.activo]="t.idioma() === 'es'"
                      [attr.aria-pressed]="t.idioma() === 'es'"
                      (click)="t.idioma.set('es')"
                    >
                      ES
                    </button>
                    <button
                      type="button"
                      [class.activo]="t.idioma() === 'en'"
                      [attr.aria-pressed]="t.idioma() === 'en'"
                      (click)="t.idioma.set('en')"
                    >
                      EN
                    </button>
                  </span>
                </h2>
                @if (reglas().sinTraducir) {
                  <p class="sin-traducir">
                    Esta carta aún no está traducida: se muestra en inglés.
                  </p>
                }
                <app-rules-text [text]="reglas().valor" [attr.lang]="idiomaReglas()" />
                @if (c.flavour) {
                  <p
                    class="flavour"
                    [attr.lang]="ambientacion().sinTraducir || t.idioma() === 'en' ? 'en' : 'es'"
                  >
                    {{ ambientacion().valor }}
                  </p>
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
    .fondo {
      position: fixed;
      inset: -10%;
      z-index: -1;
      width: 120%;
      height: 120%;
      object-fit: cover;
      filter: blur(70px) saturate(1.4);
      opacity: 0.32;
      pointer-events: none;
    }
    .chips {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin: 8px 0 4px;
    }
    .imagen {
      width: 100%;
      height: auto;
      aspect-ratio: 744 / 1039;
      object-fit: contain;
      border-radius: 18px;
      box-shadow:
        0 20px 50px rgb(0 0 0 / 55%),
        0 0 60px color-mix(in srgb, var(--dom-a, transparent) 35%, transparent);
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
      border-radius: var(--radio-s);
      padding: 16px;
    }
    .no-la-quiero {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 6px;
      margin-top: 12px;
      font-size: 0.9rem;
    }
    .no-la-quiero .muted {
      font-size: 0.8rem;
    }
    .deseo {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
    }
    .deseo .paso {
      width: 32px;
      height: 32px;
      padding: 0;
    }
    .deseo .n {
      min-width: 2ch;
      text-align: center;
      font-variant-numeric: tabular-nums;
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
    .cardmarket {
      display: inline-block;
      margin-top: 8px;
      font-weight: 600;
    }
    .historial {
      margin-top: 16px;
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      gap: 8px;
    }
    .historial h3 {
      margin: 0;
      font-size: 0.95rem;
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
      border-radius: var(--radio-s);
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
    .idiomas {
      margin-left: auto;
      display: inline-flex;
      border: 1px solid var(--border);
      border-radius: var(--radio-s);
      overflow: hidden;
    }
    .idiomas button {
      border: 0;
      border-radius: 0;
      padding: 3px 10px;
      font-size: 0.75rem;
      background: transparent;
      color: var(--muted);
    }
    .idiomas button.activo {
      background: var(--surface-2);
      color: var(--text);
    }
    .sin-traducir {
      font-size: 0.8rem;
      color: var(--accent);
      margin: 0 0 8px;
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
  protected readonly t = inject(TraduccionService);
  protected readonly wish = inject(WishlistService);
  protected readonly descartadas = inject(DescartadasService);
  protected readonly intercambiables = inject(IntercambiablesService);

  /** De la ruta `/carta/:cardId`. */
  readonly cardId = input.required<string>();

  protected readonly card = computed(() => this.catalog.card(this.cardId()));
  protected readonly pricing = computed(() => this.valuation.pricing(this.cardId()));

  // Texto en el idioma elegido; si falta la traducción, en inglés y avisando.
  protected readonly reglas = computed(() => this.t.texto(this.card()?.text));
  protected readonly ambientacion = computed(() => this.t.texto(this.card()?.flavour));
  protected readonly idiomaReglas = computed(() =>
    this.t.idioma() === 'en' || this.reglas().sinTraducir ? 'en' : 'es',
  );
  /** "Champion Unit" en inglés; "Unidad · Campeón" en español, que pone el tipo delante. */
  protected readonly tipo = computed(() => {
    const c = this.card();
    if (!c) return '';
    if (this.t.idioma() === 'en') return c.supertype ? `${c.supertype} ${c.type}` : c.type;
    const tipo = this.t.etiqueta(c.type);
    return c.supertype ? `${tipo} · ${this.t.etiqueta(c.supertype)}` : tipo;
  });
  protected readonly colores = computed(() => estiloDominios(this.card()?.domains ?? []));
  protected readonly color = colorDominio;
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

  /**
   * Los JSON públicos de Cardmarket no traen la URL de cada producto, así que se abre
   * su buscador de Riftbound con el nombre (sin "(Alternate Art)" y similares).
   */
  protected readonly urlCardmarket = computed(() => {
    const nombre = (this.card()?.name ?? '').replace(/\s*\([^)]*\)\s*$/, '');
    return `https://www.cardmarket.com/es/Riftbound/Products/Search?searchString=${encodeURIComponent(nombre)}`;
  });

  /** Historial diario del producto (netlify/functions/historial.mts). null = cargando. */
  protected readonly historial = signal<PuntoPrecio[] | null>(null);
  protected readonly historialError = signal<string | null>(null);
  private readonly cargarHistorial = effect((onCleanup) => {
    const id = this.pricing().idProduct;
    this.historial.set(null);
    this.historialError.set(null);
    if (!id) return;
    const ctrl = new AbortController();
    onCleanup(() => ctrl.abort());
    fetch(`/api/historial?id=${id}`, { signal: ctrl.signal })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const { puntos } = (await r.json()) as { puntos: PuntoPrecio[] };
        this.historial.set(puntos);
      })
      .catch((e: unknown) => {
        if (ctrl.signal.aborted) return;
        this.historialError.set(e instanceof Error ? e.message : String(e));
      });
  });

  constructor() {
    void this.wish.load();
    effect(() => {
      const c = this.card();
      this.title.setTitle(c ? `${c.name} · Riftbound Tracker` : 'Carta · Riftbound Tracker');
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
