import { Component, OnInit, computed, inject, signal } from '@angular/core';
import {
  CATEGORIAS,
  Categoria,
  MAX_CONCEPTO,
  Movimiento,
  MovimientoBorrador,
  NOMBRE_CATEGORIA,
  NOMBRE_TIPO,
  TIPOS,
  TipoMovimiento,
  crearMovimiento,
  efecto,
  fechaDe,
  nuevoId,
  resumen,

  validarConfiguracion,
  validarMovimiento,
} from '../core/bote';
import { BoteService } from '../core/bote.service';
import { CabeceraComponent } from '../ui/cabecera.component';
import { EurPipe } from '../ui/pipes';

const MESES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

/** Bote: presupuesto mensual para el juego. Saldo, desglose del gasto y lista de movimientos. */
@Component({
  selector: 'app-bote-page',
  imports: [CabeceraComponent, EurPipe],
  template: `
    <main class="pagina">
      <app-cabecera
        titulo="Bote"
        subtitulo="Cada mes entra tu aportación; apunta aquí lo que gastas y lo que vendes."
      >
        <button type="button" class="secondary" (click)="alternarConfig()">
          {{ config() ? 'Cerrar' : 'Configurar' }}
        </button>
      </app-cabecera>

      @if (servicio.error()) {
        <p class="error" role="alert">{{ servicio.error() }}</p>
      }

      @if (config()) {
        <form class="panel configuracion" (submit)="guardarConfig($event)">
          <h2>Configuración</h2>
          <div class="campos">
            <label>
              <span>Aportación mensual (€)</span>
              <input
                type="number"
                inputmode="decimal"
                min="0"
                step="0.01"
                [value]="aportacionTexto()"
                (input)="aportacionTexto.set($any($event.target).value)"
              />
            </label>
            <label>
              <span>Mes de inicio</span>
              <input
                type="month"
                [value]="inicioTexto()"
                (input)="inicioTexto.set($any($event.target).value)"
              />
            </label>
          </div>
          <p class="muted nota">
            Desde el mes de inicio hasta hoy han entrado {{ datos().mesesAportados }}
            {{ datos().mesesAportados === 1 ? 'aportación' : 'aportaciones' }}
            ({{ datos().aportado | eur }}). Las aportaciones no se guardan: se calculan.
          </p>
          @for (e of erroresConfig(); track e) {
            <p class="error" role="alert">{{ e }}</p>
          }
          <div class="acciones">
            <button type="submit">Guardar</button>
          </div>
        </form>
      }

      <section class="resumen entrada">
        <div class="cifra principal" [class.negativo]="datos().saldo < 0">
          <span class="etiqueta">Saldo del bote</span>
          <span class="numero">{{ datos().saldo | eur }}</span>
          @if (datos().saldo < 0) {
            <span class="pie" role="status">
              @if (datos().mesesParaPositivo === null) {
                Sin aportación mensual no volverá a positivo
              } @else if (datos().mesesParaPositivo === 1) {
                1 mes para volver a positivo
              } @else {
                {{ datos().mesesParaPositivo }} meses para volver a positivo
              }
            </span>
          } @else {
            <span class="muted pie">{{ bote().aportacion | eur }} al mes desde {{ mesLegible(bote().inicio) }}</span>
          }
        </div>
        <div class="cifra">
          <span class="etiqueta">Gastado este mes</span>
          <span class="numero">{{ datos().gastadoEsteMes | eur }}</span>
        </div>
        <div class="cifra">
          <span class="etiqueta">Total aportado</span>
          <span class="numero">{{ datos().aportado | eur }}</span>
        </div>
        <div class="cifra">
          <span class="etiqueta">Total gastado</span>
          <span class="numero">{{ datos().gastado | eur }}</span>
        </div>
        <div class="cifra">
          <span class="etiqueta">Total vendido</span>
          <span class="numero">{{ datos().vendido | eur }}</span>
        </div>
      </section>

      <div class="columnas">
        <section class="panel">
          <h2>{{ editando() ? 'Editar movimiento' : 'Añadir movimiento' }}</h2>
          <form (submit)="enviar($event)">
            <div class="campos">
              <label>
                <span>Fecha</span>
                <input
                  type="date"
                  required
                  [max]="hoyTexto"
                  [value]="fecha()"
                  (input)="fecha.set($any($event.target).value)"
                />
              </label>
              <label>
                <span>Tipo</span>
                <select [value]="tipo()" (change)="tipo.set($any($event.target).value)">
                  @for (t of tipos; track t) {
                    <option [value]="t">{{ nombreTipo[t] }}</option>
                  }
                </select>
              </label>
              <label>
                <span>Categoría</span>
                <select [value]="categoria()" (change)="categoria.set($any($event.target).value)">
                  @for (c of categorias; track c) {
                    <option [value]="c">{{ nombreCategoria[c] }}</option>
                  }
                </select>
              </label>
              <label class="ancho">
                <span>Concepto</span>
                <input
                  type="text"
                  required
                  [maxLength]="maxConcepto"
                  placeholder="Caja de sobres, torneo del sábado…"
                  [value]="concepto()"
                  (input)="concepto.set($any($event.target).value)"
                />
              </label>
              <label>
                <span>Importe (€)</span>
                <input
                  type="text"
                  inputmode="decimal"
                  required
                  placeholder="0,00"
                  [value]="importe()"
                  (input)="importe.set($any($event.target).value)"
                />
              </label>
            </div>
            @if (tipo() === 'ajuste') {
              <p class="muted nota">Un ajuste suma al bote; en negativo (−20), resta.</p>
            }
            @for (e of errores(); track e) {
              <p class="error" role="alert">{{ e }}</p>
            }
            @if (aviso(); as a) {
              <div class="aviso" role="alert">
                <strong>Este movimiento deja el bote en {{ a.saldo | eur }}.</strong>
                @if (a.meses !== null) {
                  <span>
                    Harían falta {{ a.meses }} {{ a.meses === 1 ? 'mes' : 'meses' }} de aportación para
                    volver a positivo.
                  </span>
                }
                <div class="acciones">
                  <button type="button" (click)="confirmar()">Guardar igualmente</button>
                  <button type="button" class="secondary" (click)="aviso.set(null)">Cancelar</button>
                </div>
              </div>
            } @else {
              <div class="acciones">
                <button type="submit" [disabled]="!servicio.listo()">
                  {{ editando() ? 'Guardar cambios' : 'Añadir' }}
                </button>
                @if (editando()) {
                  <button type="button" class="secondary" (click)="limpiar()">Cancelar</button>
                }
              </div>
            }
          </form>
        </section>

        <section class="panel">
          <h2>Gasto por categoría</h2>
          @if (datos().gastado === 0) {
            <p class="muted">Todavía no hay gastos apuntados.</p>
          } @else {
            <ul class="categorias">
              @for (c of desglose(); track c.categoria) {
                <li>
                  <span class="nombre">{{ nombreCategoria[c.categoria] }}</span>
                  <span class="barra" aria-hidden="true">
                    <span class="relleno" [style.width.%]="c.ancho"></span>
                  </span>
                  <span class="importe">{{ c.importe | eur }}</span>
                  <span class="muted porcentaje">{{ c.porcentaje }} %</span>
                </li>
              }
            </ul>
          }
        </section>
      </div>

      <section class="movimientos">
        <h2>Movimientos</h2>
        @if (servicio.cargando()) {
          <p class="muted">Cargando tu bote…</p>
        } @else if (!bote().movimientos.length) {
          <div class="vacio">
            <p>Todavía no hay movimientos.</p>
            <p class="muted">Apunta arriba tu primer gasto o venta.</p>
          </div>
        } @else {
          <ul class="lista">
            @for (m of bote().movimientos; track m.id) {
              <li class="fila" [class.editandose]="editando() === m.id">
                <time class="fecha" [attr.datetime]="m.fecha">{{ fechaLegible(m.fecha) }}</time>
                <div class="info">
                  <span class="concepto">{{ m.concepto }}</span>
                  <span class="muted detalle">
                    {{ nombreTipo[m.tipo] }}
                    @if (m.tipo === 'gasto') {
                      · {{ nombreCategoria[m.categoria] }}
                    }
                    @if (m.fecha > hoyTexto) {
                      · <span class="error">fecha futura, no cuenta</span>
                    }
                  </span>
                </div>
                <span class="importe" [class.resta]="efecto(m) < 0" [class.suma]="efecto(m) > 0">
                  {{ efecto(m) > 0 ? '+' : '' }}{{ efecto(m) | eur }}
                </span>
                <div class="botones">
                  <button type="button" class="secondary" (click)="editar(m)">Editar</button>
                  <button type="button" class="secondary" (click)="borrar(m)">Borrar</button>
                </div>
              </li>
            }
          </ul>
        }
      </section>
    </main>
  `,
  styles: `
    .pagina {
      padding: var(--pad-pagina);
      max-width: 1000px;
      margin: 0 auto;
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      gap: 16px;
    }
    h2 {
      font-size: 1rem;
      margin-bottom: 10px;
    }
    .panel {
      padding: 14px 16px;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radio-s);
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
      border-radius: var(--radio-s);
    }
    .principal {
      grid-row: span 2;
      align-content: center;
    }
    .etiqueta {
      font-size: 0.8rem;
      color: var(--muted);
    }
    .numero {
      font-family: var(--fuente-titulos);
      font-size: 1.6rem;
      font-weight: 700;
      font-variant-numeric: tabular-nums;
    }
    .principal .numero {
      color: var(--accent);
      font-size: 2.6rem;
      line-height: 1.1;
    }
    .principal.negativo {
      border-color: color-mix(in srgb, var(--error) 50%, transparent);
      background: color-mix(in srgb, var(--error) 8%, var(--surface));
    }
    .principal.negativo .numero,
    .principal.negativo .pie {
      color: var(--error);
    }
    .pie {
      font-size: 0.8rem;
    }
    .columnas {
      display: grid;
      grid-template-columns: minmax(0, 3fr) minmax(0, 2fr);
      gap: 16px;
      align-items: start;
    }
    .campos {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
      gap: 10px;
    }
    label {
      display: grid;
      gap: 4px;
      font-size: 0.8rem;
      color: var(--muted);
    }
    label.ancho {
      grid-column: 1 / -1;
    }
    input,
    select {
      width: 100%;
      color: var(--text);
      font-size: 0.95rem;
    }
    .nota {
      margin: 8px 0 0;
      font-size: 0.85rem;
    }
    form .error {
      margin: 8px 0 0;
      font-size: 0.9rem;
    }
    .acciones {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 12px;
    }
    .aviso {
      display: grid;
      gap: 4px;
      margin-top: 12px;
      padding: 12px 14px;
      border-radius: var(--radio-s);
      border: 1px solid color-mix(in srgb, var(--error) 50%, transparent);
      background: color-mix(in srgb, var(--error) 10%, transparent);
    }
    .aviso strong {
      color: var(--error);
    }
    .aviso .acciones {
      margin-top: 6px;
    }
    .categorias {
      list-style: none;
      margin: 0;
      padding: 0;
      display: grid;
      gap: 8px;
    }
    .categorias li {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto auto;
      grid-template-areas:
        'nombre importe pct'
        'barra barra barra';
      gap: 2px 8px;
      align-items: baseline;
      font-size: 0.9rem;
    }
    .categorias .nombre {
      grid-area: nombre;
    }
    .categorias .importe {
      grid-area: importe;
      font-variant-numeric: tabular-nums;
      font-weight: 600;
    }
    .porcentaje {
      grid-area: pct;
      font-size: 0.8rem;
      min-width: 4ch;
      text-align: right;
    }
    .barra {
      grid-area: barra;
      display: block;
      height: 6px;
      border-radius: 999px;
      background: var(--surface-2);
      overflow: hidden;
    }
    .relleno {
      display: block;
      height: 100%;
      border-radius: inherit;
      background: linear-gradient(90deg, var(--accent-fuerte), var(--accent));
      transition: width 0.3s ease;
    }
    .vacio {
      text-align: center;
      padding: 32px 16px;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radio-s);
    }
    .vacio p {
      margin: 0 0 4px;
    }
    .lista {
      list-style: none;
      margin: 0;
      padding: 0;
      display: grid;
      gap: 6px;
    }
    .fila {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr) auto auto;
      gap: 4px 12px;
      align-items: center;
      padding: 10px 12px;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radio-s);
    }
    .fila.editandose {
      border-color: var(--accent);
    }
    .fecha {
      font-size: 0.85rem;
      color: var(--muted);
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }
    .info {
      display: grid;
      min-width: 0;
    }
    .concepto {
      font-weight: 600;
      overflow-wrap: anywhere;
    }
    .detalle {
      font-size: 0.8rem;
    }
    .fila .importe {
      font-family: var(--fuente-titulos);
      font-weight: 700;
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }
    .importe.resta {
      color: var(--text);
    }
    .importe.suma {
      color: var(--ok);
    }
    .botones {
      display: flex;
      gap: 6px;
    }
    .botones button {
      padding: 4px 10px;
      font-size: 0.8rem;
    }

    @media (max-width: 700px) {
      .resumen {
        grid-template-columns: 1fr 1fr;
      }
      .principal {
        grid-column: 1 / -1;
        grid-row: auto;
      }
      .columnas {
        grid-template-columns: minmax(0, 1fr);
      }
      .campos {
        grid-template-columns: 1fr 1fr;
      }
      .fila {
        grid-template-columns: minmax(0, 1fr) auto;
        grid-template-areas:
          'fecha importe'
          'info info'
          'botones botones';
      }
      .fecha {
        grid-area: fecha;
      }
      .fila .importe {
        grid-area: importe;
      }
      .info {
        grid-area: info;
      }
      .botones {
        grid-area: botones;
        justify-content: flex-end;
        margin-top: 2px;
      }
    }
  `,
})
export class BotePage implements OnInit {
  protected readonly servicio = inject(BoteService);

