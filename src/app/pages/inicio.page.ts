import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../core/auth.service';
import { CatalogCard, CatalogService } from '../core/catalog.service';
import { CollectionService } from '../core/collection.service';
import { PricesService } from '../core/prices.service';
import { ValuationService } from '../core/valuation.service';
import { WishlistService, faltan } from '../core/wishlist.service';
import { EurPipe, ThumbPipe } from '../ui/pipes';

interface Destacada {
  card: CatalogCard;
  precio: number;
  /** Subida de la tendencia frente a la media de 7 días, en %. */
  subida?: number;
  foil: boolean;
}

/** Para "subiendo": por debajo de esto, un céntimo arriba o abajo da porcentajes absurdos. */
const PRECIO_MINIMO_SUBIDA = 1;

/**
 * Página de inicio: el valor de tu colección, accesos a cada sección y cartas destacadas
 * de Cardmarket. Cardmarket no publica ventas en sus datos públicos, así que "lo más
 * vendido" se sustituye por lo que más sube (tendencia frente a media de 7 días) y lo
 * más caro.
 */
@Component({
  selector: 'app-inicio-page',
  imports: [RouterLink, EurPipe, ThumbPipe],
  template: `
    <main class="pagina">
      <section class="hero">
        <p class="saludo">Hola, {{ nombre() }}</p>
        <p class="etiqueta">Tu colección vale</p>
        <p class="valor">{{ valor().total | eur }}</p>
        <p class="muted detalle">
          {{ totales().cards }} cartas distintas · {{ totales().copies }} copias
          @if (valor().copiasSinPrecio) {
            · {{ valor().copiasSinPrecio }} sin precio
          }
        </p>
      </section>

      <nav class="accesos" aria-label="Ir a">
        <a routerLink="/coleccion" class="acceso">
          <span class="icono" aria-hidden="true">▦</span>
          <span class="titulo">Mi colección</span>
          <span class="muted">{{ totales().cards }} cartas</span>
        </a>
        <a routerLink="/deseos" class="acceso">
          <span class="icono" aria-hidden="true">♡</span>
          <span class="titulo">Lista de deseos</span>
          <span class="muted">
            {{ deseos().cartas }} cartas
            @if (deseos().coste) {
              · faltan {{ deseos().coste | eur }}
            }
          </span>
        </a>
        <a routerLink="/escanear" class="acceso">
          <span class="icono" aria-hidden="true">⌖</span>
          <span class="titulo">Escanear</span>
          <span class="muted">Añade cartas con la cámara</span>
        </a>
        <a routerLink="/intercambios" class="acceso">
          <span class="icono" aria-hidden="true">⇄</span>
          <span class="titulo">Intercambios</span>
          <span class="muted">Lo que les sobra a otros</span>
        </a>
        <a routerLink="/catalogo" class="acceso">
          <span class="icono" aria-hidden="true">⌕</span>
          <span class="titulo">Catálogo</span>
          <span class="muted">{{ catalog.cards().length }} cartas</span>
        </a>
      </nav>

      @if (misMejores().length) {
        <section>
          <h2>Tus cartas más valiosas</h2>
          <ul class="fila-cartas">
            @for (d of misMejores(); track d.card.cardId) {
              <li>
                <a [routerLink]="['/carta', d.card.cardId]">
                  <img
                    [src]="d.card.imgUrl | thumb: 240"
                    [alt]="d.card.name"
                    width="120"
                    height="168"
                    loading="lazy"
                  />
                  <span class="nombre">{{ d.card.name }}</span>
                  <span class="precio"
                    >{{ d.precio | eur }}
                    @if (d.foil) {
                      <small>foil</small>
                    }
                  </span>
                </a>
              </li>
            }
          </ul>
        </section>
      }

      @if (prices.data()) {
        <section>
          <h2>Subiendo esta semana en Cardmarket</h2>
          <p class="muted nota">Tendencia de hoy frente a la media de los últimos 7 días.</p>
          <ul class="fila-cartas">
            @for (d of subiendo(); track d.card.cardId) {
              <li>
                <a [routerLink]="['/carta', d.card.cardId]">
                  <img
                    [src]="d.card.imgUrl | thumb: 240"
                    [alt]="d.card.name"
                    width="120"
                    height="168"
                    loading="lazy"
                  />
                  <span class="nombre">{{ d.card.name }}</span>
                  <span class="precio">
                    {{ d.precio | eur }} <span class="sube">▲ {{ d.subida }} %</span>
                  </span>
                </a>
              </li>
            } @empty {
              <li class="muted">Nada sube con fuerza esta semana.</li>
            }
          </ul>
        </section>

        <section>
          <h2>Las más caras</h2>
          <ul class="fila-cartas">
            @for (d of masCaras(); track d.card.cardId) {
              <li>
                <a [routerLink]="['/carta', d.card.cardId]">
                  <img
                    [src]="d.card.imgUrl | thumb: 240"
                    [alt]="d.card.name"
                    width="120"
                    height="168"
                    loading="lazy"
                  />
                  <span class="nombre">{{ d.card.name }}</span>
                  <span class="precio">{{ d.precio | eur }}</span>
                </a>
              </li>
            }
          </ul>
        </section>
      } @else {
        <p class="muted">Cargando precios de Cardmarket…</p>
      }
    </main>
  `,
  styles: `
    .pagina {
      padding: 12px 16px 48px;
      max-width: 1100px;
      margin: 0 auto;
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      gap: 24px;
    }
    .hero {
      position: relative;
      padding: 24px 20px;
      border: 1px solid var(--border-claro);
      background:
        radial-gradient(circle at 85% 0%, rgb(10 200 185 / 18%), transparent 55%),
        linear-gradient(180deg, #0e1d33, #0a1428);
      box-shadow:
        inset 0 0 0 1px rgb(1 10 19 / 80%),
        0 0 24px rgb(0 0 0 / 40%);
    }
    /* Remates dorados en las esquinas, como los marcos del cliente. */
    .hero::before,
    .hero::after {
      content: '';
      position: absolute;
      width: 18px;
      height: 18px;
      border: 2px solid var(--accent);
    }
    .hero::before {
      top: -1px;
      left: -1px;
      border-right: 0;
      border-bottom: 0;
    }
    .hero::after {
      bottom: -1px;
      right: -1px;
      border-left: 0;
      border-top: 0;
    }
    .hero p {
      margin: 0;
    }
    .saludo {
      font-size: 0.95rem;
      color: var(--muted);
    }
    .etiqueta {
      margin-top: 12px !important;
      font-size: 0.85rem;
      color: var(--muted);
    }
    .valor {
      font-family: var(--fuente-titulos);
      font-size: clamp(2.2rem, 9vw, 3.4rem);
      font-weight: 700;
      text-shadow: 0 0 18px rgb(200 155 60 / 30%);
      color: var(--accent);
      font-variant-numeric: tabular-nums;
      line-height: 1.1;
    }
    .detalle {
      margin-top: 6px !important;
      font-size: 0.9rem;
    }
    .accesos {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
      gap: 12px;
    }
    .acceso {
      display: grid;
      gap: 4px;
      padding: 16px;
      border-radius: 2px;
      background: linear-gradient(180deg, #0e1d33, #0a1428);
      border: 1px solid var(--border);
      color: var(--text);
      text-decoration: none;
      transition:
        border-color 0.15s ease,
        transform 0.15s ease;
    }
    .acceso:hover {
      border-color: var(--accent);
      transform: translateY(-2px);
    }
    .acceso .icono {
      font-size: 1.5rem;
      color: var(--hextech);
    }
    .acceso .titulo {
      font-family: var(--fuente-titulos);
      font-weight: 700;
      letter-spacing: 0.05em;
    }
    .acceso .muted {
      font-size: 0.8rem;
    }
    h2 {
      margin: 0 0 4px;
      font-size: 1.1rem;
    }
    .nota {
      margin: 0 0 8px;
      font-size: 0.8rem;
    }
    .fila-cartas {
      list-style: none;
      margin: 0;
      padding: 4px 0 8px;
      display: grid;
      grid-auto-flow: column;
      grid-auto-columns: 132px;
      gap: 12px;
      overflow-x: auto;
      scroll-snap-type: x mandatory;
    }
    .fila-cartas li {
      scroll-snap-align: start;
    }
    .fila-cartas a {
      display: grid;
      gap: 4px;
      color: var(--text);
      text-decoration: none;
    }
    .fila-cartas img {
      width: 132px;
      height: auto;
      border-radius: 2px;
    }
    .nombre {
      font-size: 0.8rem;
      font-weight: 600;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .precio {
      font-size: 0.85rem;
      font-variant-numeric: tabular-nums;
    }
    .precio small {
      color: var(--muted);
    }
    .sube {
      color: var(--ok);
      font-size: 0.75rem;
    }
    @media (max-width: 700px) {
      .accesos {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }
  `,
})
export class InicioPage {
  protected readonly catalog = inject(CatalogService);
  protected readonly prices = inject(PricesService);
  private readonly col = inject(CollectionService);
  private readonly wish = inject(WishlistService);
  private readonly valuation = inject(ValuationService);
  private readonly auth = inject(AuthService);

