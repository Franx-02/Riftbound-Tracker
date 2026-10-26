import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { CatalogCard, CatalogService } from '../core/catalog.service';
import { CollectionService } from '../core/collection.service';
import { colorDominio, estiloDominios } from '../core/dominios';
import {
  MAX_COPIAS,
  Mazo,
  NUM_CAMPOS,
  TAMANO_RUNAS,
  Zona,
  cartasDelMazo,
  contar,
  encajaEnDominio,
  esCampeonDe,
  esCampo,
  esDelPrincipal,
  esLegal,
  esLeyenda,
  esRuna,
  nombreBase,
  tamanoPrincipal,
  validar,
} from '../core/mazos';
import { MazosService } from '../core/mazos.service';
import { TraduccionService } from '../core/traduccion.service';
import { ValuationService } from '../core/valuation.service';
import { WishlistService } from '../core/wishlist.service';
import { EurPipe, ThumbPipe } from '../ui/pipes';

/** Qué se está añadiendo desde el buscador. */
type Destino = 'leyenda' | 'campeon' | 'principal' | 'runas' | 'campos' | 'banquillo';

const POR_PAGINA = 48;

const TIPOS: { tipo: string; nombre: string }[] = [
  { tipo: 'Unit', nombre: 'Unidades' },
  { tipo: 'Spell', nombre: 'Hechizos' },
  { tipo: 'Gear', nombre: 'Equipo' },
];

interface Linea {
  card: CatalogCard;
  n: number;
}

/**
 * Editor de un mazo: a la izquierda el mazo por zonas (Leyenda, Campeón, principal, runas,
 * campos de batalla y banquillo) con la validación y lo que te falta; a la derecha el
 * buscador, que solo enseña lo que cabe en la zona elegida y en los dominios de la Leyenda.
 */
