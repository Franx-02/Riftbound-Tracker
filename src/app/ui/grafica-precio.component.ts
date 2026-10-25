import {
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  computed,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { EurPipe } from './pipes';

/** Un día del historial: [fecha AAAA-MM-DD, normal, foil]. null = sin datos. */
export type PuntoPrecio = [string, number | null, number | null];

type Rango = '1M' | '3M' | '1A' | 'todo';
const DIAS: Record<Rango, number> = { '1M': 31, '3M': 92, '1A': 366, todo: Infinity };

/** Colores validados para el fondo oscuro de la app (skill de dataviz, 6 comprobaciones). */
const SERIES = [
  { clave: 1, nombre: 'Normal', color: '#b08a24' },
  { clave: 2, nombre: 'Foil', color: '#3b8fe0' },
] as const;

const ALTO = 200;
const MARGEN = { arriba: 12, derecha: 12, abajo: 26, izquierda: 52 };
const FECHA = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short' });
const FECHA_LARGA = new Intl.DateTimeFormat('es-ES', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});
const EUROS = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });

const aFecha = (s: string) => new Date(`${s}T12:00:00`);

/**
 * Evolución del precio de una carta (tendencia de Cardmarket, normal y foil).
 * Una sola escala en euros para las dos series: es la misma magnitud.
 */
@Component({
  selector: 'app-grafica-precio',
  imports: [EurPipe],
  template: `
    <div class="cabecera">
      <ul class="leyenda">
        @for (s of seriesVisibles(); track s.clave) {
          <li><span class="muestra" [style.background]="s.color"></span>{{ s.nombre }}</li>
        }
      </ul>
      <div class="rangos" role="group" aria-label="Periodo">
        @for (r of rangos; track r.id) {
          <button
            type="button"
            class="rango"
            [class.activo]="rango() === r.id"
            [attr.aria-pressed]="rango() === r.id"
            (click)="rango.set(r.id)"
          >
            {{ r.texto }}
          </button>
        }
      </div>
    </div>

    <div #lienzo class="lienzo">
      @if (geometria(); as g) {
        <svg
          [attr.width]="g.ancho"
          [attr.height]="alto"
          role="img"
          [attr.aria-label]="resumen()"
          (pointermove)="mover($event)"
          (pointerleave)="indice.set(null)"
        >
          @for (t of g.ticks; track t.v) {
            <line
              class="rejilla"
              [attr.x1]="margen.izquierda"
              [attr.x2]="g.ancho - margen.derecha"
              [attr.y1]="t.y"
              [attr.y2]="t.y"
            />
            <text class="eje" [attr.x]="margen.izquierda - 6" [attr.y]="t.y + 4" text-anchor="end">
              {{ t.texto }}
            </text>
          }
          @for (f of g.fechas; track f.x) {
            <text class="eje" [attr.x]="f.x" [attr.y]="alto - 6" [attr.text-anchor]="f.ancla">
              {{ f.texto }}
            </text>
          }
          @for (s of g.lineas; track s.clave) {
            <path class="linea" [attr.d]="s.d" [attr.stroke]="s.color" />
            @if (g.puntos.length === 1) {
              <circle [attr.cx]="s.ultimo.x" [attr.cy]="s.ultimo.y" r="4" [attr.fill]="s.color" />
            }
          }
          @if (indice() !== null && g.puntos[indice()!]; as p) {
            <line
              class="cruz"
              [attr.x1]="p.x"
              [attr.x2]="p.x"
              [attr.y1]="margen.arriba"
              [attr.y2]="alto - margen.abajo"
            />
            @for (s of g.lineas; track s.clave) {
              @if (p.y[s.clave] !== null) {
                <circle
                  class="marca"
                  [attr.cx]="p.x"
                  [attr.cy]="p.y[s.clave]"
                  r="4.5"
                  [attr.fill]="s.color"
                />
              }
            }
          }
        </svg>
        @if (indice() !== null && datos()[indice()!]; as d) {
          <div
            class="tooltip"
            [style.left.px]="g.puntos[indice()!].x"
            [class.izquierda]="indice()! > datos().length / 2"
          >
            <strong>{{ fechaLarga(d[0]) }}</strong>
            @for (s of seriesVisibles(); track s.clave) {
              <span
                ><i [style.background]="s.color"></i>{{ s.nombre }}
                {{ d[s.clave] | eur: '—' }}</span
              >
            }
          </div>
        }
      }
    </div>

    @if (datos().length === 1) {
      <p class="muted nota">
        El historial empieza aquí: se guarda el precio una vez al día, así que la línea irá
        apareciendo con los días.
      </p>
    }

    <details class="tabla">
      <summary>Ver como tabla</summary>
      <table>
        <thead>
          <tr>
            <th>Fecha</th>
            @for (s of seriesVisibles(); track s.clave) {
              <th>{{ s.nombre }}</th>
            }
          </tr>
        </thead>
        <tbody>
          @for (d of datosInvertidos(); track d[0]) {
            <tr>
              <td>{{ fechaLarga(d[0]) }}</td>
              @for (s of seriesVisibles(); track s.clave) {
                <td>{{ d[s.clave] | eur: '—' }}</td>
              }
            </tr>
          }
        </tbody>
      </table>
    </details>
  `,
  styles: `
    :host {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      min-width: 0;
      gap: 8px;
    }
    .cabecera {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }
    .leyenda {
      display: flex;
      gap: 12px;
      margin: 0;
      padding: 0;
      list-style: none;
      font-size: 0.85rem;
      color: var(--muted);
    }
    .leyenda li {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .muestra {
      width: 14px;
      height: 3px;
      border-radius: 2px;
    }
    .rangos {
      display: flex;
      gap: 4px;
    }
    .rango {
      padding: 4px 10px;
      font-size: 0.8rem;
      background: transparent;
      color: var(--muted);
      border: 1px solid var(--border);
    }
    .rango.activo {
      background: var(--surface-2);
      color: var(--text);
    }
    .lienzo {
      position: relative;
      overflow: hidden;
      min-width: 0;
      min-height: 200px;
      touch-action: pan-y;
    }
    svg {
      display: block;
    }
    .rejilla {
      stroke: var(--border);
      stroke-width: 1;
    }
    .eje {
      fill: var(--muted);
      font-size: 11px;
      font-variant-numeric: tabular-nums;
    }
    .linea {
      fill: none;
      stroke-width: 2;
      stroke-linejoin: round;
      stroke-linecap: round;
    }
    .cruz {
      stroke: var(--muted);
      stroke-width: 1;
      stroke-dasharray: 3 3;
    }
    .marca {
      stroke: var(--surface);
      stroke-width: 2;
    }
    .tooltip {
      position: absolute;
      top: 4px;
      transform: translateX(8px);
      display: grid;
      gap: 2px;
      padding: 6px 10px;
      font-size: 0.8rem;
      background: var(--bg);
      border: 1px solid var(--border);
      border-radius: 2px;
      pointer-events: none;
      white-space: nowrap;
    }
    .tooltip.izquierda {
      transform: translateX(calc(-100% - 8px));
    }
    .tooltip span {
      display: flex;
      align-items: center;
      gap: 6px;
      font-variant-numeric: tabular-nums;
    }
    .tooltip i {
      width: 8px;
      height: 8px;
      border-radius: 50%;
    }
    .nota {
      margin: 0;
      font-size: 0.8rem;
    }
    .tabla summary {
      cursor: pointer;
      font-size: 0.8rem;
      color: var(--muted);
    }
    .tabla table {
      width: 100%;
      margin-top: 6px;
      font-size: 0.8rem;
      border-collapse: collapse;
      font-variant-numeric: tabular-nums;
    }
    .tabla th,
    .tabla td {
      padding: 3px 6px;
      text-align: right;
      border-bottom: 1px solid var(--border);
    }
    .tabla th:first-child,
    .tabla td:first-child {
      text-align: left;
    }
  `,
})
export class GraficaPrecioComponent {
  readonly puntos = input.required<readonly PuntoPrecio[]>();
  /** Nombres de las dos series (por defecto, los precios normal y foil de una carta). */
  readonly nombres = input<readonly [string, string]>(['Normal', 'Foil']);