  constructor() {
    void this.wish.load();
  }

  protected readonly nombre = computed(
    () => (this.auth.displayName() ?? '').split(' ')[0] || 'coleccionista',
  );
  protected readonly totales = computed(() => this.col.totals());
  protected readonly valor = computed(() => this.valuation.value(this.col.cards()));

  protected readonly deseos = computed(() => {
    let coste = 0;
    for (const [id, entry] of this.wish.entries()) {
      const n = faltan(entry, this.col.qty(id));
      const p = this.valuation.pricing(id);
      if (n) coste += (p.normal ?? p.foil ?? 0) * n;
    }
    return { cartas: this.wish.entries().size, coste };
  });

  /** Las 10 cartas propias que más valen (por copia, el acabado más caro que tengas). */
  protected readonly misMejores = computed<Destacada[]>(() => {
    const salida: Destacada[] = [];
    for (const [id, q] of this.col.cards()) {
      const card = this.catalog.card(id);
      if (!card) continue;
      const p = this.valuation.pricing(id);
      const normal = q.normal ? (p.normal ?? 0) : 0;
      const foil = q.foil ? (p.foil ?? 0) : 0;
      const precio = Math.max(normal, foil);
      if (precio > 0) salida.push({ card, precio, foil: foil > normal });
    }
    return salida.sort((a, b) => b.precio - a.precio).slice(0, 10);
  });