  protected readonly tipos = TIPOS;
  protected readonly categorias = CATEGORIAS;
  protected readonly nombreTipo = NOMBRE_TIPO;
  protected readonly nombreCategoria = NOMBRE_CATEGORIA;
  protected readonly maxConcepto = MAX_CONCEPTO;
  protected readonly efecto = efecto;

  /** Se fija al abrir la página; una sesión no cruza la medianoche en esta pantalla. */
  private readonly hoy = new Date();
  protected readonly hoyTexto = fechaDe(this.hoy);

  protected readonly bote = this.servicio.bote;
  protected readonly datos = computed(() => resumen(this.bote(), this.hoy));

  protected readonly desglose = computed(() => {
    const d = this.datos();
    const total = d.gastado;
    const filas = CATEGORIAS.map((categoria) => ({
      categoria,
      importe: d.porCategoria[categoria],
    })).filter((f) => f.importe > 0);
    const mayor = Math.max(...filas.map((f) => f.importe), 0);
    return filas
      .sort((a, b) => b.importe - a.importe)
      .map((f) => ({
        ...f,
        ancho: mayor ? (f.importe / mayor) * 100 : 0,
        porcentaje: total ? Math.round((f.importe / total) * 100) : 0,
      }));
  });

  // Formulario de movimiento.
  protected readonly fecha = signal(this.hoyTexto);
  protected readonly tipo = signal<TipoMovimiento>('gasto');
  protected readonly categoria = signal<Categoria>('cartas');
  protected readonly concepto = signal('');
  protected readonly importe = signal('');
  protected readonly editando = signal<string | null>(null);
  protected readonly errores = signal<string[]>([]);
  /** Movimiento validado que dejaría el bote en negativo, a la espera de confirmación. */
  protected readonly aviso = signal<{ movimiento: Movimiento; saldo: number; meses: number | null } | null>(
    null,
  );

