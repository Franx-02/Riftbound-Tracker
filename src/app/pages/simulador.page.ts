import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CatalogService } from '../core/catalog.service';
import { estiloDominios } from '../core/dominios';
import { MazosService } from '../core/mazos.service';
import {
  Copia,
  PUNTOS_PARA_GANAR,
  Partida,
  ZONAS,
  ZonaSim,
  agotarRuna,
  ajustarPuntos,
  alternarAgotada,
  barajarMazo,
  cambiarCampo,
  canalizar,
  mover,
  mulligan,
  nuevaPartida,
  puntosRival,
  reciclarRuna,
  resolverCombate,
  rival,
  robar,
  terminarTurno,
  zonaDe,
} from '../core/simulador';
import { InclinarDirective } from '../ui/inclinar.directive';
import { ThumbPipe } from '../ui/pipes';

type Destino = 'base' | 'campo0' | 'campo1' | 'cementerio' | 'mano';

/**
 * Mesa de práctica en solitario: tu lado abajo (mano, base, runas), los dos campos de
 * batalla en medio y el rival "muñeco" arriba, con contadores de unidades. Las cartas se
 * arrastran a las zonas o se pulsan para abrir sus acciones. Las reglas están en
 * `core/simulador.ts`.
 */
@Component({
  selector: 'app-simulador-page',
  imports: [RouterLink, NgTemplateOutlet, ThumbPipe, InclinarDirective],
  template: `
    @if (mazo(); as m) {
      <main class="mesa" [style]="colores()">
        <header class="barra">
          <a [routerLink]="['/mazos', m.id]" class="volver">← {{ m.nombre }}</a>
          <ol class="fases" aria-label="Fase del turno">
            @for (f of fases; track f.id) {
              <li
                [class.activa]="p().fase === f.id"
                [class.pasada]="indiceFase(p().fase) > indiceFase(f.id)"
              >
                {{ f.texto }}
              </li>
            }
          </ol>
          <span class="turno">Turno {{ p().turno }}</span>
          <span class="acciones">
            @if (p().fase === 'mulligan') {
              <label class="opcion">
                <input
                  type="checkbox"
                  [checked]="empiezoYo()"
                  (change)="empiezoYo.set(!empiezoYo()); reiniciar()"
                />
                Empiezo yo
              </label>
              <button type="button" (click)="hacerMulligan()">
                {{ elegidas().size ? 'Mulligan de ' + elegidas().size : 'Me la quedo' }}
              </button>
            } @else {
              <button type="button" (click)="aplicar(terminarTurno)">Terminar turno</button>
            }
            <button type="button" class="secondary" (click)="aplicar(robar1)">Robar</button>
            <button type="button" class="secondary" (click)="aplicar(canalizar1)">Canalizar</button>
            <button type="button" class="secondary" (click)="aplicar(barajarMazo)">Barajar</button>
            <button type="button" class="secondary" (click)="reiniciar()">Reiniciar</button>
          </span>
        </header>

        @if (p().aviso; as a) {
          <p class="aviso error" role="alert">{{ a }}</p>
        } @else if (p().fase === 'mulligan') {
          <p class="aviso">
            Pulsa las cartas de tu mano que quieras devolver al fondo del mazo y robar otras, o
            quédate la mano. Con "Empiezo yo" no robas en el primer turno.
          </p>
        }

        <!-- Rival -->
        <section class="rival" aria-label="Rival">
          <div class="marcador">
            <span class="etiqueta">Rival</span>
            <span class="puntos">
              <button
                type="button"
                class="mini"
                (click)="aplicar(menosRival)"
                aria-label="Quitar punto al rival"
              >
                −
              </button>
              <strong>{{ p().puntosRival }}</strong
              >/{{ meta }}
              <button
                type="button"
                class="mini"
                (click)="aplicar(masRival)"
                aria-label="Sumar punto al rival"
              >
                +
              </button>
            </span>
          </div>
          <div class="base-rival">
            <span class="etiqueta">Su base · {{ p().rivalBase }} unidades</span>
            <span class="fichas">
              @for (n of fichas(p().rivalBase); track $index) {
                <span class="ficha" aria-hidden="true"></span>
              }
            </span>
            <span class="mini-botones">
              <button type="button" class="mini" (click)="rivalEn(-1, -1)">−</button>
              <button type="button" class="mini" (click)="rivalEn(-1, 1)">+ unidad</button>
            </span>
          </div>
        </section>

        <!-- Campos de batalla -->
        <section class="campos">
          @for (campo of p().campos; track $index; let i = $index) {
            <div
              class="campo"
              [class.mio]="campo.control === 'yo'"
              [class.suyo]="campo.control === 'rival'"
              [class.sobre]="sobre() === 'campo' + i"
              (dragover)="permitir($event, 'campo' + i)"
              (dragleave)="sobre.set(null)"
              (drop)="soltar($event, 'campo' + i)"
            >
              <div class="campo-cabecera">
                <span class="etiqueta">
                  Campo {{ i + 1 }}
                  @if (campo.control === 'yo') {
                    · <strong class="mio-txt">lo controlas</strong>
                  } @else if (campo.control === 'rival') {
                    · <strong class="suyo-txt">lo controla el rival</strong>
                  } @else {
                    · nadie lo controla
                  }
                </span>
                @if (p().camposReserva.length && !campo.unidades.length && !campo.rival) {
                  <select
                    class="cambiar"
                    aria-label="Cambiar campo de batalla"
                    (change)="cambiar(i, $any($event.target).value)"
                  >
                    <option value="">Cambiar por…</option>
                    @for (id of p().camposReserva; track id) {
                      <option [value]="id">{{ carta(id)?.name ?? id }}</option>
                    }
                  </select>
                }
              </div>
              <div class="campo-cuerpo">
                @if (carta(campo.id); as c) {
                  <img
                    class="campo-img"
                    [src]="c.imgUrl | thumb: 400"
                    [alt]="c.name"
                    [title]="c.name"
                  />
                } @else {
                  <span class="hueco">Sin campo</span>
                }
                <div class="lado-rival">
                  <span class="etiqueta">Rival · {{ campo.rival }}</span>
                  <span class="fichas">
                    @for (n of fichas(campo.rival); track $index) {
                      <span class="ficha" aria-hidden="true"></span>
                    }
                  </span>
                  <span class="mini-botones">
                    <button type="button" class="mini" (click)="rivalEn(i, -1)">−</button>
                    <button type="button" class="mini" (click)="rivalEn(i, 1)">+</button>
                  </span>
                  @if (campo.rival > 0 && campo.unidades.length) {
                    <span class="combate">
                      <button type="button" class="mini ok" (click)="combate(i, true)">
                        Gano el combate
                      </button>
                      <button type="button" class="mini mal" (click)="combate(i, false)">
                        Lo pierdo
                      </button>
                    </span>
                  }
                </div>
                <div class="lado-mio">
                  <span class="etiqueta">Tus unidades · {{ campo.unidades.length }}</span>
                  <div class="fila">
                    @for (c of campo.unidades; track c.uid) {
                      <ng-container *ngTemplateOutlet="tCarta; context: { $implicit: c }" />
                    } @empty {
                      <span class="hueco">Arrastra unidades aquí para conquistarlo.</span>
                    }
                  </div>
                </div>
              </div>
            </div>
          }
        </section>

        <!-- Mi lado -->
        <section class="mesa-mia">
          <aside class="columna">
            <div class="pila">
              <span class="etiqueta">Leyenda</span>
              @if (carta(m.leyenda); as l) {
                <img [src]="l.imgUrl | thumb: 240" [alt]="l.name" class="carta" appInclinar />
              }
            </div>
            <div class="pila">
              <span class="etiqueta">Campeón</span>
              @for (c of p().campeon; track c.uid) {
                <ng-container *ngTemplateOutlet="tCarta; context: { $implicit: c }" />
              } @empty {
                <span class="hueco">en juego</span>
              }
            </div>
          </aside>

          <div class="centro">
            <div
              class="zona"
              [class.sobre]="sobre() === 'base'"
              (dragover)="permitir($event, 'base')"
              (dragleave)="sobre.set(null)"
              (drop)="soltar($event, 'base')"
            >
              <span class="etiqueta">Tu base · {{ p().base.length }}</span>
              <div class="fila">
                @for (c of p().base; track c.uid) {
                  <ng-container *ngTemplateOutlet="tCarta; context: { $implicit: c }" />
                } @empty {
                  <span class="hueco">Arrastra cartas de tu mano para jugarlas.</span>
                }
              </div>
            </div>
            <div class="zona">
              <span class="etiqueta">
                Runas · {{ runasListas() }} preparadas de {{ p().runas.length }}
                <label class="opcion">
                  <input type="checkbox" [checked]="p().pagarCostes" (change)="alternarPago()" />
                  pagar costes al jugar
                </label>
                <button
                  type="button"
                  class="mini"
                  (click)="aplicar(agotarRuna)"
                  title="Agotar una runa: +1 energía"
                >
                  ⚡ energía
                </button>
                <button
                  type="button"
                  class="mini"
                  (click)="aplicar(reciclarRuna)"
                  title="Reciclar una runa: +1 poder"
                >
                  ✦ poder
                </button>
              </span>
              <div class="fila runas">
                @for (c of p().runas; track c.uid) {
                  <ng-container *ngTemplateOutlet="tCarta; context: { $implicit: c }" />
                } @empty {
                  <span class="hueco">Se canalizan 2 al empezar cada turno.</span>
                }
              </div>
            </div>
          </div>

          <aside class="columna">
            <div class="marcador">
              <span class="etiqueta">Tú</span>
              <span class="puntos">
                <button
                  type="button"
                  class="mini"
                  (click)="aplicar(menosYo)"
                  aria-label="Quitar punto"
                >
                  −
                </button>
                <strong>{{ p().puntos }}</strong
                >/{{ meta }}
                <button
                  type="button"
                  class="mini"
                  (click)="aplicar(masYo)"
                  aria-label="Sumar punto"
                >
                  +
                </button>
              </span>
            </div>
            <div class="pila">
              <span class="etiqueta">Mazo</span>
              <button
                type="button"
                class="dorso"
                (click)="aplicar(robar1)"
                aria-label="Robar una carta"
              >
                {{ p().mazo.length }}
              </button>
            </div>
            <div class="pila">
              <span class="etiqueta">Runas</span>
              <button
                type="button"
                class="dorso runa"
                (click)="aplicar(canalizar1)"
                aria-label="Canalizar 2 runas"
              >
                {{ p().mazoRunas.length }}
              </button>
            </div>
            <div
              class="pila cementerio"
              [class.sobre]="sobre() === 'cementerio'"
              (dragover)="permitir($event, 'cementerio')"
              (dragleave)="sobre.set(null)"
              (drop)="soltar($event, 'cementerio')"
            >
              <span class="etiqueta">Cementerio · {{ p().cementerio.length }}</span>
              @if (p().cementerio.at(-1); as c) {
                <ng-container *ngTemplateOutlet="tCarta; context: { $implicit: c }" />
              } @else {
                <span class="hueco-carta">suelta aquí</span>
              }
            </div>
          </aside>
        </section>

        <section
          class="mano"
          aria-label="Tu mano"
          [class.sobre]="sobre() === 'mano'"
          (dragover)="permitir($event, 'mano')"
          (dragleave)="sobre.set(null)"
          (drop)="soltar($event, 'mano')"
        >
          @for (c of p().mano; track c.uid; let i = $index) {
            <div
              class="en-mano"
              [style.--i]="i - (p().mano.length - 1) / 2"
              [class.elegida]="elegidas().has(c.uid)"
            >
              <ng-container *ngTemplateOutlet="tCarta; context: { $implicit: c }" />
              @if (carta(c.id); as cc) {
                <span class="coste" aria-hidden="true">
                  {{ cc.energy ?? 0 }}⚡
                  @if (cc.power) {
                    {{ cc.power }}✦
                  }
                </span>
              }
            </div>
          } @empty {
            <span class="hueco">Mano vacía</span>
          }
        </section>

        <ol class="log" aria-label="Historial">
          @for (l of ultimas(); track $index) {
            <li>{{ l }}</li>
          }
        </ol>

        @if (seleccion(); as s) {
          <div class="menu" role="dialog" aria-label="Acciones de la carta">
            <img
              [src]="carta(s.id)?.imgUrl ?? '' | thumb: 400"
              [alt]="carta(s.id)?.name ?? ''"
              appInclinar
            />
            <div class="botones">
              <strong>{{ carta(s.id)?.name }}</strong>
              @if (carta(s.id); as cc) {
                <span class="muted">
                  Coste {{ cc.energy ?? 0 }} energía{{ cc.power ? ', ' + cc.power + ' poder' : '' }}
                </span>
              }
              @for (a of accionesDe(s); track a.zona) {
                <button type="button" class="secondary" (click)="moverA(s, a.zona)">
                  {{ a.texto }}
                </button>
              }
              @if (zonaSel(s) !== 'mano' && zonaSel(s) !== 'cementerio') {
                <button type="button" class="secondary" (click)="agotar(s)">
                  {{ s.agotada ? 'Preparar' : 'Agotar' }}
                </button>
              }
              <button type="button" (click)="seleccion.set(null)">Cerrar</button>
            </div>
          </div>
        }

        <ng-template #tCarta let-c>
          <button
            type="button"
            class="carta-btn"
            [class.agotada]="c.agotada"
            [title]="carta(c.id)?.name ?? c.id"
            draggable="true"
            (dragstart)="arrastrar($event, c)"
            (dragend)="sobre.set(null)"
            (click)="pulsar(c)"
          >
            <img
              class="carta"
              [src]="carta(c.id)?.imgUrl ?? '' | thumb: 240"
              [alt]="carta(c.id)?.name ?? c.id"
            />
          </button>
        </ng-template>
      </main>
    } @else {
      <main class="mesa"><p class="muted">Cargando el mazo…</p></main>
    }
  `,
  styles: `
    .mesa {
      --dom-a: var(--colorless);
      padding: 10px 16px 24px;
      display: grid;
      gap: 10px;
      min-height: calc(100dvh - 60px);
      background:
        radial-gradient(
          ellipse at 50% 100%,
          color-mix(in srgb, var(--dom-a) 20%, transparent),
          transparent 55%
        ),
        radial-gradient(ellipse at 50% 0%, rgb(220 60 60 / 0.12), transparent 50%);
    }
    .barra {
      display: flex;
      flex-wrap: wrap;
      gap: 8px 14px;
      align-items: center;
    }
    .volver {
      text-decoration: none;
      font-weight: 600;
    }
    .fases {
      display: flex;
      gap: 2px;
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .fases li {
      padding: 3px 10px;
      font-size: 0.72rem;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--muted);
      background: rgb(255 255 255 / 0.04);
      border: 1px solid var(--border);
    }
    .fases li:first-child {
      border-radius: 8px 0 0 8px;
    }
    .fases li:last-child {
      border-radius: 0 8px 8px 0;
    }
    .fases li.pasada {
      color: var(--text);
    }
    .fases li.activa {
      color: #111;
      background: var(--accent);
      border-color: var(--accent);
      font-weight: 700;
    }
    .turno {
      font-family: var(--fuente-titulos);
      font-weight: 700;
    }
    .acciones {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-left: auto;
      align-items: center;
    }
    .opcion {
      display: inline-flex;
      gap: 4px;
      align-items: center;
      font-size: 0.8rem;
      color: var(--muted);
      text-transform: none;
      letter-spacing: 0;
    }
    .mini {
      padding: 2px 8px;
      min-height: 0;
      font-size: 0.78rem;
      background: rgb(255 255 255 / 0.06);
      color: var(--text);
      border: 1px solid var(--border);
    }
    .mini.ok {
      border-color: #4ade80;
      color: #4ade80;
    }
    .mini.mal {
      border-color: #fb7185;
      color: #fb7185;
    }
    .aviso {
      margin: 0;
      padding: 8px 12px;
      border-radius: 8px;
      background: color-mix(in srgb, var(--accent) 12%, transparent);
      border: 1px solid color-mix(in srgb, var(--accent) 40%, transparent);
      font-size: 0.9rem;
    }
    .aviso.error {
      background: rgb(251 113 133 / 0.12);
      border-color: rgb(251 113 133 / 0.5);
    }
    .etiqueta {
      font-size: 0.72rem;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--muted);
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      align-items: center;
    }
    .rival {
      display: flex;
      flex-wrap: wrap;
      gap: 16px;
      align-items: center;
      padding: 8px 12px;
      border-radius: 10px;
      background: rgb(220 60 60 / 0.08);
      border: 1px solid rgb(220 60 60 / 0.3);
    }
    .marcador {
      display: grid;
      gap: 2px;
      justify-items: center;
    }
    .puntos {
      display: inline-flex;
      gap: 6px;
      align-items: center;
      font-size: 1.1rem;
    }
    .base-rival {
      display: flex;
      gap: 10px;
      align-items: center;
      flex-wrap: wrap;
    }
    .fichas {
      display: flex;
      gap: 3px;
    }
    .ficha {
      width: 14px;
      height: 18px;
      border-radius: 3px;
      background: linear-gradient(160deg, #e35d5d, #7a1c1c);
      box-shadow: 0 2px 4px rgb(0 0 0 / 0.5);
      animation: entra-carta 0.25s ease both;
    }
    .mini-botones {
      display: inline-flex;
      gap: 4px;
    }
    .campos {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 12px;
    }
    .campo {
      display: grid;
      gap: 6px;
      padding: 10px;
      border-radius: 14px;
      border: 2px dashed color-mix(in srgb, var(--dom-a) 35%, var(--border));
      background: rgb(0 0 0 / 0.22);
      transition:
        border-color 0.2s ease,
        box-shadow 0.2s ease,
        transform 0.2s ease;
    }
    .campo.mio {
      border-style: solid;
      border-color: var(--accent);
      box-shadow: 0 0 24px color-mix(in srgb, var(--accent) 25%, transparent);
    }
    .campo.suyo {
      border-style: solid;
      border-color: #e35d5d;
      box-shadow: 0 0 24px rgb(227 93 93 / 0.25);
    }
    .sobre {
      border-color: var(--hextech, #0ac8b9) !important;
      box-shadow: 0 0 0 3px color-mix(in srgb, var(--hextech, #0ac8b9) 35%, transparent) !important;
      transform: scale(1.01);
    }
    .campo-cabecera {
      display: flex;
      justify-content: space-between;
      gap: 8px;
      align-items: center;
    }
    .mio-txt {
      color: var(--accent);
    }
    .suyo-txt {
      color: #fb7185;
    }
    .cambiar {
      font-size: 0.75rem;
      padding: 2px 6px;
      min-height: 0;
    }
    .campo-cuerpo {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr);
      grid-template-rows: auto auto;
      gap: 6px 12px;
      align-items: start;
    }
    .campo-img {
      grid-row: 1 / 3;
      height: 150px;
      width: auto;
      border-radius: 8px;
      box-shadow: 0 6px 16px rgb(0 0 0 / 0.5);
    }
    .lado-rival,
    .lado-mio {
      display: grid;
      gap: 4px;
    }
    .lado-rival {
      padding-bottom: 6px;
      border-bottom: 1px solid rgb(255 255 255 / 0.08);
      grid-template-columns: auto auto auto 1fr;
      align-items: center;
    }
    .combate {
      display: inline-flex;
      gap: 4px;
      justify-self: end;
    }
    .mesa-mia {
      display: grid;
      grid-template-columns: 110px minmax(0, 1fr) 110px;
      gap: 12px;
    }
    .columna {
      display: grid;
      gap: 10px;
      align-content: start;
      justify-items: center;
    }
    .centro {
      display: grid;
      gap: 10px;
    }
    .pila {
      display: grid;
      gap: 4px;
      justify-items: center;
      padding: 6px;
      border-radius: 10px;
      border: 1px solid transparent;
      transition: border-color 0.2s ease;
    }
    .pila.cementerio {
      border-style: dashed;
      border-color: var(--border);
      min-height: 150px;
    }
    .zona {
      display: grid;
      gap: 6px;
      padding: 10px;
      border-radius: 12px;
      border: 2px dashed color-mix(in srgb, var(--dom-a) 30%, var(--border));
      background: rgb(0 0 0 / 0.18);
      min-height: 130px;
      align-content: start;
      transition:
        border-color 0.2s ease,
        box-shadow 0.2s ease;
    }
    .fila {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      align-items: center;
      min-height: 60px;
    }
    .carta {
      width: 100%;
      max-width: 96px;
      aspect-ratio: 744 / 1039;
      border-radius: 6px;
      display: block;
      box-shadow: 0 4px 12px rgb(0 0 0 / 0.45);
    }
    .fila .carta {
      width: 84px;
    }
    .runas .carta {
      width: 50px;
    }
    .dorso {
      width: 84px;
      aspect-ratio: 744 / 1039;
      border-radius: 6px;
      font-size: 1.4rem;
      font-weight: 700;
      color: var(--accent);
      background:
        repeating-linear-gradient(45deg, rgb(255 255 255 / 0.04) 0 6px, transparent 6px 12px),
        linear-gradient(160deg, #1b2a44, #0b1220);
      border: 2px solid color-mix(in srgb, var(--accent) 50%, transparent);
      box-shadow:
        0 4px 0 #050a14,
        0 6px 14px rgb(0 0 0 / 0.5);
      transition: transform 0.15s ease;
    }
    .dorso:hover {
      transform: translateY(-3px);
    }
    .dorso.runa {
      color: var(--hextech, #0ac8b9);
      border-color: color-mix(in srgb, var(--hextech, #0ac8b9) 50%, transparent);
    }
    .hueco {
      color: var(--muted);
      font-size: 0.82rem;
    }
    .hueco-carta {
      width: 84px;
      aspect-ratio: 744 / 1039;
      display: grid;
      place-items: center;
      font-size: 0.7rem;
      color: var(--muted);
      border: 1px dashed var(--border);
      border-radius: 6px;
    }
    .carta-btn {
      all: unset;
      cursor: grab;
      display: block;
      transition:
        transform 0.25s cubic-bezier(0.2, 0.8, 0.2, 1),
        filter 0.2s ease;
      animation: entra-carta 0.35s cubic-bezier(0.2, 0.8, 0.2, 1) both;
    }
    .carta-btn:active {
      cursor: grabbing;
    }
    .carta-btn:hover {
      transform: translateY(-4px) scale(1.04);
    }
    .carta-btn:focus-visible {
      outline: 2px solid var(--accent);
      outline-offset: 2px;
      border-radius: 6px;
    }
    .carta-btn.agotada {
      transform: rotate(90deg) scale(0.8);
      filter: brightness(0.7) saturate(0.7);
    }
    @keyframes entra-carta {
      from {
        opacity: 0;
        transform: translateY(-20px) scale(0.9);
      }
    }
    .mano {
      display: flex;
      justify-content: center;
      align-items: flex-end;
      min-height: 190px;
      padding: 16px 0 6px;
      border-radius: 14px;
      border: 2px solid transparent;
      transition: border-color 0.2s ease;
    }
    .en-mano {
      position: relative;
      margin: 0 -14px;
      transform: rotate(calc(var(--i) * 4deg)) translateY(calc(var(--i) * var(--i) * 3px));
      transform-origin: 50% 120%;
      transition:
        transform 0.2s ease,
        margin 0.2s ease;
    }
    .en-mano:hover {
      transform: translateY(-26px) scale(1.12);
      z-index: 2;
      margin: 0 8px;
    }
    .en-mano .carta {
      width: 118px;
      max-width: none;
    }
    .en-mano.elegida {
      transform: translateY(-34px);
      filter: drop-shadow(0 0 10px var(--accent));
    }
    .coste {
      position: absolute;
      top: -8px;
      left: 50%;
      translate: -50% 0;
      padding: 1px 7px;
      border-radius: 999px;
      font-size: 0.7rem;
      font-weight: 700;
      color: #111;
      background: var(--accent);
      pointer-events: none;
      opacity: 0;
      transition: opacity 0.15s ease;
    }
    .en-mano:hover .coste {
      opacity: 1;
    }
    .log {
      margin: 0;
      padding: 8px 8px 8px 26px;
      font-size: 0.78rem;
      color: var(--muted);
      border-radius: 8px;
      background: rgb(0 0 0 / 0.2);
      max-height: 120px;
      overflow-y: auto;
      columns: 2;
    }
    .menu {
      position: fixed;
      inset: auto 16px 16px auto;
      z-index: 50;
      display: flex;
      gap: 14px;
      padding: 14px;
      border-radius: 14px;
      background: color-mix(in srgb, var(--surface) 92%, transparent);
      backdrop-filter: blur(10px);
      border: 1px solid var(--border);
      box-shadow: 0 20px 50px rgb(0 0 0 / 0.6);
      animation: entra-carta 0.25s ease both;
    }
    .menu img {
      width: 180px;
      border-radius: 10px;
    }
    .botones {
      display: grid;
      gap: 6px;
      align-content: start;
      min-width: 170px;
    }
    @media (max-width: 900px) {
      .campos,
      .mesa-mia {
        grid-template-columns: 1fr;
      }
      .columna {
        grid-auto-flow: column;
        justify-content: start;
      }
      .campo-cuerpo {
        grid-template-columns: 1fr;
      }
      .campo-img {
        grid-row: auto;
        height: 90px;
      }
      .en-mano .carta {
        width: 84px;
      }
      .log {
        columns: 1;
      }
      .menu {
        inset: auto 8px 8px 8px;
      }
      .menu img {
        width: 120px;
      }
    }
  `,
})
export class SimuladorPage {
  readonly id = input.required<string>();
  private readonly mazos = inject(MazosService);
  private readonly catalog = inject(CatalogService);