@Component({
  selector: 'app-mazo-page',
  imports: [RouterLink, NgTemplateOutlet, EurPipe, ThumbPipe],
  template: `
    <main class="pagina">
      <a routerLink="/mazos" class="volver">← Mazos</a>

      @if (!mazos.cargado() || !catalog.loaded()) {
        <p class="muted">Cargando…</p>
      } @else if (!mazo()) {
        <p>Este mazo no existe o se ha borrado.</p>
      } @else {
        @let m = mazo()!;
        <header class="cabecera" [style]="colores()">
          <input
            class="nombre"
            aria-label="Nombre del mazo"
            maxlength="80"
            [value]="m.nombre"
            (change)="renombrar($event)"
          />
          <span class="estado" [class.legal]="legal()">{{ legal() ? 'Legal' : 'Incompleto' }}</span>
          <button type="button" class="secondary" (click)="borrar()">Borrar</button>
        </header>

        @if (mazos.error()) {
          <p class="error" role="alert">{{ mazos.error() }}</p>
        }

        <div class="columnas">
          <!-- El mazo -->
          <section class="mazo" aria-label="Mazo">
            <div class="ranuras">
              <button
                type="button"
                class="ranura"
                [class.elegida]="destino() === 'leyenda'"
                (click)="destino.set('leyenda')"
              >
                @if (leyenda(); as l) {
                  <img [src]="l.imgUrl | thumb: 240" [alt]="l.name" />
                } @else {
                  <span class="hueco">Elige Leyenda</span>
                }
                <span class="etiqueta">Leyenda</span>
              </button>
              <button
                type="button"
                class="ranura"
                [class.elegida]="destino() === 'campeon'"
                [disabled]="!leyenda()"
                (click)="destino.set('campeon')"
              >
                @if (campeon(); as c) {
                  <img [src]="c.imgUrl | thumb: 240" [alt]="c.name" />
                } @else {
                  <span class="hueco">Elige Campeón</span>
                }
                <span class="etiqueta">Campeón</span>
              </button>
            </div>

            @if (leyenda(); as l) {
              <p class="chips">
                @for (d of l.domains; track d) {
                  <span class="chip-dominio" [style.--dom]="color(d)">{{ t.etiqueta(d) }}</span>
                }
              </p>
            }

            <div class="zona">
              <button
                type="button"
                class="zona-titulo"
                [class.elegida]="destino() === 'principal'"
                (click)="destino.set('principal')"
              >
                Mazo principal <span>{{ tamano() }}/40</span>
              </button>
              @for (g of principalPorTipo(); track g.nombre) {
                <h3>{{ g.nombre }} <span class="muted">{{ g.total }}</span></h3>
                <ul class="lineas">
                  @for (x of g.lineas; track x.card.cardId) {
                    <ng-container
                      *ngTemplateOutlet="linea; context: { $implicit: x, zona: 'principal' }"
                    />
                  }
                </ul>
              }
            </div>

            <div class="zona">
              <button
                type="button"
                class="zona-titulo"
                [class.elegida]="destino() === 'runas'"
                [disabled]="!leyenda()"
                (click)="destino.set('runas')"
              >
                Runas <span>{{ contar(m.runas) }}/{{ tamanoRunas }}</span>
              </button>
              <ul class="lineas">
                @for (x of lineas(m.runas); track x.card.cardId) {
                  <ng-container *ngTemplateOutlet="linea; context: { $implicit: x, zona: 'runas' }" />
                }
              </ul>
            </div>

            <div class="zona">
              <button
                type="button"
                class="zona-titulo"
                [class.elegida]="destino() === 'campos'"
                (click)="destino.set('campos')"
              >
                Campos de batalla <span>{{ m.campos.length }}/{{ numCampos }}</span>
              </button>
              <ul class="lineas">
                @for (id of m.campos; track id) {
                  @if (catalog.card(id); as c) {
                    <li class="linea" [style]="estilo(c)">
                      <span class="linea-nombre">{{ c.name }}</span>
                      <button type="button" class="mini" (click)="quitarCampo(id)" aria-label="Quitar">
                        ×
                      </button>
                    </li>
                  }
                }
              </ul>
            </div>

            <div class="zona">
              <button
                type="button"
                class="zona-titulo"
                [class.elegida]="destino() === 'banquillo'"
                (click)="destino.set('banquillo')"
              >
                Banquillo <span>{{ contar(m.banquillo) }}</span>
              </button>
              <ul class="lineas">
                @for (x of lineas(m.banquillo); track x.card.cardId) {
                  <ng-container
                    *ngTemplateOutlet="linea; context: { $implicit: x, zona: 'banquillo' }"
                  />
                }
              </ul>
            </div>

            <section class="panel">
              <h2>Reglas</h2>
              <ul class="reglas">
                @for (r of comprobaciones(); track r.texto) {
                  <li [class.ok]="r.ok" [class.aviso]="r.aviso && !r.ok">
                    <span aria-hidden="true">{{ r.ok ? '✓' : r.aviso ? '!' : '✗' }}</span>
                    {{ r.texto }}
                  </li>
                }
              </ul>
            </section>

            <section class="panel">
              <h2>Con tu colección</h2>
              @if (faltan().cartas === 0) {
                <p class="ok">Tienes todas las cartas de este mazo.</p>
              } @else {
                <p>
                  Te faltan <strong>{{ faltan().cartas }}</strong>
                  {{ faltan().cartas === 1 ? 'carta' : 'cartas' }}: unos
                  <strong>{{ faltan().coste | eur }}</strong> en Cardmarket
                  @if (faltan().sinPrecio) {
                    <span class="muted">(sin contar {{ faltan().sinPrecio }} sin precio)</span>
                  }
                </p>
                <ul class="faltan">
                  @for (f of faltan().lista; track f.card.cardId) {
                    <li>
                      <a [routerLink]="['/carta', f.card.cardId]">{{ f.card.name }}</a>
                      <span class="muted">× {{ f.n }}</span>
                    </li>
                  }
                </ul>
                <button type="button" class="secondary" (click)="aDeseos()">
                  Añadir lo que falta a la lista de deseos
                </button>
                @if (enviado()) {
                  <p class="ok">Añadido a tu lista de deseos.</p>
                }
              }
            </section>
          </section>

          <!-- El buscador -->
          <section class="buscador" aria-label="Añadir cartas">
            <div class="buscador-cabecera">
              <h2>{{ tituloDestino() }}</h2>
              <input
                type="search"
                placeholder="Buscar por nombre o código"
                aria-label="Buscar cartas"
                [value]="texto()"
                (input)="buscar($event)"
              />
            </div>
            @if (destino() !== 'leyenda' && !leyenda()) {
              <p class="muted">Elige primero la Leyenda: decide los dominios del mazo.</p>
            } @else {
              <ul class="resultados">
                @for (c of visibles(); track c.cardId) {
                  <li [style]="estilo(c)">
                    <button
                      type="button"
                      class="resultado"
                      [title]="'Añadir ' + c.name"
                      [disabled]="!sePuedeAnadir(c)"
                      (click)="anadir(c)"
                    >
                      <img
                        [src]="c.imgUrl | thumb: 240"
                        [alt]="c.name"
                        loading="lazy"
                        width="120"
                        height="168"
                      />
                      @if (enMazo(c); as n) {
                        <span class="en-mazo">×{{ n }}</span>
                      }
                    </button>
                  </li>
                } @empty {
                  <li class="muted">Nada coincide.</li>
                }
              </ul>
              @if (resultados().length > visibles().length) {
                <button type="button" class="secondary mas" (click)="limite.set(limite() + porPagina)">
                  Mostrar más ({{ resultados().length - visibles().length }})
                </button>
              }
            }
          </section>
        </div>
      }

      <ng-template #linea let-x let-zona="zona">
        <li class="linea" [style]="estilo(x.card)">
          <span class="coste">{{ x.card.energy ?? '–' }}</span>
          <a class="linea-nombre" [routerLink]="['/carta', x.card.cardId]">{{ x.card.name }}</a>
          <button type="button" class="mini" (click)="cambiar(zona, x.card, -1)" aria-label="Quitar una">
            −
          </button>
          <span class="n">{{ x.n }}</span>
          <button
            type="button"
            class="mini"
            [disabled]="!sePuedeSumar(zona, x.card)"
            (click)="cambiar(zona, x.card, 1)"
            aria-label="Añadir una"
          >
            +
          </button>
        </li>
      </ng-template>
    </main>
  `,
  styles: `
    .pagina {
      padding: 20px 16px 48px;
      max-width: 1400px;
      margin: 0 auto;
      display: grid;
      gap: 16px;
    }
    .volver {
      text-decoration: none;
      font-size: 0.9rem;
    }
    .cabecera {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 12px;
      padding-bottom: 12px;
      border-bottom: 2px solid transparent;
      border-image: linear-gradient(90deg, var(--dom-a, var(--accent)), var(--dom-b, var(--accent)), transparent) 1;
    }
    .nombre {
      flex: 1 1 240px;
      min-width: 0;
      font-family: var(--fuente-titulos);
      font-size: 1.6rem;
      font-weight: 600;
      background: transparent;
      border-color: transparent;
      padding: 4px 8px;
    }
    .estado {
      padding: 2px 12px;
      border-radius: 999px;
      font-size: 0.85rem;
      background: rgb(244 63 94 / 18%);
      color: #fda4af;
      white-space: nowrap;
    }
    .estado.legal {
      background: rgb(34 197 94 / 18%);
      color: #86efac;
    }
    .columnas {
      display: grid;
      grid-template-columns: minmax(300px, 400px) minmax(0, 1fr);
      gap: 20px;
      align-items: start;
    }
    .mazo {
      display: grid;
      gap: 14px;
    }
    .ranuras {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
    }
    .ranura {
      position: relative;
      padding: 0;
      aspect-ratio: 744 / 1039;
      border-radius: var(--radio);
      overflow: hidden;
      background: var(--surface);
      border: 2px dashed var(--border-claro);
      box-shadow: none;
      color: var(--muted);
    }
    .ranura img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }
    .ranura.elegida,
    .zona-titulo.elegida {
      border-color: var(--accent);
      border-style: solid;
      box-shadow: 0 0 18px var(--accent-suave);
    }
    .hueco {
      display: grid;
      place-items: center;
      height: 100%;
      font-size: 0.9rem;
    }
    .ranura .etiqueta {
      position: absolute;
      left: 8px;
      bottom: 8px;
      padding: 1px 8px;
      border-radius: 999px;
      font-size: 0.72rem;
      background: rgb(0 0 0 / 70%);
      color: var(--text);
    }
    .chips {
      display: flex;
      gap: 6px;
      margin: 0;
    }
    .zona {
      display: grid;
      gap: 6px;
    }
    .zona-titulo {
      display: flex;
      justify-content: space-between;
      background: var(--surface-2);
      border: 1px solid var(--border-claro);
      color: var(--text);
      box-shadow: none;
      text-align: left;
    }
    .zona-titulo span {
      font-variant-numeric: tabular-nums;
      color: var(--muted);
    }
    h3 {
      margin: 6px 0 0;
      font-size: 0.8rem;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--muted);
    }
    .lineas {
      list-style: none;
      margin: 0;
      padding: 0;
      display: grid;
      gap: 4px;
    }
    .linea {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 4px 6px 4px 0;
      border-radius: var(--radio-s);
      background: linear-gradient(90deg, color-mix(in srgb, var(--dom-a) 22%, transparent), transparent 60%),
        var(--surface);
      border-left: 3px solid var(--dom-a);
      font-size: 0.9rem;
    }
    .coste {
      width: 24px;
      text-align: center;
      font-weight: 700;
      font-variant-numeric: tabular-nums;
    }
    .linea-nombre {
      flex: 1;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      color: var(--text);
      text-decoration: none;
      padding-left: 8px;
    }
    .coste + .linea-nombre {
      padding-left: 0;
    }
    .n {
      min-width: 18px;
      text-align: center;
      font-variant-numeric: tabular-nums;
    }
    .mini {
      width: 26px;
      height: 26px;
      padding: 0;
      background: var(--surface-2);
      border: 1px solid var(--border-claro);
      color: var(--text);
      box-shadow: none;
    }
    .panel {
      padding: 14px 16px;
      border-radius: var(--radio);
      background: var(--surface);
      border: 1px solid var(--border);
    }
    .panel h2 {
      font-size: 0.9rem;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--accent);
    }
    .panel p {
      margin: 0 0 8px;
    }
    .reglas,
    .faltan {
      list-style: none;
      margin: 0 0 10px;
      padding: 0;
      display: grid;
      gap: 4px;
      font-size: 0.88rem;
    }
    .reglas li {
      color: #fda4af;
    }
    .reglas li.ok {
      color: var(--text);
    }
    .reglas li.ok span {
      color: var(--calm);
    }
    .reglas li.aviso {
      color: var(--order);
    }
    .faltan {
      max-height: 180px;
      overflow-y: auto;
    }
    .faltan a {
      text-decoration: none;
    }
    .buscador {
      position: sticky;
      top: 16px;
      display: grid;
      gap: 12px;
      padding: 16px;
      border-radius: var(--radio);
      background: var(--surface);
      border: 1px solid var(--border);
    }
    .buscador-cabecera {
      display: flex;
      gap: 12px;
      align-items: center;
      flex-wrap: wrap;
    }
    .buscador-cabecera h2 {
      margin: 0;
      flex: 1;
    }
    .buscador-cabecera input {
      flex: 1 1 200px;
      min-width: 0;
    }
    .resultados {
      list-style: none;
      margin: 0;
      padding: 0;
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
      gap: 10px;
      max-height: calc(100dvh - 180px);
      overflow-y: auto;
    }
    .resultado {
      position: relative;
      display: block;
      width: 100%;
      padding: 0;
      border-radius: 8px;
      overflow: hidden;
      background: none;
      border: 2px solid color-mix(in srgb, var(--dom-a) 45%, transparent);
      box-shadow: none;
    }
    .resultado:hover:not(:disabled) {
      border-color: var(--dom-a);
      box-shadow: 0 0 16px color-mix(in srgb, var(--dom-a) 40%, transparent);
    }
    .resultado:disabled {
      opacity: 0.35;
    }
    .resultado img {
      display: block;
      width: 100%;
      height: auto;
      aspect-ratio: 744 / 1039;
    }
    .en-mazo {
      position: absolute;
      top: 4px;
      right: 4px;
      padding: 0 7px;
      border-radius: 999px;
      font-size: 0.75rem;
      font-weight: 700;
      background: var(--dom-a);
      color: #0d0f13;
    }
    .mas {
      justify-self: center;
    }
    @media (max-width: 900px) {
      .columnas {
        grid-template-columns: minmax(0, 1fr);
      }
      .buscador {
        position: static;
        order: -1;
      }
      .resultados {
        max-height: 60dvh;
      }
    }
  `,
})
export class MazoPage {
  protected readonly mazos = inject(MazosService);
  protected readonly catalog = inject(CatalogService);
  protected readonly t = inject(TraduccionService);
  private readonly col = inject(CollectionService);
  private readonly valuation = inject(ValuationService);
  private readonly wish = inject(WishlistService);
  private readonly router = inject(Router);