  protected readonly alto = ALTO;
  protected readonly margen = MARGEN;
  protected readonly rangos: { id: Rango; texto: string }[] = [
    { id: '1M', texto: '1M' },
    { id: '3M', texto: '3M' },
    { id: '1A', texto: '1A' },
    { id: 'todo', texto: 'Todo' },
  ];
  protected readonly rango = signal<Rango>('3M');
  protected readonly indice = signal<number | null>(null);
  private readonly ancho = signal(0);
  private readonly lienzo = viewChild.required<ElementRef<HTMLDivElement>>('lienzo');

  /** Los puntos del periodo elegido, contando desde el último día con datos. */
  protected readonly datos = computed(() => {
    const todos = this.puntos();
    if (!todos.length) return [];
    const ultimo = aFecha(todos[todos.length - 1][0]).getTime();
    const desde = ultimo - DIAS[this.rango()] * 86_400_000;
    return todos.filter((p) => aFecha(p[0]).getTime() >= desde);
  });
  protected readonly datosInvertidos = computed(() => [...this.puntos()].reverse());

  /** Una serie solo sale si tiene algún dato (muchas cartas no tienen precio foil). */
  protected readonly seriesVisibles = computed(() =>
    SERIES.map((s, i) => ({ ...s, nombre: this.nombres()[i] ?? s.nombre })).filter((s) =>
      this.puntos().some((p) => p[s.clave] !== null),
    ),
  );