  protected readonly meta = PUNTOS_PARA_GANAR;
  protected readonly fases = [
    { id: 'mulligan', texto: 'Preparación' },
    { id: 'despertar', texto: 'Despertar' },
    { id: 'inicio', texto: 'Inicio' },
    { id: 'accion', texto: 'Acción' },
    { id: 'final', texto: 'Final' },
  ] as const;
  protected indiceFase(f: string): number {
    return this.fases.findIndex((x) => x.id === f);
  }

  protected readonly robar1 = (p: Partida) => robar(p);
  protected readonly canalizar1 = (p: Partida) => canalizar(p);
  protected readonly terminarTurno = terminarTurno;
  protected readonly barajarMazo = barajarMazo;
  protected readonly agotarRuna = agotarRuna;
  protected readonly reciclarRuna = reciclarRuna;
  protected readonly masYo = (p: Partida) => ajustarPuntos(p, 1);
  protected readonly menosYo = (p: Partida) => ajustarPuntos(p, -1);
  protected readonly masRival = (p: Partida) => puntosRival(p, 1);
  protected readonly menosRival = (p: Partida) => puntosRival(p, -1);

  protected readonly mazo = computed(() => this.mazos.mazo(this.id()));
  protected readonly empiezoYo = signal(true);
  protected readonly p = signal<Partida>(nuevaPartida(VACIO));
  protected readonly elegidas = signal<ReadonlySet<number>>(new Set());
  protected readonly seleccion = signal<Copia | null>(null);
  protected readonly sobre = signal<string | null>(null);