  /** De la ruta `/mazos/:id`. */
  readonly id = input.required<string>();

  protected readonly destino = signal<Destino>('leyenda');
  protected readonly texto = signal('');
  protected readonly limite = signal(POR_PAGINA);
  protected readonly enviado = signal(false);

  protected readonly porPagina = POR_PAGINA;
  protected readonly tamanoRunas = TAMANO_RUNAS;
  protected readonly numCampos = NUM_CAMPOS;
  protected readonly contar = contar;
  protected readonly color = colorDominio;

  constructor() {
    void this.mazos.load();
    void this.wish.load();
    // Con la Leyenda ya puesta, se empieza por el mazo principal.
    effect(() => {
      const m = this.mazo();
      if (m?.leyenda && this.destino() === 'leyenda' && !this.yaElegido) {
        this.yaElegido = true;
        this.destino.set(m.campeon ? 'principal' : 'campeon');
      }
    });
  }
  private yaElegido = false;

  protected readonly mazo = computed(() => this.mazos.mazo(this.id()));
  protected readonly leyenda = computed(() => {
    const id = this.mazo()?.leyenda;
    return id ? this.catalog.card(id) : undefined;
  });
  protected readonly campeon = computed(() => {
    const id = this.mazo()?.campeon;
    return id ? this.catalog.card(id) : undefined;
  });
  protected readonly colores = computed(() => estiloDominios(this.leyenda()?.domains ?? []));
  protected readonly tamano = computed(() => (this.mazo() ? tamanoPrincipal(this.mazo()!) : 0));
  protected readonly comprobaciones = computed(() =>
    this.mazo() ? validar(this.mazo()!, (id) => this.catalog.card(id)) : [],
  );
  protected readonly legal = computed(() => esLegal(this.comprobaciones()));