  protected readonly geometria = computed(() => {
    const datos = this.datos();
    const ancho = this.ancho();
    if (!datos.length || ancho < 120) return null;
    const series = this.seriesVisibles();
    const valores = datos
      .flatMap((p) => series.map((s) => p[s.clave]))
      .filter((v): v is number => v !== null);
    if (!valores.length) return null;

    let min = Math.min(...valores);
    let max = Math.max(...valores);
    // Con un solo valor (o todos iguales) se abre un margen para que la línea no quede pegada.
    if (max - min < 0.01) {
      min = Math.max(0, min * 0.8);
      max = max * 1.2 + 0.01;
    }
    const paso = pasoBonito((max - min) / 4);
    min = Math.max(0, Math.floor(min / paso) * paso);
    max = Math.ceil(max / paso) * paso;

    const t0 = aFecha(datos[0][0]).getTime();
    const t1 = aFecha(datos[datos.length - 1][0]).getTime();
    const x = (fecha: string) => {
      const w = ancho - MARGEN.izquierda - MARGEN.derecha;
      if (t1 === t0) return MARGEN.izquierda + w / 2;
      return MARGEN.izquierda + ((aFecha(fecha).getTime() - t0) / (t1 - t0)) * w;
    };
    const y = (v: number) =>
      MARGEN.arriba + (1 - (v - min) / (max - min)) * (ALTO - MARGEN.arriba - MARGEN.abajo);

    const ticks: { v: number; y: number; texto: string }[] = [];
    for (let v = min; v <= max + paso / 2; v += paso)
      ticks.push({ v, y: y(v), texto: EUROS.format(v) });

    const fechas =
      datos.length === 1
        ? [{ x: x(datos[0][0]), texto: FECHA.format(aFecha(datos[0][0])), ancla: 'middle' }]
        : [
            { x: x(datos[0][0]), texto: FECHA.format(aFecha(datos[0][0])), ancla: 'start' },
            {
              x: x(datos[datos.length - 1][0]),
              texto: FECHA.format(aFecha(datos[datos.length - 1][0])),
              ancla: 'end',
            },
          ];

    const lineas = series.map((s) => {
      let d = '';
      let ultimo = { x: 0, y: 0 };
      let abierto = false;
      for (const p of datos) {
        const v = p[s.clave];
        if (v === null) {
          abierto = false; // hueco: un día sin datos corta la línea
          continue;
        }
        ultimo = { x: x(p[0]), y: y(v) };
        d += `${abierto ? 'L' : 'M'}${ultimo.x.toFixed(1)},${ultimo.y.toFixed(1)}`;
        abierto = true;
      }
      return { clave: s.clave, color: s.color, d, ultimo };
    });

    const puntos = datos.map((p) => ({
      x: x(p[0]),
      y: { 1: p[1] === null ? null : y(p[1]), 2: p[2] === null ? null : y(p[2]) } as Record<
        number,
        number | null
      >,
    }));
    return { ancho, ticks, fechas, lineas, puntos };
  });

  protected readonly resumen = computed(() => {
    const d = this.datos();
    if (!d.length) return 'Sin historial de precios';
    const ultimo = d[d.length - 1];
    return `Precio en Cardmarket del ${this.fechaLarga(d[0][0])} al ${this.fechaLarga(ultimo[0])}. Último: normal ${ultimo[1] === null ? 'sin datos' : EUROS.format(ultimo[1])}, foil ${ultimo[2] === null ? 'sin datos' : EUROS.format(ultimo[2])}.`;
  });

  constructor() {
    const destroy = inject(DestroyRef);
    afterNextRender(() => {
      const el = this.lienzo().nativeElement;
      const obs = new ResizeObserver(([e]) => this.ancho.set(Math.floor(e.contentRect.width)));
      obs.observe(el);
      destroy.onDestroy(() => obs.disconnect());
    });
  }

  /** La cruceta salta al día más cercano al puntero (o al dedo). */
  protected mover(e: PointerEvent): void {
    const g = this.geometria();
    if (!g) return;
    const x = e.offsetX;
    let mejor = 0;
    for (let i = 1; i < g.puntos.length; i++)
      if (Math.abs(g.puntos[i].x - x) < Math.abs(g.puntos[mejor].x - x)) mejor = i;
    this.indice.set(mejor);
  }

  protected fechaLarga(s: string): string {
    return FECHA_LARGA.format(aFecha(s));
  }
}

/** 1, 2 o 5 por una potencia de 10: marcas del eje legibles (0,50 €, 1 €, 2 €…). */
function pasoBonito(bruto: number): number {
  const p = 10 ** Math.floor(Math.log10(Math.max(bruto, 0.001)));
  const n = bruto / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}
