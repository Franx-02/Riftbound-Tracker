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

interface Falta extends Linea {
  /** Precio por copia (el más barato que haya), o null si no hay. */
  precio: number | null;
}

interface GrupoFaltan {
  titulo: string;
  lista: Falta[];
  cartas: number;
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
          <a class="boton-simular" [routerLink]="['/mazos', m.id, 'simular']">▶ Probar</a>
          <details class="mas">
            <summary class="secondary" aria-label="Más acciones">⋯</summary>
            <div class="menu-mas">
              <button type="button" (click)="copiarTexto()">
                {{ copiado() ? 'Copiado' : 'Copiar lista' }}
              </button>
              <button type="button" (click)="descargar()">Exportar .txt</button>
              <button type="button" class="peligro" (click)="borrar()">Borrar mazo</button>
            </div>
          </details>
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
                <h3>
                  {{ g.nombre }} <span class="muted">{{ g.total }}</span>
                </h3>
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
                  <ng-container
                    *ngTemplateOutlet="linea; context: { $implicit: x, zona: 'runas' }"
                  />
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
                      <button
                        type="button"
                        class="mini"
                        (click)="quitarCampo(id)"
                        aria-label="Quitar"
                      >
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

            <section class="panel estadisticas">
              <h2>Estadísticas</h2>
              @if (stats(); as s) {
                <div
                  class="curva"
                  role="img"
                  [attr.aria-label]="'Curva de energía, media ' + s.media"
                >
                  @for (b of s.curva; track b.coste) {
                    <div class="barra-energia" [title]="b.n + ' cartas de coste ' + b.etiqueta">
                      <span class="valor-barra">{{ b.n || '' }}</span>
                      <span class="relleno" [style.height.%]="b.pct"></span>
                      <span class="coste-barra">{{ b.etiqueta }}</span>
                    </div>
                  }
                </div>
                <p class="muted resumen-stats">
                  Coste medio <strong>{{ s.media }}</strong> ·
                  @for (x of s.tipos; track x.nombre; let last = $last) {
                    {{ x.n }} {{ x.nombre }}{{ last ? '' : ' · ' }}
                  }
                </p>
                @if (s.dominios.length) {
                  <div class="dominios-barra" aria-label="Reparto por dominio">
                    @for (d of s.dominios; track d.nombre) {
                      <span
                        [style.flex]="d.n"
                        [style.background]="d.color"
                        [title]="d.nombre + ': ' + d.n"
                      ></span>
                    }
                  </div>
                }
                <div class="mano-prueba">
                  <button type="button" class="secondary" (click)="robarMano()">
                    {{ manoPrueba().length ? 'Otra mano de prueba' : 'Mano de prueba (4)' }}
                  </button>
                  @if (manoPrueba().length) {
                    <ul class="mano-cartas entrada">
                      @for (card of manoPrueba(); track $index) {
                        <li>
                          <img
                            [src]="card.imgUrl | thumb: 160"
                            [alt]="card.name"
                            [title]="card.name"
                          />
                        </li>
                      }
                    </ul>
                  }
                </div>
              }
            </section>

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
                @for (g of faltan().grupos; track g.titulo) {
                  <h3 class="grupo-faltan">
                    {{ g.titulo }} <span class="muted">· {{ g.cartas }}</span>
                  </h3>
                  <ul class="faltan">
                    @for (f of g.lista; track f.card.cardId) {
                      <li>
                        <a [routerLink]="['/carta', f.card.cardId]">
                          <img
                            [src]="f.card.imgUrl | thumb: 80"
                            alt=""
                            width="32"
                            height="45"
                            loading="lazy"
                          />
                          <span class="copias">×{{ f.n }}</span>
                          <span class="nombre-falta">{{ f.card.name }}</span>
                          <span class="precio-falta">{{ f.precio | eur: '—' }}</span>
                        </a>
                      </li>
                    }
                  </ul>
                }
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
                <button
                  type="button"
                  class="secondary mas"
                  (click)="limite.set(limite() + porPagina)"
                >
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
          <button
            type="button"
            class="mini"
            (click)="cambiar(zona, x.card, -1)"
            aria-label="Quitar una"
          >
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
    .curva {
      display: grid;
      grid-template-columns: repeat(8, minmax(0, 1fr));
      gap: 4px;
      height: 110px;
      align-items: end;
      margin-top: 6px;
    }
    .barra-energia {
      display: grid;
      grid-template-rows: auto 1fr auto;
      height: 100%;
      justify-items: center;
      font-size: 0.72rem;
      color: var(--muted);
    }
    .barra-energia .relleno {
      width: 100%;
      min-height: 2px;
      border-radius: 4px 4px 0 0;
      background: linear-gradient(
        180deg,
        var(--accent),
        color-mix(in srgb, var(--accent) 40%, transparent)
      );
      align-self: end;
      transition: height 0.4s cubic-bezier(0.2, 0.8, 0.2, 1);
    }
    .valor-barra {
      font-weight: 700;
      color: var(--text);
    }
    .resumen-stats {
      margin: 8px 0 0;
      font-size: 0.85rem;
    }
    .dominios-barra {
      display: flex;
      height: 8px;
      margin-top: 8px;
      border-radius: 999px;
      overflow: hidden;
      gap: 2px;
    }
    .mano-prueba {
      margin-top: 10px;
      display: grid;
      gap: 8px;
    }
    .mano-cartas {
      list-style: none;
      margin: 0;
      padding: 0;
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 6px;
    }
    .mano-cartas img {
      width: 100%;
      border-radius: 6px;
      box-shadow: 0 4px 10px rgb(0 0 0 / 0.45);
    }
    .mas {
      position: relative;
    }
    .mas summary {
      list-style: none;
      cursor: pointer;
      padding: 8px 14px;
      border-radius: 8px;
      border: 1px solid var(--border);
      font-weight: 700;
      line-height: 1;
    }
    .mas summary::-webkit-details-marker {
      display: none;
    }
    .menu-mas {
      position: absolute;
      right: 0;
      top: calc(100% + 6px);
      z-index: 20;
      display: grid;
      gap: 4px;
      min-width: 180px;
      padding: 6px;
      border-radius: 10px;
      background: var(--surface);
      border: 1px solid var(--border);
      box-shadow: 0 16px 40px rgb(0 0 0 / 0.5);
      animation: menu-entra 0.15s ease both;
    }
    @keyframes menu-entra {
      from {
        opacity: 0;
        transform: translateY(-4px);
      }
    }
    .menu-mas button {
      justify-content: flex-start;
      text-align: left;
      background: transparent;
      color: var(--text);
      border: 0;
    }
    .menu-mas button:hover {
      background: rgb(255 255 255 / 0.06);
    }
    .menu-mas .peligro {
      color: #fb7185;
    }
    .boton-simular {
      padding: 8px 14px;
      border-radius: 8px;
      font-weight: 700;
      text-decoration: none;
      color: #111;
      background: var(--accent);
      transition:
        transform 0.15s ease,
        box-shadow 0.15s ease;
    }
    .boton-simular:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 18px color-mix(in srgb, var(--accent) 45%, transparent);
    }
    .cabecera {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 12px;
      padding-bottom: 12px;
      border-bottom: 2px solid transparent;
      border-image: linear-gradient(
          90deg,
          var(--dom-a, var(--accent)),
          var(--dom-b, var(--accent)),
          transparent
        )
        1;
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
      background:
        linear-gradient(90deg, color-mix(in srgb, var(--dom-a) 22%, transparent), transparent 60%),
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
    .grupo-faltan {
      margin: 12px 0 6px;
      font-size: 0.78rem;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--muted);
    }
    .faltan a {
      display: grid;
      grid-template-columns: 32px 34px minmax(0, 1fr) auto;
      align-items: center;
      gap: 8px;
      padding: 4px 6px;
      border-radius: 6px;
      color: var(--text);
      text-decoration: none;
      background: rgb(255 255 255 / 0.03);
    }
    .faltan a:hover {
      background: rgb(255 255 255 / 0.08);
    }
    .faltan img {
      width: 32px;
      height: auto;
      border-radius: 3px;
    }
    .copias {
      font-weight: 700;
      color: var(--accent);
      font-variant-numeric: tabular-nums;
    }
    .nombre-falta {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .precio-falta {
      color: var(--muted);
      font-size: 0.8rem;
      font-variant-numeric: tabular-nums;
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
      .sort(
        (a, b) =>
          (a.card.energy ?? 99) - (b.card.energy ?? 99) || a.card.name.localeCompare(b.card.name),
      );
  }

  protected readonly manoPrueba = signal<CatalogCard[]>([]);

  /** Roba 4 al azar del mazo principal (más el Campeón elegido), como una mano inicial. */
  protected robarMano(): void {
    const m = this.mazo();
    if (!m) return;
    const bolsa = Object.entries(m.principal).flatMap(([id, n]) => Array(n).fill(id) as string[]);
    if (m.campeon) bolsa.push(m.campeon);
    for (let i = bolsa.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [bolsa[i], bolsa[j]] = [bolsa[j], bolsa[i]];
    }
    this.manoPrueba.set(
      bolsa
        .slice(0, 4)
        .map((id) => this.catalog.card(id))
        .filter((x): x is CatalogCard => !!x),
    );
  }

  /** Curva de energía, tipos y dominios del mazo principal (con el Campeón). */
  protected readonly stats = computed(() => {
    const m = this.mazo();
    if (!m) return null;
    const lineas = this.lineas(m.principal);
    const campeon = m.campeon ? this.catalog.card(m.campeon) : undefined;
    if (campeon) lineas.push({ card: campeon, n: 1 });
    const total = lineas.reduce((a, x) => a + x.n, 0);
    if (!total) return null;
    const cuenta = new Array(8).fill(0) as number[];
    let suma = 0;
    const tipos = new Map<string, number>();
    const dominios = new Map<string, number>();
    for (const { card, n } of lineas) {
      const e = Math.min(card.energy ?? 0, 7);
      cuenta[e] += n;
      suma += (card.energy ?? 0) * n;
      tipos.set(card.type, (tipos.get(card.type) ?? 0) + n);
      for (const d of card.domains)
        if (d !== 'Colorless') dominios.set(d, (dominios.get(d) ?? 0) + n);
    }
    const max = Math.max(...cuenta, 1);
    return {
      media: (suma / total).toFixed(1),
      curva: cuenta.map((n, coste) => ({
        coste,
        etiqueta: coste === 7 ? '7+' : String(coste),
        n,
        pct: Math.round((n / max) * 100),
      })),
      tipos: [...tipos].map(([tipo, n]) => ({
        nombre: this.t.etiqueta(tipo).toLowerCase(),
        n,
      })),
      dominios: [...dominios].map(([nombre, n]) => ({ nombre, n, color: colorDominio(nombre) })),
    };
  });

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
    if (d === 'campos')
      return !this.mazo()!.campos.includes(c.cardId) && this.mazo()!.campos.length < NUM_CAMPOS;
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
        this.guardar({
          ...m,
          leyenda: c.cardId,
          campeon: campeon && esCampeonDe(campeon, c) ? m.campeon : null,
        });
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

  protected readonly copiado = signal(false);

  /**
   * El mazo como texto: una sección por zona y una línea "N Nombre (ID)" por carta, el
   * formato que entienden la mayoría de webs de mazos (con el id para no confundir variantes).
   */
  protected readonly textoMazo = computed(() => {
    const m = this.mazo();
    if (!m) return '';
    const linea = (id: string, n: number) => {
      const c = this.catalog.card(id);
      return `${n} ${c?.name ?? id} (${id})`;
    };
    const zona = (titulo: string, z: Record<string, number>) => {
      const ids = Object.keys(z).filter((id) => z[id] > 0);
      if (!ids.length) return [];
      ids.sort((a, b) =>
        (this.catalog.card(a)?.name ?? a).localeCompare(this.catalog.card(b)?.name ?? b),
      );
      return ['', `${titulo}:`, ...ids.map((id) => linea(id, z[id]))];
    };
    return [
      `# ${m.nombre}`,
      ...(m.leyenda ? ['', 'Legend:', linea(m.leyenda, 1)] : []),
      ...(m.campeon ? ['', 'Champion:', linea(m.campeon, 1)] : []),
      ...zona('Main Deck', m.principal),
      ...zona('Runes', m.runas),
      ...(m.campos.length ? ['', 'Battlefields:', ...m.campos.map((id) => linea(id, 1))] : []),
      ...zona('Sideboard', m.banquillo),
    ].join('\n');
  });

  protected async copiarTexto(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.textoMazo());
      this.copiado.set(true);
      setTimeout(() => this.copiado.set(false), 2000);
    } catch {
      this.copiado.set(false);
    }
  }

  protected descargar(): void {
    const m = this.mazo();
    if (!m) return;
    const url = URL.createObjectURL(new Blob([this.textoMazo()], { type: 'text/plain' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${m.nombre.replace(/[^\p{L}\p{N} _-]+/gu, '').trim() || 'mazo'}.txt`;
    a.click();
    URL.revokeObjectURL(url);
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
    const grupos: GrupoFaltan[] = [];
    let coste = 0;
    let sinPrecio = 0;
    if (m) {
      const quedan = new Map<string, number>();
      const zonas: [string, [string, number][]][] = [
        [
          'Leyenda y Campeón',
          [m.leyenda, m.campeon].filter((x): x is string => !!x).map((id) => [id, 1]),
        ],
        ['Mazo principal', Object.entries(m.principal)],
        ['Runas', Object.entries(m.runas)],
        ['Campos de batalla', m.campos.map((id) => [id, 1])],
        ['Banquillo', Object.entries(m.banquillo)],
      ];
      for (const [titulo, cartas] of zonas) {
        const lista: Falta[] = [];
        for (const [id, necesito] of cartas) {
          const card = this.catalog.card(id);
          if (!card || necesito <= 0) continue;
          if (!quedan.has(id)) {
            const q = this.col.qty(id);
            quedan.set(id, q.normal + q.foil);
          }
          const tengo = quedan.get(id)!;
          const usadas = Math.min(tengo, necesito);
          quedan.set(id, tengo - usadas);
          const n = necesito - usadas;
          if (n <= 0) continue;
          const p = this.valuation.pricing(id);
          const precio = p.normal ?? p.foil;
          if (precio === null) sinPrecio += n;
          else coste += precio * n;
          const ya = lista.find((x) => x.card.cardId === card.cardId);
          if (ya) ya.n += n;
          else lista.push({ card, n, precio });
        }
        if (!lista.length) continue;
        lista.sort(
          (x, y) =>
            (y.precio ?? 0) * y.n - (x.precio ?? 0) * x.n || x.card.name.localeCompare(y.card.name),
        );
        grupos.push({ titulo, lista, cartas: lista.reduce((s, x) => s + x.n, 0) });
      }
    }
    return { grupos, cartas: grupos.reduce((s, g) => s + g.cartas, 0), coste, sinPrecio };
  });

  /** Pide en la lista de deseos las copias que te faltan, banquillo incluido (sin bajar lo que ya pedías). */
  protected aDeseos(): void {
    const m = this.mazo();
    if (!m) return;
    for (const [id, necesito] of cartasDelMazo(m, true)) {
      const q = this.col.qty(id);
      if (necesito - q.normal - q.foil <= 0) continue;
      const actual = this.wish.get(id);
      this.wish.set(id, { ...actual, qty: Math.max(actual?.qty ?? 0, necesito) });
    }
    this.enviado.set(true);
  }
}