  protected estilo(c: CatalogCard) {
    return estiloDominios(c.domains);
  }

  protected lineas(zona: Record<string, number>): Linea[] {
    return Object.entries(zona)
      .flatMap(([id, n]) => {
        const card = this.catalog.card(id);
        return card ? [{ card, n }] : [];
      })
      .sort((a, b) => (a.card.energy ?? 99) - (b.card.energy ?? 99) || a.card.name.localeCompare(b.card.name));
  }

  protected readonly principalPorTipo = computed(() => {
    const m = this.mazo();
    if (!m) return [];
    const todas = this.lineas(m.principal);
    return TIPOS.map(({ tipo, nombre }) => {
      const lineas = todas.filter((x) => x.card.type === tipo);
      return { nombre, lineas, total: lineas.reduce((a, x) => a + x.n, 0) };
    }).filter((g) => g.lineas.length);
  });

  protected readonly tituloDestino = computed(
    () =>
      ({
        leyenda: 'Elige la Leyenda',
        campeon: 'Elige el Campeón',
        principal: 'Añadir al mazo principal',
        runas: 'Añadir runas',
        campos: 'Añadir campos de batalla',
        banquillo: 'Añadir al banquillo',
      })[this.destino()],
  );

  /** Lo que cabe en la zona elegida y en los dominios de la Leyenda. */
  protected readonly resultados = computed(() => {
    const leyenda = this.leyenda();
    const destino = this.destino();
    const cabe = (c: CatalogCard): boolean => {
      switch (destino) {
        case 'leyenda':
          return esLeyenda(c);
        case 'campeon':
          return !!leyenda && esCampeonDe(c, leyenda);
        case 'runas':
          return esRuna(c) && encajaEnDominio(c, leyenda);
        case 'campos':
          return esCampo(c) && encajaEnDominio(c, leyenda);
        default:
          return esDelPrincipal(c) && encajaEnDominio(c, leyenda);
      }
    };
    return this.catalog.filter({ texto: this.texto() }).filter(cabe);
  });
  protected readonly visibles = computed(() => this.resultados().slice(0, this.limite()));