  // Configuración.
  protected readonly config = signal(false);
  protected readonly aportacionTexto = signal('');
  protected readonly inicioTexto = signal('');
  protected readonly erroresConfig = signal<string[]>([]);

  ngOnInit(): void {
    void this.servicio.load();
  }

  protected alternarConfig(): void {
    if (!this.config()) {
      this.aportacionTexto.set(String(this.bote().aportacion));
      this.inicioTexto.set(this.bote().inicio);
      this.erroresConfig.set([]);
    }
    this.config.update((v) => !v);
  }

  protected guardarConfig(ev: Event): void {
    ev.preventDefault();
    const aportacion = Number(this.aportacionTexto().replace(',', '.'));
    const inicio = this.inicioTexto();
    const errores = validarConfiguracion(aportacion, inicio);
    this.erroresConfig.set(errores);
    if (errores.length) return;
    this.servicio.configurar(aportacion, inicio);
    this.config.set(false);
  }

  private borrador(): MovimientoBorrador {
    return {
      fecha: this.fecha(),
      tipo: this.tipo(),
      categoria: this.categoria(),
      concepto: this.concepto(),
      importe: this.importe(),
    };
  }

  protected enviar(ev: Event): void {
    ev.preventDefault();
    const b = this.borrador();
    const errores = validarMovimiento(b, this.hoy);
    this.errores.set(errores);
    if (errores.length) return;
    const m = crearMovimiento(b, this.editando() ?? nuevoId());
    // Si el movimiento deja el bote en negativo, se avisa y se pide confirmar (sin bloquear).
    const despues = resumen(
      { ...this.bote(), movimientos: [...this.bote().movimientos.filter((x) => x.id !== m.id), m] },
      this.hoy,
    );
    if (efecto(m) < 0 && despues.saldo < 0) {
      this.aviso.set({ movimiento: m, saldo: despues.saldo, meses: despues.mesesParaPositivo });
      return;
    }
    this.guardar(m);
  }