  /** Una carta por producto de Cardmarket (las alt art pueden compartirlo): la primera. */
  private readonly conPrecio = computed(() => {
    const vistos = new Set<number>();
    const salida: { card: CatalogCard; trend: number; avg7: number | null }[] = [];
    if (!this.prices.data()) return salida;
    for (const card of this.catalog.cards()) {
      const p = this.valuation.pricing(card.cardId);
      if (!p.idProduct || vistos.has(p.idProduct) || p.normal === null) continue;
      vistos.add(p.idProduct);
      salida.push({ card, trend: p.normal, avg7: p.detalle?.avg7 ?? null });
    }
    return salida;
  });

  protected readonly subiendo = computed<Destacada[]>(() =>
    this.conPrecio()
      .filter((x) => x.avg7 && x.trend >= PRECIO_MINIMO_SUBIDA && x.trend > x.avg7 * 1.1)
      .map((x) => ({
        card: x.card,
        precio: x.trend,
        subida: Math.round((x.trend / x.avg7! - 1) * 100),
        foil: false,
      }))
      .sort((a, b) => b.subida! - a.subida!)
      .slice(0, 12),
  );

  protected readonly masCaras = computed<Destacada[]>(() =>
    this.conPrecio()
      .sort((a, b) => b.trend - a.trend)
      .slice(0, 12)
      .map((x) => ({ card: x.card, precio: x.trend, foil: false })),
  );
}