  protected readonly colores = computed(() => {
    const l = this.mazo()?.leyenda;
    return estiloDominios((l && this.catalog.card(l)?.domains) || []);
  });
  protected readonly runasListas = computed(() => this.p().runas.filter((r) => !r.agotada).length);
  protected readonly ultimas = computed(() => this.p().log.slice(-8));

  constructor() {
    void this.mazos.load();
    let empezado: string | null = null;
    effect(() => {
      const m = this.mazo();
      if (m && empezado !== m.id) {
        empezado = m.id;
        this.reiniciar();
      }
    });
  }

  protected carta(id: string | null | undefined) {
    return id ? this.catalog.card(id) : undefined;
  }

  protected fichas(n: number): number[] {
    return Array.from({ length: Math.min(n, 12) }, (_, i) => i);
  }

  protected reiniciar(): void {
    const m = this.mazo();
    if (!m) return;
    this.p.set(nuevaPartida(m, { empiezoYo: this.empiezoYo(), pagarCostes: this.p().pagarCostes }));
    this.elegidas.set(new Set());
    this.seleccion.set(null);
  }

  protected aplicar(f: (p: Partida) => Partida): void {
    this.p.update(f);
    this.elegidas.set(new Set());
  }

  protected alternarPago(): void {
    this.p.update((p) => ({ ...p, pagarCostes: !p.pagarCostes }));
  }