  protected confirmar(): void {
    const a = this.aviso();
    if (a) this.guardar(a.movimiento);
  }

  private guardar(m: Movimiento): void {
    this.servicio.guardarMovimiento(m);
    this.limpiar();
  }

  protected limpiar(): void {
    this.editando.set(null);
    this.aviso.set(null);
    this.errores.set([]);
    this.fecha.set(this.hoyTexto);
    this.concepto.set('');
    this.importe.set('');
  }

  protected editar(m: Movimiento): void {
    this.editando.set(m.id);
    this.aviso.set(null);
    this.errores.set([]);
    this.fecha.set(m.fecha);
    this.tipo.set(m.tipo);
    this.categoria.set(m.categoria);
    this.concepto.set(m.concepto);
    this.importe.set(m.importe.toFixed(2).replace('.', ','));
    document.querySelector('.columnas')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  protected borrar(m: Movimiento): void {
    if (!confirm(`¿Borrar "${m.concepto}" (${NOMBRE_TIPO[m.tipo].toLowerCase()} de ${m.importe} €)?`))
      return;
    if (this.editando() === m.id) this.limpiar();
    this.servicio.borrarMovimiento(m.id);
  }

  /** 2027-01-05 → 5 ene 2027. */
  protected fechaLegible(fecha: string): string {
    const [a, m, d] = fecha.split('-').map(Number);
    return `${d} ${MESES[m - 1]?.slice(0, 3) ?? '?'} ${a}`;
  }

  /** 2026-12 → diciembre de 2026. */
  protected mesLegible(mes: string): string {
    const [a, m] = mes.split('-').map(Number);
    return `${MESES[m - 1] ?? '?'} de ${a}`;
  }

}
