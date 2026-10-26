import { Component, computed, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../core/auth.service';
import { CatalogCard, CatalogService } from '../core/catalog.service';
import { CollectionService } from '../core/collection.service';
import { estiloDominios } from '../core/dominios';
import { PricesService } from '../core/prices.service';
import { UsersService } from '../core/users.service';
import { ValuationService } from '../core/valuation.service';
import { WishlistService, faltan } from '../core/wishlist.service';
import { EurPipe, ThumbPipe } from '../ui/pipes';
import { CatalogFiltersState } from './catalog.page';

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
 * Página de inicio, en forma de panel: portada con el arte de tu mejor carta y el valor de
 * la colección, el set más reciente, accesos, tus cartas más valiosas, el resto de
 * coleccionistas y cartas destacadas de Cardmarket. Cardmarket no publica ventas en sus
 * datos públicos, así que "lo más vendido" se sustituye por lo que más sube (tendencia
 * frente a media de 7 días) y lo más caro.
 */
@Component({
  selector: 'app-inicio-page',
  imports: [RouterLink, EurPipe, ThumbPipe],
  template: `
    <main class="pagina">
      <section class="hero" [style]="portada() ? colores(portada()!) : null">
        @if (portada(); as p) {
          <img class="hero-arte" [src]="p.imgUrl | thumb: 600" alt="" aria-hidden="true" />
        }
        <div class="hero-texto">
          <p class="saludo">Hola, {{ nombre() }}</p>
          <h1 class="titular">Tu colección vale</h1>
          <p class="valor">{{ valor().total | eur }}</p>
          <p class="detalle">
            {{ totales().cards }} cartas distintas · {{ totales().copies }} copias
            @if (valor().copiasSinPrecio) {
              · {{ valor().copiasSinPrecio }} sin precio
            }
          </p>
          <a class="boton-hero" routerLink="/coleccion">Ver mi colección →</a>
        </div>
      </section>

      @if (novedad(); as n) {
        <aside class="panel novedad">
          @if (n.portada) {
            <img
              class="novedad-arte"
              [src]="n.portada.imgUrl | thumb: 600"
              alt=""
              aria-hidden="true"
              loading="lazy"
            />
          }
          <div class="novedad-texto">
            <p class="antetitulo">Set más reciente</p>
            <h2>{{ n.set.name }}</h2>
            <p class="muted">
              {{ n.set.count }} cartas · tienes {{ n.tengo }}
              ({{ n.porcentaje }}&nbsp;%)
            </p>
            <span class="progreso"><span [style.width.%]="n.porcentaje"></span></span>
            <button type="button" class="enlace" (click)="verSet(n.set.id)">Ver el set →</button>
          </div>
        </aside>
      }

      <nav class="accesos" aria-label="Ir a">
        <a routerLink="/deseos" class="acceso" style="--dom: var(--fury)">
          <span class="icono" aria-hidden="true">♡</span>
          <span class="titulo">Lista de deseos</span>
          <span class="muted">
            {{ deseos().cartas }} cartas
            @if (deseos().coste) {
              · faltan {{ deseos().coste | eur }}
            }
          </span>
        </a>
        <a routerLink="/escanear" class="acceso" style="--dom: var(--mind)">
          <span class="icono" aria-hidden="true">⌖</span>
          <span class="titulo">Escanear</span>
          <span class="muted">Añade cartas con la cámara</span>
        </a>
        <a routerLink="/intercambios" class="acceso" style="--dom: var(--calm)">
          <span class="icono" aria-hidden="true">⇄</span>
          <span class="titulo">Intercambios</span>
          <span class="muted">Lo que les sobra a otros</span>
        </a>
        <a routerLink="/catalogo" class="acceso" style="--dom: var(--chaos)">
          <span class="icono" aria-hidden="true">⌕</span>
          <span class="titulo">Catálogo</span>
          <span class="muted">{{ catalog.cards().length }} cartas</span>
        </a>
      </nav>

      <section class="panel coleccion">
        <header class="panel-cabecera">
          <h2>Tus cartas más valiosas</h2>
          <a routerLink="/coleccion">Ver todas →</a>
        </header>
        @if (misMejores().length) {
          <ul class="rejilla-cartas">
            @for (d of misMejores().slice(0, 5); track d.card.cardId) {
              <li [style]="colores(d.card)">
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
        } @else {
          <p class="muted">
            Aún no tienes cartas con precio. Añádelas desde el
            <a routerLink="/catalogo">catálogo</a> o <a routerLink="/escanear">escanéalas</a>.
          </p>
        }
      </section>

      <aside class="panel personas">
        <header class="panel-cabecera">
          <h2>Coleccionistas</h2>
          <span class="muted">{{ otros().length }}</span>
        </header>
        <ul>
          @for (p of otros(); track p.uid) {
            <li>
              <a [routerLink]="['/coleccion', p.uid]">
                <span class="avatar" aria-hidden="true">{{ p.displayName.charAt(0) }}</span>
                <span class="persona-nombre">{{ p.displayName }}</span>
                <span class="muted">Ver →</span>
              </a>
            </li>
          } @empty {
            <li class="muted">Aún no hay nadie más.</li>
          }
        </ul>
      </aside>

      @if (prices.data()) {
        <section class="panel ancho">
          <header class="panel-cabecera">
            <h2>Subiendo esta semana</h2>
            <span class="muted nota">Tendencia de hoy frente a la media de 7 días</span>
          </header>
          <ul class="fila-cartas">
            @for (d of subiendo(); track d.card.cardId) {
              <li [style]="colores(d.card)">
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

        <section class="panel ancho">
          <header class="panel-cabecera">
            <h2>Las más caras</h2>
          </header>
          <ul class="fila-cartas">
            @for (d of masCaras(); track d.card.cardId) {
              <li [style]="colores(d.card)">
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
        <p class="muted ancho">Cargando precios de Cardmarket…</p>
      }
    </main>
  `,
  styles: `
    /* Panel en rejilla: portada + novedad arriba, accesos, colección + personas, y filas. */
    .pagina {
      padding: 20px 16px 48px;
      max-width: 1240px;
      margin: 0 auto;
      display: grid;
      grid-template-columns: minmax(0, 2.2fr) minmax(0, 1fr);
      gap: 18px;
    }
    .accesos,
    .ancho {
      grid-column: 1 / -1;
    }
    .panel {
      position: relative;
      padding: 18px;
      border-radius: var(--radio);
      background: linear-gradient(180deg, var(--surface-2), var(--surface));
      border: 1px solid var(--border);
      box-shadow: var(--sombra);
      overflow: hidden;
    }
    .panel-cabecera {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 12px;
    }
    .panel-cabecera h2 {
      margin: 0;
      font-size: 0.95rem;
      font-weight: 600;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--accent);
    }
    .panel-cabecera a {
      font-size: 0.85rem;
      text-decoration: none;
    }

    /* Portada: el arte de tu mejor carta a la derecha, fundido hacia el texto, con una
       pincelada en diagonal del color de su dominio. */
    .hero {
      --dom-a: var(--chaos);
      --dom-b: var(--fury);
      position: relative;
      min-height: 320px;
      display: grid;
      align-items: end;
      border-radius: 20px;
      border: 1px solid var(--border-claro);
      background: #0b0d11;
      box-shadow: var(--sombra);
      overflow: hidden;
      isolation: isolate;
    }
    .hero-arte {
      position: absolute;
      inset: 0 0 0 auto;
      z-index: -2;
      width: 72%;
      height: 100%;
      object-fit: cover;
      object-position: center 22%;
      transform: scale(1.35);
      transform-origin: center 20%;
      -webkit-mask-image: linear-gradient(90deg, transparent, black 45%);
      mask-image: linear-gradient(90deg, transparent, black 45%);
    }
    .hero::before {
      content: '';
      position: absolute;
      inset: 0;
      z-index: -1;
      background:
        linear-gradient(
          115deg,
          transparent 38%,
          color-mix(in srgb, var(--dom-a) 55%, transparent) 39%,
          transparent 47%,
          transparent 70%,
          color-mix(in srgb, var(--dom-b) 40%, transparent) 71%,
          transparent 76%
        ),
        linear-gradient(90deg, rgb(11 13 17 / 95%) 30%, rgb(11 13 17 / 20%) 75%, transparent);
      mix-blend-mode: normal;
    }
    .hero-texto {
      padding: 28px;
      display: grid;
      gap: 4px;
      justify-items: start;
    }
    .hero p {
      margin: 0;
    }
    .saludo {
      color: var(--muted);
    }
    .titular {
      margin: 6px 0 0;
      font-family: var(--fuente-marca);
      font-weight: 700;
      font-size: clamp(1.4rem, 3.2vw, 2rem);
      line-height: 1.1;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--text);
      text-shadow: 0 4px 24px rgb(0 0 0 / 60%);
    }
    .valor {
      font-family: var(--fuente-titulos);
      font-size: clamp(2.6rem, 8vw, 4rem);
      font-weight: 700;
      letter-spacing: -0.02em;
      background: linear-gradient(180deg, #fde68a, var(--accent-fuerte));
      -webkit-background-clip: text;
      background-clip: text;
      color: transparent;
      font-variant-numeric: tabular-nums;
      line-height: 1.1;
      filter: drop-shadow(0 4px 18px rgb(245 184 28 / 25%));
    }
    .detalle {
      color: var(--muted);
      font-size: 0.9rem;
    }
    .boton-hero {
      margin-top: 14px;
      padding: 10px 20px;
      border-radius: var(--radio-s);
      border: 1px solid var(--accent);
      color: var(--accent);
      font-weight: 600;
      text-decoration: none;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      font-size: 0.85rem;
      background: rgb(11 13 17 / 60%);
      transition:
        background-color 0.15s ease,
        color 0.15s ease;
    }
    .boton-hero:hover {
      background: var(--accent);
      color: #1a1305;
    }

    /* Set más reciente: su carta más cara arriba, como un cartel. */
    .novedad {
      padding: 0;
      display: grid;
      grid-template-rows: 150px auto;
    }
    .novedad-arte {
      width: 100%;
      height: 150px;
      object-fit: cover;
      object-position: center 22%;
      transform: scale(1.3);
      transform-origin: center 20%;
      -webkit-mask-image: linear-gradient(180deg, black 55%, transparent);
      mask-image: linear-gradient(180deg, black 55%, transparent);
    }
    .novedad-texto {
      position: relative;
      padding: 0 18px 18px;
      display: grid;
      gap: 6px;
      align-content: start;
    }
    .novedad-texto h2 {
      margin: 0;
      font-size: 1.3rem;
    }
    .novedad-texto p {
      margin: 0;
    }
    .antetitulo {
      font-size: 0.75rem;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: var(--accent);
    }
    .progreso {
      height: 6px;
      border-radius: 999px;
      background: rgb(255 255 255 / 8%);
      overflow: hidden;
    }
    .progreso > span {
      display: block;
      height: 100%;
      background: linear-gradient(90deg, var(--accent-fuerte), #fde68a);
    }
    .enlace {
      justify-self: start;
      margin-top: 6px;
      padding: 0;
      background: none;
      border: 0;
      box-shadow: none;
      color: var(--accent);
      font-weight: 600;
    }
    .enlace:hover:not(:disabled) {
      filter: none;
      color: var(--text);
    }

    /* Accesos: cada uno con el color de un dominio. */
    .accesos {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 12px;
    }
    .acceso {
      --dom: var(--accent);
      display: grid;
      gap: 4px;
      padding: 16px 18px;
      border-radius: var(--radio);
      background:
        radial-gradient(circle at 100% 0%, color-mix(in srgb, var(--dom) 22%, transparent), transparent 65%),
        var(--surface);
      border: 1px solid color-mix(in srgb, var(--dom) 28%, transparent);
      color: var(--text);
      text-decoration: none;
      transition:
        border-color 0.15s ease,
        transform 0.15s ease,
        box-shadow 0.15s ease;
    }
    .acceso:hover {
      border-color: var(--dom);
      transform: translateY(-2px);
      box-shadow: 0 0 22px color-mix(in srgb, var(--dom) 30%, transparent);
    }
    .acceso .icono {
      font-size: 1.4rem;
      color: var(--dom);
    }
    .acceso .titulo {
      font-family: var(--fuente-titulos);
      font-weight: 600;
    }
    .acceso .muted {
      font-size: 0.8rem;
    }

    /* Tus cartas: rejilla de cinco con borde del color de su dominio. */
    .rejilla-cartas {
      list-style: none;
      margin: 0;
      padding: 0;
      display: grid;
      grid-template-columns: repeat(5, minmax(0, 1fr));
      gap: 12px;
    }
    .rejilla-cartas img,
    .fila-cartas img {
      width: 100%;
      height: auto;
      aspect-ratio: 744 / 1039;
      border-radius: 10px;
      outline: 2px solid color-mix(in srgb, var(--dom-a, transparent) 70%, transparent);
      outline-offset: -1px;
      box-shadow: 0 8px 20px rgb(0 0 0 / 45%);
      transition: transform 0.15s ease;
    }
    .rejilla-cartas a:hover img,
    .fila-cartas a:hover img {
      transform: translateY(-3px);
    }
    .rejilla-cartas a,
    .fila-cartas a {
      display: grid;
      gap: 4px;
      color: var(--text);
      text-decoration: none;
    }

    .personas ul {
      list-style: none;
      margin: 0;
      padding: 0;
      display: grid;
      gap: 4px;
    }
    .personas a {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 8px;
      border-radius: 10px;
      color: var(--text);
      text-decoration: none;
    }
    .personas a:hover {
      background: rgb(255 255 255 / 5%);
    }
    .avatar {
      display: grid;
      place-items: center;
      width: 34px;
      height: 34px;
      flex-shrink: 0;
      border-radius: 50%;
      font-family: var(--fuente-titulos);
      font-weight: 700;
      color: #1a1305;
      background: linear-gradient(135deg, #fde68a, var(--accent-fuerte));
      box-shadow: 0 0 0 2px var(--surface), 0 0 0 3px var(--accent-fuerte);
    }
    .persona-nombre {
      flex: 1;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-weight: 500;
    }

    .nota {
      font-size: 0.8rem;
    }
    .fila-cartas {
      list-style: none;
      margin: 0;
      padding: 4px 0 8px;
      display: grid;
      grid-auto-flow: column;
      grid-auto-columns: 132px;
      gap: 14px;
      overflow-x: auto;
      scroll-snap-type: x mandatory;
    }
    .fila-cartas li {
      scroll-snap-align: start;
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
      color: var(--calm);
      font-size: 0.75rem;
    }

    @media (max-width: 900px) {
      .pagina {
        grid-template-columns: minmax(0, 1fr);
      }
      .accesos {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
      .rejilla-cartas {
        grid-template-columns: repeat(3, minmax(0, 1fr));
      }
      .rejilla-cartas li:nth-child(n + 4) {
        display: none;
      }
      .hero-arte {
        width: 100%;
      }
      .hero::before {
        background: linear-gradient(0deg, rgb(11 13 17 / 96%) 35%, rgb(11 13 17 / 30%) 80%);
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
  private readonly users = inject(UsersService);
  private readonly filtrosCatalogo = inject(CatalogFiltersState);
  private readonly router = inject(Router);

  constructor() {
    void this.wish.load();
    void this.users.loadProfiles();
  }

  protected readonly colores = (c: CatalogCard) => estiloDominios(c.domains);

  protected readonly nombre = computed(
    () => (this.auth.displayName() ?? '').split(' ')[0] || 'coleccionista',
  );
  protected readonly totales = computed(() => this.col.totals());
  protected readonly valor = computed(() => this.valuation.value(this.col.cards()));

  protected readonly otros = computed(() =>
    this.users.profiles().filter((p) => p.uid !== this.auth.user()?.uid),
  );

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

  /** El arte de la portada: tu carta más valiosa, o la más cara del juego si aún no tienes. */
  protected readonly portada = computed<CatalogCard | null>(
    () => this.misMejores()[0]?.card ?? this.masCaras()[0]?.card ?? null,
  );

  /** El set más reciente, con su carta más cara de cartel y cuánto tienes de él. */
  protected readonly novedad = computed(() => {
    const set = this.catalog.sets()[0];
    if (!set) return null;
    const cartas = this.catalog.filter({ sets: [set.id] });
    const tengo = cartas.filter((c) => {
      const q = this.col.qty(c.cardId);
      return q.normal + q.foil > 0;
    }).length;
    const portada =
      [...cartas].sort(
        (a, b) =>
          (this.valuation.pricing(b.cardId).normal ?? 0) -
          (this.valuation.pricing(a.cardId).normal ?? 0),
      )[0] ?? null;
    return {
      set,
      tengo,
      portada,
      porcentaje: cartas.length ? Math.floor((tengo / cartas.length) * 100) : 0,
    };
  });

  protected verSet(id: string): void {
    this.filtrosCatalogo.limpiar();
    this.filtrosCatalogo.set.set(id);
    void this.router.navigateByUrl('/catalogo');
  }

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
    [...this.conPrecio()]
      .sort((a, b) => b.trend - a.trend)
      .slice(0, 12)
      .map((x) => ({ card: x.card, precio: x.trend, foil: false })),
  );
}