  protected hacerMulligan(): void {
    this.p.update((p) => mulligan(p, [...this.elegidas()]));
    this.elegidas.set(new Set());
  }

  protected rivalEn(donde: number, d: number): void {
    this.p.update((p) => rival(p, donde as 0 | 1 | -1, d));
  }

  protected combate(i: number, gano: boolean): void {
    this.p.update((p) => resolverCombate(p, i as 0 | 1, gano));
  }

  protected cambiar(i: number, id: string): void {
    if (id) this.p.update((p) => cambiarCampo(p, i as 0 | 1, id));
  }

  protected zonaSel(c: Copia): ZonaSim | null {
    return zonaDe(this.p(), c.uid);
  }

  protected pulsar(c: Copia): void {
    if (this.p().fase === 'mulligan' && this.zonaSel(c) === 'mano') {
      const s = new Set(this.elegidas());
      if (s.has(c.uid)) s.delete(c.uid);
      else s.add(c.uid);
      this.elegidas.set(s);
      return;
    }
    const actual = this.seleccion();
    const z = this.zonaSel(c);
    if (actual?.uid === c.uid && z !== 'mano' && z !== 'cementerio') {
      this.agotar(c);
      return;
    }
    this.seleccion.set(c);
  }

  protected accionesDe(c: Copia): { zona: Destino; texto: string }[] {
    const z = this.zonaSel(c);
    const p = this.p();
    const nombreCampo = (i: 0 | 1) => this.carta(p.campos[i].id)?.name ?? `Campo ${i + 1}`;
    const todas: { zona: Destino; texto: string }[] = [
      { zona: 'base', texto: 'A la base' },
      { zona: 'campo0', texto: `A ${nombreCampo(0)}` },
      { zona: 'campo1', texto: `A ${nombreCampo(1)}` },
      { zona: 'mano', texto: 'A la mano' },
      { zona: 'cementerio', texto: 'Al cementerio' },
    ];
    if (z === 'runas') return [{ zona: 'cementerio', texto: 'Reciclar al cementerio' }];
    return todas.filter((a) => a.zona !== z);
  }