  protected enMazo(c: CatalogCard): number {
    const m = this.mazo();
    if (!m) return 0;
    switch (this.destino()) {
      case 'leyenda':
        return m.leyenda === c.cardId ? 1 : 0;
      case 'campeon':
        return m.campeon === c.cardId ? 1 : 0;
      case 'campos':
        return m.campos.includes(c.cardId) ? 1 : 0;
      case 'runas':
        return m.runas[c.cardId] ?? 0;
      case 'banquillo':
        return m.banquillo[c.cardId] ?? 0;
      default:
        return m.principal[c.cardId] ?? 0;
    }
  }

  /** Copias de ese nombre ya en el mazo principal, con el Campeón. */
  private copiasDeNombre(c: CatalogCard): number {
    const m = this.mazo()!;
    const nombre = nombreBase(c.name);
    let n = 0;
    for (const [id, k] of Object.entries(m.principal)) {
      const otra = this.catalog.card(id);
      if (otra && nombreBase(otra.name) === nombre) n += k;
    }
    const campeon = this.campeon();
    if (campeon && nombreBase(campeon.name) === nombre) n += 1;
    return n;
  }

  protected sePuedeSumar(zona: Zona, c: CatalogCard): boolean {
    const m = this.mazo();
    if (!m) return false;
    if (zona === 'runas') return contar(m.runas) < TAMANO_RUNAS;
    if (zona === 'principal') return this.copiasDeNombre(c) < MAX_COPIAS;
    return true;
  }

