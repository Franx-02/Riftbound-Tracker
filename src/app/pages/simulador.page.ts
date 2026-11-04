import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { RouterLink } from '@angular/router';
import { CatalogService } from '../core/catalog.service';
import { estiloDominios } from '../core/dominios';
import { MazosService } from '../core/mazos.service';
import {
  Copia,
  MAX_MULLIGAN,
  Partida,
  ZonaSim,
  alternarAgotada,
  barajarMazo,
  canalizar,
  mover,
  mulligan,
  nuevaPartida,
  robar,
  siguienteTurno,
} from '../core/simulador';
import { InclinarDirective } from '../ui/inclinar.directive';
import { ThumbPipe } from '../ui/pipes';

/**
 * Simulador de partida en solitario para probar un mazo: mano inicial y mulligan, robar,
 * canalizar runas, jugar cartas a la base o al campo de batalla, agotarlas y mandarlas al
 * cementerio. Pulsar una carta la selecciona y abre sus acciones; pulsar una carta en
 * juego dos veces la agota o la prepara.
 */
@Component({
  selector: 'app-simulador-page',
  imports: [RouterLink, NgTemplateOutlet, ThumbPipe, InclinarDirective],
  template: `
    @if (mazo(); as m) {
      <main class="mesa" [style]="colores()">
        <header class="barra">
          <a [routerLink]="['/mazos', m.id]">← {{ m.nombre }}</a>
          <span class="turno">Turno {{ p().turno }}</span>
          <span class="puntos">
            <button
              type="button"
              class="secondary mini"
              (click)="puntos(-1)"
              aria-label="Quitar punto"
            >
              −
            </button>
            <strong>{{ p().puntos }}</strong> / 8 puntos
            <button
              type="button"
              class="secondary mini"
              (click)="puntos(1)"
              aria-label="Sumar punto"
            >
              +
            </button>
          </span>
          <span class="acciones">
            @if (p().inicio) {
              <button type="button" (click)="hacerMulligan()">
                {{ elegidas().size ? 'Mulligan (' + elegidas().size + ')' : 'Me la quedo' }}
              </button>
            } @else {
              <button type="button" (click)="aplicar(siguienteTurno)">Siguiente turno</button>
            }
            <button type="button" class="secondary" (click)="aplicar(robar)">Robar</button>
            <button type="button" class="secondary" (click)="aplicar(canalizar)">
              Canalizar 2
            </button>
            <button type="button" class="secondary" (click)="aplicar(barajarMazo)">Barajar</button>
            <button type="button" class="secondary" (click)="reiniciar()">Reiniciar</button>
          </span>
        </header>

        @if (p().inicio) {
          <p class="aviso">
            Elige hasta {{ maxMulligan }} cartas de tu mano para devolverlas al fondo del mazo, o
            quédate la mano.
          </p>
        }

        <div class="tablero">
          <aside class="lateral">
            <div class="pila">
              <span class="etiqueta">Leyenda</span>
              @if (carta(m.leyenda); as l) {
                <img [src]="l.imgUrl | thumb: 240" [alt]="l.name" class="carta" />
              }
            </div>
            <div class="pila">
              <span class="etiqueta">Campeón</span>
              @for (c of p().campeon; track c.uid) {
                <ng-container *ngTemplateOutlet="tCarta; context: { $implicit: c }" />
              } @empty {
                <span class="hueco">—</span>
              }
            </div>
            <div class="pila contador">
              <span class="etiqueta">Mazo</span>
              <button
                type="button"
                class="dorso"
                (click)="aplicar(robar)"
                aria-label="Robar una carta"
              >
                {{ p().mazo.length }}
              </button>
            </div>
            <div class="pila contador">
              <span class="etiqueta">Runas</span>
              <button
                type="button"
                class="dorso runa"
                (click)="aplicar(canalizar)"
                aria-label="Canalizar 2 runas"
              >
                {{ p().mazoRunas.length }}
              </button>
            </div>
          </aside>

          <section class="zonas">
            <div class="zona campo">
              <span class="etiqueta">
                Campo de batalla
                @if (campoActual(); as c) {
                  · {{ c.name }}
                }
              </span>
              @if (p().campos.length > 1) {
                <span class="cambiar-campo">
                  @for (id of p().campos; track $index) {
                    <button
                      type="button"
                      class="secondary mini"
                      [class.activo]="$index === campoElegido()"
                      (click)="campoElegido.set($index)"
                    >
                      {{ carta(id)?.name ?? id }}
                    </button>
                  }
                </span>
              }
              <div class="fila">
                @if (campoActual(); as c) {
                  <img class="campo-img" [src]="c.imgUrl | thumb: 400" [alt]="c.name" />
                }
                @for (c of p().campo; track c.uid) {
                  <ng-container *ngTemplateOutlet="tCarta; context: { $implicit: c }" />
                }
              </div>
            </div>

            <div class="zona">
              <span class="etiqueta">Base</span>
              <div class="fila">
                @for (c of p().base; track c.uid) {
                  <ng-container *ngTemplateOutlet="tCarta; context: { $implicit: c }" />
                } @empty {
                  <span class="hueco">Juega cartas desde tu mano.</span>
                }
              </div>
            </div>

            <div class="zona">
              <span class="etiqueta">
                Runas canalizadas · {{ runasListas() }}/{{ p().runas.length }} listas
              </span>
              <div class="fila runas">
                @for (c of p().runas; track c.uid) {
                  <ng-container *ngTemplateOutlet="tCarta; context: { $implicit: c }" />
                }
              </div>
            </div>
          </section>

          <aside class="lateral derecha">
            <div class="pila">
              <span class="etiqueta">Cementerio · {{ p().cementerio.length }}</span>
              @if (p().cementerio.at(-1); as c) {
                <ng-container *ngTemplateOutlet="tCarta; context: { $implicit: c }" />
              } @else {
                <span class="hueco">—</span>
              }
            </div>
            <ol class="log">
              @for (l of ultimas(); track $index) {
                <li>{{ l }}</li>
              }
            </ol>
          </aside>
        </div>

        <section class="mano" aria-label="Tu mano">
          @for (c of p().mano; track c.uid; let i = $index) {
            <div
              class="en-mano"
              [style.--i]="i - (p().mano.length - 1) / 2"
              [class.elegida]="elegidas().has(c.uid)"
            >
              <ng-container *ngTemplateOutlet="tCarta; context: { $implicit: c }" />
            </div>
          } @empty {
            <span class="hueco">Mano vacía</span>
          }
        </section>

        @if (seleccion(); as s) {
          <div class="menu" role="dialog" aria-label="Acciones de la carta">
            <img
              [src]="carta(s.id)?.imgUrl ?? '' | thumb: 400"
              [alt]="carta(s.id)?.name ?? ''"
              appInclinar
            />
            <div class="botones">
              <strong>{{ carta(s.id)?.name }}</strong>
              @for (a of accionesDe(s); track a.zona) {
                <button type="button" class="secondary" (click)="moverA(s, a.zona)">
                  {{ a.texto }}
                </button>
              }
              @if (zonaDe(s) !== 'mano' && zonaDe(s) !== 'cementerio') {
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
      padding: 12px 16px 24px;
      display: grid;
      gap: 12px;
      min-height: calc(100dvh - 60px);
      background:
        radial-gradient(
          ellipse at 50% 0%,
          color-mix(in srgb, var(--dom-a) 18%, transparent),
          transparent 60%
        ),
        radial-gradient(
          ellipse at 50% 120%,
          color-mix(in srgb, var(--dom-b, var(--dom-a)) 14%, transparent),
          transparent 55%
        );
    }
    .barra {
      display: flex;
      flex-wrap: wrap;
      gap: 10px 16px;
      align-items: center;
    }
    .barra a {
      text-decoration: none;
    }
    .turno {
      font-family: var(--fuente-titulos);
      font-weight: 700;
    }
    .puntos {
      display: inline-flex;
      gap: 6px;
      align-items: center;
    }
    .acciones {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-left: auto;
    }
    .mini {
      padding: 2px 8px;
      min-height: 0;
      font-size: 0.8rem;
    }
    .mini.activo {
      border-color: var(--accent);
      color: var(--accent);
    }
    .aviso {
      margin: 0;
      padding: 8px 12px;
      border-radius: 8px;
      background: color-mix(in srgb, var(--accent) 12%, transparent);
      border: 1px solid color-mix(in srgb, var(--accent) 40%, transparent);
      font-size: 0.9rem;
    }
    .tablero {
      display: grid;
      grid-template-columns: 110px minmax(0, 1fr) 160px;
      gap: 12px;
    }
    .lateral {
      display: grid;
      gap: 10px;
      align-content: start;
    }
    .pila {
      display: grid;
      gap: 4px;
      justify-items: center;
    }
    .etiqueta {
      font-size: 0.72rem;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--muted);
    }
    .carta {
      width: 100%;
      max-width: 100px;
      aspect-ratio: 744 / 1039;
      border-radius: 6px;
      display: block;
      box-shadow: 0 4px 12px rgb(0 0 0 / 0.45);
    }
    .dorso {
      width: 90px;
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
    .zonas {
      display: grid;
      gap: 10px;
    }
    .zona {
      display: grid;
      gap: 6px;
      padding: 10px;
      border-radius: 12px;
      border: 1px dashed color-mix(in srgb, var(--dom-a) 35%, var(--border));
      background: rgb(0 0 0 / 0.18);
      min-height: 120px;
      align-content: start;
    }
    .zona.campo {
      border-style: solid;
    }
    .cambiar-campo {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
    }
    .fila {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      align-items: center;
    }
    .fila .carta {
      width: 80px;
    }
    .runas .carta {
      width: 54px;
    }
    .campo-img {
      height: 112px;
      width: auto;
      border-radius: 6px;
      opacity: 0.85;
    }
    .hueco {
      color: var(--muted);
      font-size: 0.85rem;
    }
    .carta-btn {
      all: unset;
      cursor: pointer;
      display: block;
      transition: transform 0.25s cubic-bezier(0.2, 0.8, 0.2, 1);
      animation: entra-carta 0.35s cubic-bezier(0.2, 0.8, 0.2, 1) both;
    }
    .carta-btn:focus-visible {
      outline: 2px solid var(--accent);
      outline-offset: 2px;
      border-radius: 6px;
    }
    .carta-btn.agotada {
      transform: rotate(90deg) scale(0.85);
      filter: brightness(0.75);
    }
    @keyframes entra-carta {
      from {
        opacity: 0;
        transform: translateY(-20px) scale(0.9);
      }
    }
    .log {
      margin: 0;
      padding: 8px 8px 8px 24px;
      font-size: 0.78rem;
      color: var(--muted);
      border-radius: 8px;
      background: rgb(0 0 0 / 0.2);
      max-height: 260px;
      overflow-y: auto;
    }
    .mano {
      display: flex;
      justify-content: center;
      align-items: flex-end;
      min-height: 170px;
      padding-top: 16px;
    }
    .en-mano {
      margin: 0 -14px;
      transform: rotate(calc(var(--i) * 4deg)) translateY(calc(var(--i) * var(--i) * 3px));
      transform-origin: 50% 120%;
      transition:
        transform 0.2s ease,
        margin 0.2s ease;
    }
    .en-mano:hover {
      transform: translateY(-24px) scale(1.12);
      z-index: 2;
      margin: 0 6px;
    }
    .en-mano .carta {
      width: 118px;
      max-width: none;
    }
    .en-mano.elegida {
      transform: translateY(-30px);
      filter: drop-shadow(0 0 10px var(--accent));
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
      min-width: 160px;
    }
    @media (max-width: 800px) {
      .tablero {
        grid-template-columns: 1fr;
      }
      .lateral {
        grid-auto-flow: column;
        justify-content: start;
      }
      .en-mano .carta {
        width: 84px;
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

  protected readonly maxMulligan = MAX_MULLIGAN;
  protected readonly robar = (p: Partida) => robar(p);
  protected readonly canalizar = (p: Partida) => canalizar(p);
  protected readonly siguienteTurno = siguienteTurno;
  protected readonly barajarMazo = barajarMazo;

  protected readonly mazo = computed(() => this.mazos.mazo(this.id()));
  protected readonly p = signal<Partida>(nuevaPartida({ ...vacio }));
  protected readonly elegidas = signal<ReadonlySet<number>>(new Set());
  protected readonly seleccion = signal<Copia | null>(null);
  protected readonly campoElegido = signal(0);

  protected readonly colores = computed(() => {
    const l = this.mazo()?.leyenda;
    return estiloDominios((l && this.catalog.card(l)?.domains) || []);
  });
  protected readonly campoActual = computed(() => {
    const id = this.p().campos[this.campoElegido()];
    return id ? this.catalog.card(id) : undefined;
  });
  protected readonly runasListas = computed(() => this.p().runas.filter((r) => !r.agotada).length);
  protected readonly ultimas = computed(() => this.p().log.slice(-12));

  constructor() {
    void this.mazos.load();
    // En cuanto llega el mazo, se baraja la primera partida.
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

  protected reiniciar(): void {
    const m = this.mazo();
    if (!m) return;
    this.p.set(nuevaPartida(m));
    this.elegidas.set(new Set());
    this.seleccion.set(null);
    this.campoElegido.set(0);
  }

  protected aplicar(f: (p: Partida) => Partida): void {
    this.p.update(f);
    this.elegidas.set(new Set());
  }

  protected puntos(d: number): void {
    this.p.update((p) => ({ ...p, puntos: Math.max(0, Math.min(8, p.puntos + d)) }));
  }

  protected hacerMulligan(): void {
    this.p.update((p) => mulligan(p, [...this.elegidas()]));
    this.elegidas.set(new Set());
  }

  protected pulsar(c: Copia): void {
    // Durante el mulligan, pulsar una carta de la mano la marca para devolverla.
    if (this.p().inicio && this.zonaDe(c) === 'mano') {
      const s = new Set(this.elegidas());
      if (s.has(c.uid)) s.delete(c.uid);
      else if (s.size < MAX_MULLIGAN) s.add(c.uid);
      this.elegidas.set(s);
      return;
    }
    const actual = this.seleccion();
    // Segunda pulsación sobre una carta en juego: agotar o preparar.
    if (actual?.uid === c.uid && this.zonaDe(c) !== 'mano' && this.zonaDe(c) !== 'cementerio') {
      this.agotar(c);
      return;
    }
    this.seleccion.set(c);
  }

  protected zonaDe(c: Copia): ZonaSim | null {
    const p = this.p();
    const zonas: ZonaSim[] = ['mano', 'base', 'campo', 'cementerio', 'runas', 'campeon'];
    return zonas.find((z) => p[z].some((x) => x.uid === c.uid)) ?? null;
  }

  protected accionesDe(c: Copia): { zona: ZonaSim; texto: string }[] {
    const z = this.zonaDe(c);
    const todas: { zona: ZonaSim; texto: string }[] = [
      { zona: 'base', texto: 'A la base' },
      { zona: 'campo', texto: 'Al campo de batalla' },
      { zona: 'mano', texto: 'A la mano' },
      { zona: 'cementerio', texto: 'Al cementerio' },
    ];
    if (z === 'runas') return [{ zona: 'cementerio', texto: 'Reciclar (al cementerio)' }];
    return todas.filter((a) => a.zona !== z);
  }

  protected moverA(c: Copia, zona: ZonaSim): void {
    this.p.update((p) => {
      const s = mover(p, c.uid, zona);
      const nombre = this.carta(c.id)?.name ?? c.id;
      const texto: Record<ZonaSim, string> = {
        base: 'a la base',
        campo: 'al campo de batalla',
        mano: 'a la mano',
        cementerio: 'al cementerio',
        runas: 'a las runas',
        campeon: 'a su zona',
      };
      return { ...s, log: [...s.log, `${nombre} ${texto[zona]}.`] };
    });
    this.seleccion.set(null);
  }

  protected agotar(c: Copia): void {
    this.p.update((p) => alternarAgotada(p, c.uid));
    const s = this.seleccion();
    if (s?.uid === c.uid) this.seleccion.set({ ...s, agotada: !s.agotada });
  }
}

const vacio = {
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