  protected moverA(c: Copia, zona: Destino): void {
    this.p.update((p) => mover(p, c.uid, zona, this.carta(c.id)));
    this.seleccion.set(null);
  }

  protected agotar(c: Copia): void {
    this.p.update((p) => alternarAgotada(p, c.uid));
    const s = this.seleccion();
    if (s?.uid === c.uid) this.seleccion.set({ ...s, agotada: !s.agotada });
  }

  // Arrastrar y soltar (HTML5): el uid viaja en el dataTransfer.
  protected arrastrar(e: DragEvent, c: Copia): void {
    e.dataTransfer?.setData('text/plain', String(c.uid));
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
    this.seleccion.set(null);
  }

  protected permitir(e: DragEvent, zona: string): void {
    e.preventDefault();
    if (this.sobre() !== zona) this.sobre.set(zona);
  }

  protected soltar(e: DragEvent, zona: string): void {
    e.preventDefault();
    this.sobre.set(null);
    const uid = Number(e.dataTransfer?.getData('text/plain'));
    if (!uid) return;
    const p = this.p();
    const copia = ZONAS.flatMap((z) =>
      z === 'campo0' ? p.campos[0].unidades : z === 'campo1' ? p.campos[1].unidades : p[z],
    ).find((c) => c.uid === uid);
    if (copia) this.moverA(copia, zona as Destino);
  }
}

const VACIO = {
  id: '',
  nombre: '',
  leyenda: null,
  campeon: null,
  principal: {},
  runas: {},
  campos: [],
  banquillo: {},
  actualizado: '',
};