  protected sePuedeAnadir(c: CatalogCard): boolean {
    const d = this.destino();
    if (d === 'campos') return !this.mazo()!.campos.includes(c.cardId) && this.mazo()!.campos.length < NUM_CAMPOS;
    if (d === 'principal' || d === 'runas' || d === 'banquillo') return this.sePuedeSumar(d, c);
    return true;
  }

  protected anadir(c: CatalogCard): void {
    const m = this.mazo();
    if (!m) return;
    switch (this.destino()) {
      case 'leyenda': {
        // Cambiar de Leyenda deja fuera al Campeón si ya no es suyo.
        const campeon = this.campeon();
        this.guardar({ ...m, leyenda: c.cardId, campeon: campeon && esCampeonDe(campeon, c) ? m.campeon : null });
        this.destino.set('campeon');
        break;
      }
      case 'campeon':
        this.guardar({ ...m, campeon: c.cardId });
        this.destino.set('principal');
        break;
      case 'campos':
        this.guardar({ ...m, campos: [...m.campos, c.cardId] });
        break;
      default:
        this.cambiar(this.destino() as Zona, c, 1);
    }
  }

  protected cambiar(zona: Zona, c: CatalogCard, delta: number): void {
    const m = this.mazo();
    if (!m) return;
    if (delta > 0 && !this.sePuedeSumar(zona, c)) return;
    const actual = { ...m[zona] };
    const n = (actual[c.cardId] ?? 0) + delta;
    if (n > 0) actual[c.cardId] = n;
    else delete actual[c.cardId];
    this.guardar({ ...m, [zona]: actual });
  }

  protected quitarCampo(id: string): void {
    const m = this.mazo();
    if (m) this.guardar({ ...m, campos: m.campos.filter((x) => x !== id) });
  }

  protected renombrar(e: Event): void {
    const m = this.mazo();
    if (m) this.guardar({ ...m, nombre: (e.target as HTMLInputElement).value });
  }

  protected buscar(e: Event): void {
    this.texto.set((e.target as HTMLInputElement).value);
    this.limite.set(POR_PAGINA);
  }

  protected borrar(): void {
    const m = this.mazo();
    if (!m || !confirm(`¿Borrar el mazo "${m.nombre}"?`)) return;
    this.mazos.borrar(m.id);
    void this.router.navigateByUrl('/mazos');
  }

  private guardar(m: Mazo): void {
    this.enviado.set(false);
    this.mazos.guardar(m);
  }

  /** Lo que el mazo necesita (sin banquillo) y no tienes, con su coste en Cardmarket. */
  protected readonly faltan = computed(() => {
    const m = this.mazo();
    const lista: Linea[] = [];
    let coste = 0;
    let sinPrecio = 0;
    if (m) {
      for (const [id, necesito] of cartasDelMazo(m)) {
        const card = this.catalog.card(id);
        if (!card) continue;
        const q = this.col.qty(id);
        const n = necesito - q.normal - q.foil;
        if (n <= 0) continue;
        lista.push({ card, n });
        const p = this.valuation.pricing(id);
        const precio = p.normal ?? p.foil;
        if (precio === null) sinPrecio += n;
        else coste += precio * n;
      }
    }
    lista.sort((a, b) => a.card.name.localeCompare(b.card.name));
    return { lista, cartas: lista.reduce((a, x) => a + x.n, 0), coste, sinPrecio };
  });

  /** Pide en la lista de deseos las copias que te faltan (sin bajar lo que ya pedías). */
  protected aDeseos(): void {
    const m = this.mazo();
    if (!m) return;
    for (const [id, necesito] of cartasDelMazo(m)) {
      const q = this.col.qty(id);
      if (necesito - q.normal - q.foil <= 0) continue;
      const actual = this.wish.get(id);
      this.wish.set(id, { ...actual, qty: Math.max(actual?.qty ?? 0, necesito) });
    }
    this.enviado.set(true);
  }
}
