import {
  Component,
  ElementRef,
  OnDestroy,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { CatalogCard, CatalogService } from '../core/catalog.service';
import { CollectionService, Finish } from '../core/collection.service';
import { PROPORCION_CARTA, Pixeles } from '../core/huella';
import {
  Encuadre,
  ReconocimientoService,
  Votacion,
  encuadresAlrededor,
  localizarCarta,
} from '../core/reconocimiento.service';
import { cartasDelCodigo, parseCodigos } from '../core/scanner';
import { TraduccionService } from '../core/traduccion.service';
import { VotacionRed, combinarRedYHuella } from '../core/red';
import { RedService } from '../core/red.service';
import { ValuationService } from '../core/valuation.service';
import { EurPipe, ThumbPipe } from '../ui/pipes';
import { QtyControlComponent } from '../ui/qty-control.component';

/** Pausa entre lecturas de la cámara. Reconocer un fotograma tarda unos 20-60 ms. */
const PAUSA_MS = 350;
/** Tras añadir o cerrar, cuánto tarda en poder volver a saltar la misma carta. */
const BLOQUEO_MS = 4000;
/** Ancho al que se reduce la carta antes de calcular su huella: de sobra para 32×32. */
const ANCHO_MUESTRA = 240;
/** Margen alrededor de la guía que también se captura, en fracción de su tamaño. */
const MARGEN = 0.2;

/** La ventana de "carta encontrada": las candidatas y cuál se está enseñando. */
interface Encontrada {
  cartas: CatalogCard[];
  elegida: number;
  nota: string | null;
  origen: 'camara' | 'foto';
}

interface Resultado {
  /** Para el `track` y para no repetir el mismo resultado arriba. */
  clave: string;
  titulo: string;
  nota: string | null;
  cartas: CatalogCard[];
}

/**
 * Escáner: reconoce la carta por su ilustración, con la cámara o con una foto, y deja
 * sumarla a la colección. Compara la huella de la imagen con las de todo el catálogo
 * (ver src/app/core/huella.ts) y enseña las más parecidas para que el usuario confirme.
 * También se puede escribir el código impreso (`SFD 198`).
 */
@Component({
  selector: 'app-scanner-page',
  imports: [RouterLink, ThumbPipe, EurPipe, QtyControlComponent],
  template: `
    <main class="pagina">
      <header>
        <h1>Escanear cartas</h1>
        <p class="muted">
          Pon la carta dentro del recuadro, entera y de frente (no hace falta que lo llene).
          Funciona mejor con buena luz, sobre un fondo liso y sin reflejos.
        </p>
      </header>

      <section class="camara" [class.activa]="camaraActiva()">
        <video #video playsinline muted [hidden]="!camaraActiva()"></video>
        @if (camaraActiva()) {
          <div #guia class="guia" aria-hidden="true">
            <span class="esquina ai"></span><span class="esquina ad"></span>
            <span class="esquina bi"></span><span class="esquina bd"></span>
          </div>
          <p class="estado-camara" aria-live="polite">
            @if (!reco.listo()) {
              Preparando el reconocimiento…
            } @else if (red.cargando() && !pausado()) {
              Buscando una carta… (preparando el modo preciso, solo la primera vez)
            } @else if (pausado()) {
              Carta encontrada
            } @else if (provisional(); as p) {
              ¿{{ p }}? Mantén la carta quieta…
            } @else {
              Buscando una carta…
            }
          </p>
        }
      </section>

      <div class="botones">
        @if (!camaraActiva()) {
          <button type="button" (click)="abrirCamara()">Abrir cámara</button>
        } @else {
          @if (pausado()) {
            <button type="button" (click)="seguir()">Escanear otra</button>
          } @else {
            <button type="button" (click)="usarFotograma()">Es esta, buscar ya</button>
          }
          <button type="button" class="secondary" (click)="cerrarCamara()">Cerrar cámara</button>
        }
        <label class="boton-foto secondary">
          Usar una foto
          <input
            type="file"
            accept="image/*"
            capture="environment"
            (change)="leerFoto($event)"
            hidden
          />
        </label>
      </div>

      <section class="escaneos" aria-labelledby="titulo-escaneos">
        <div class="cabecera-escaneos">
          <span class="pastilla"
            >{{ anadidas().length }} {{ anadidas().length === 1 ? 'carta' : 'cartas' }}</span
          >
          <h2 id="titulo-escaneos">Tus escaneos</h2>
          <span class="pastilla">{{ valorEscaneos() | eur: '—' }}</span>
        </div>
        @if (!anadidas().length) {
          <p class="muted vacio-escaneos">Lo que escanees saldrá aquí.</p>
        } @else {
          <ul class="lista-escaneos">
            @for (a of anadidas(); track a.clave) {
              <li>
                <a [routerLink]="['/carta', a.card.cardId]">
                  <img
                    [src]="a.card.imgUrl | thumb: 120"
                    [alt]="a.card.name"
                    width="40"
                    height="56"
                    loading="lazy"
                  />
                </a>
                <div class="datos">
                  <a [routerLink]="['/carta', a.card.cardId]" class="nombre">{{ a.card.name }}</a>
                  <span class="muted">
                    {{ a.card.cardId }} · {{ a.finish === 'foil' ? 'Foil' : 'Normal' }}
                  </span>
                </div>
                <span class="precio">{{ precio(a.card.cardId, a.finish) | eur: '—' }}</span>
                <button
                  type="button"
                  class="deshacer"
                  [attr.aria-label]="'Quitar la copia añadida de ' + a.card.name"
                  (click)="deshacer(a.clave)"
                >
                  ×
                </button>
              </li>
            }
          </ul>
        }
      </section>

      <form class="manual" (submit)="$event.preventDefault(); buscarManual()">
        <label for="codigo-manual">O escribe el código de abajo a la izquierda</label>
        <div class="fila-manual">
          <input
            id="codigo-manual"
            type="text"
            placeholder="SFD 198"
            autocomplete="off"
            autocapitalize="characters"
            [value]="manual()"
            (input)="manual.set($any($event.target).value)"
          />
          <button type="submit" class="secondary">Buscar</button>
        </div>
      </form>

      @if (error()) {
        <p class="error" role="alert">{{ error() }}</p>
      }
      @if (reco.error()) {
        <p class="error" role="alert">
          No se pudieron cargar los datos del reconocimiento: {{ reco.error() }}
        </p>
      }
      @if (aviso()) {
        <p class="muted" role="status">{{ aviso() }}</p>
      }

      @for (r of resultados(); track r.clave) {
        <section class="resultado">
          <h2>{{ r.titulo }}</h2>
          @if (r.nota) {
            <p class="muted">{{ r.nota }}</p>
          }
          @if (!r.cartas.length) {
            <p class="muted">No hay ninguna carta con ese código en el catálogo.</p>
          }
          <ul class="cartas">
            @for (c of r.cartas; track c.cardId; let primera = $first) {
              <li [class.primera]="primera">
                <a [routerLink]="['/carta', c.cardId]">
                  <img
                    [src]="c.imgUrl | thumb: 200"
                    [alt]="c.name"
                    width="100"
                    height="140"
                    loading="lazy"
                  />
                </a>
                <div class="datos">
                  <a [routerLink]="['/carta', c.cardId]" class="nombre">{{ c.name }}</a>
                  <span class="muted">
                    {{ c.cardId }} · {{ c.setName }} · {{ t.etiqueta(c.rarity) }}
                  </span>
                  @if (col.editable()) {
                    <app-qty-control [cardId]="c.cardId" />
                  }
                </div>
              </li>
            }
          </ul>
        </section>
      }

      @if (col.error()) {
        <p class="error" role="alert">No se pudo guardar: {{ col.error() }}</p>
      }
    </main>

    @if (encontrada(); as e) {
      @let c = e.cartas[e.elegida];
      <div class="fondo-modal" (click)="cerrarVentana()"></div>
      <div
        class="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-encontrada"
        (keydown.escape)="cerrarVentana()"
      >
        <button type="button" class="cerrar" aria-label="Cerrar" (click)="cerrarVentana()">
          ×
        </button>
        @if (e.nota) {
          <p class="muted nota-modal">{{ e.nota }}</p>
        }
        <img class="grande" [src]="c.imgUrl | thumb: 400" [alt]="c.name" width="200" height="279" />
        <h2 id="titulo-encontrada">{{ c.name }}</h2>
        <p class="muted">{{ c.cardId }} · {{ c.setName }} · {{ t.etiqueta(c.rarity) }}</p>
        @if (col.editable()) {
          <p class="tienes">
            Tienes {{ col.qty(c.cardId).normal }} normal · {{ col.qty(c.cardId).foil }} foil
          </p>
          <div class="anadir">
            <button #primerBoton type="button" (click)="anadir('normal')">+ Normal</button>
            <button type="button" class="foil" (click)="anadir('foil')">+ Foil</button>
          </div>
        } @else {
          <p class="muted">Cargando tu colección…</p>
        }
        <button type="button" class="secondary no-es" (click)="noEsEsta()">
          No es esta, volver a probar
        </button>
        @if (e.cartas.length > 1) {
          <p class="muted otras-titulo">¿O es una de estas?</p>
          <div class="otras">
            @for (o of e.cartas; track o.cardId; let i = $index) {
              @if (i !== e.elegida) {
                <button
                  type="button"
                  class="otra"
                  [attr.aria-label]="o.name + ' (' + o.cardId + ')'"
                  (click)="elegir(i)"
                >
                  <img [src]="o.imgUrl | thumb: 120" [alt]="" width="60" height="84" />
                  <span>{{ o.cardId }}</span>
                </button>
              }
            }
          </div>
        }
      </div>
    }
  `,
  styles: `
    .pagina {
      padding: 12px 16px 48px;
      max-width: 720px;
      margin: 0 auto;
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      gap: 16px;
    }
    h1 {
      margin: 0 0 4px;
      font-size: 1.3rem;
    }
    header p {
      margin: 0;
      font-size: 0.9rem;
    }
    .camara {
      position: relative;
      display: none;
      border-radius: var(--radio-s);
      overflow: hidden;
      background: #000;
    }
    .camara.activa {
      display: block;
    }
    video {
      display: block;
      width: 100%;
      height: min(70vh, 640px);
      object-fit: cover;
    }
    /* Recuadro con la forma de una carta, centrado. */
    .guia {
      position: absolute;
      left: 50%;
      top: 50%;
      height: 64%;
      aspect-ratio: 744 / 1039;
      transform: translate(-50%, -50%);
      border-radius: var(--radio-s);
      box-shadow: 0 0 0 9999px rgb(0 0 0 / 45%);
    }
    /* Solo las esquinas, como un visor. */
    .esquina {
      position: absolute;
      width: 13%;
      aspect-ratio: 1;
      border: 4px solid #fff;
    }
    .esquina.ai {
      top: -2px;
      left: -2px;
      border-right: 0;
      border-bottom: 0;
      border-top-left-radius: 4px;
    }
    .esquina.ad {
      top: -2px;
      right: -2px;
      border-left: 0;
      border-bottom: 0;
      border-top-right-radius: 4px;
    }
    .esquina.bi {
      bottom: -2px;
      left: -2px;
      border-right: 0;
      border-top: 0;
      border-bottom-left-radius: 4px;
    }
    .esquina.bd {
      bottom: -2px;
      right: -2px;
      border-left: 0;
      border-top: 0;
      border-bottom-right-radius: 4px;
    }
    .escaneos {
      padding: 12px;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radio-s);
    }
    .cabecera-escaneos {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }
    .cabecera-escaneos h2 {
      margin: 0;
      font-size: 1rem;
    }
    .pastilla {
      padding: 6px 12px;
      border-radius: var(--radio-s);
      background: var(--surface-2);
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }
    .vacio-escaneos {
      margin: 16px 0 8px;
      text-align: center;
    }
    .lista-escaneos {
      list-style: none;
      margin: 12px 0 0;
      padding: 0;
      display: grid;
      gap: 8px;
    }
    .lista-escaneos li {
      display: grid;
      grid-template-columns: 40px minmax(0, 1fr) auto auto;
      gap: 10px;
      align-items: center;
    }
    .lista-escaneos img {
      display: block;
      width: 40px;
      height: auto;
      border-radius: var(--radio-s);
    }
    .lista-escaneos .nombre {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .precio {
      font-variant-numeric: tabular-nums;
      font-size: 0.9rem;
    }
    .deshacer {
      width: 32px;
      height: 32px;
      padding: 0;
      background: transparent;
      color: var(--muted);
      font-size: 1.2rem;
    }
    .estado-camara {
      position: absolute;
      left: 0;
      right: 0;
      bottom: 0;
      margin: 0;
      padding: 8px;
      text-align: center;
      font-size: 0.85rem;
      background: rgb(0 0 0 / 55%);
    }
    .botones {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .boton-foto {
      display: inline-flex;
      align-items: center;
      padding: 8px 16px;
      border-radius: var(--radio-s);
      border: 1px solid var(--border);
      cursor: pointer;
    }
    .manual {
      display: grid;
      gap: 6px;
    }
    .manual label {
      font-size: 0.9rem;
      color: var(--muted);
    }
    .fila-manual {
      display: flex;
      gap: 8px;
    }
    .fila-manual input {
      flex: 1;
      min-width: 0;
    }
    .resultado {
      padding: 12px;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radio-s);
    }
    .resultado h2 {
      margin: 0 0 8px;
      font-size: 1rem;
    }
    .resultado > p {
      margin: 0 0 8px;
      font-size: 0.85rem;
    }
    .cartas {
      list-style: none;
      margin: 0;
      padding: 0;
      display: grid;
      gap: 12px;
    }
    .cartas li {
      display: grid;
      grid-template-columns: 100px minmax(0, 1fr);
      gap: 12px;
      align-items: start;
      padding: 6px;
      border-radius: var(--radio-s);
    }
    .cartas li.primera {
      outline: 2px solid var(--accent);
    }
    .cartas img {
      display: block;
      width: 100px;
      height: auto;
      border-radius: var(--radio-s);
    }
    .datos {
      display: grid;
      gap: 6px;
      min-width: 0;
    }
    .nombre {
      font-weight: 600;
      color: var(--text);
      text-decoration: none;
    }
    .datos .muted {
      font-size: 0.8rem;
    }
    .fondo-modal {
      position: fixed;
      inset: 0;
      z-index: 30;
      background: rgb(0 0 0 / 60%);
    }
    .modal {
      position: fixed;
      z-index: 31;
      left: 50%;
      top: 50%;
      transform: translate(-50%, -50%);
      width: min(380px, calc(100vw - 24px));
      max-height: calc(100dvh - 24px);
      overflow-y: auto;
      display: grid;
      justify-items: center;
      gap: 8px;
      padding: 20px 16px 16px;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radio-s);
      text-align: center;
    }
    .modal h2 {
      margin: 0;
      font-size: 1.15rem;
    }
    .modal p {
      margin: 0;
    }
    .cerrar {
      position: absolute;
      top: 6px;
      right: 6px;
      width: 36px;
      height: 36px;
      padding: 0;
      font-size: 1.4rem;
      line-height: 1;
      background: transparent;
      color: var(--muted);
    }
    .nota-modal {
      font-size: 0.85rem;
      padding: 0 24px;
    }
    .grande {
      width: min(200px, 50vw);
      height: auto;
      border-radius: var(--radio-s);
    }
    .tienes {
      font-size: 0.9rem;
    }
    .anadir {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
      width: 100%;
    }
    .anadir button {
      padding: 12px;
      font-size: 1rem;
    }
    .anadir .foil {
      background: linear-gradient(135deg, #c9a13b, #8fd3e8, #c58fe0);
      color: #15120a;
    }
    .no-es {
      width: 100%;
    }
    .otras-titulo {
      font-size: 0.85rem;
      margin-top: 4px !important;
    }
    .otras {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: 8px;
    }
    .otra {
      display: grid;
      justify-items: center;
      gap: 2px;
      padding: 4px;
      background: transparent;
      border: 1px solid var(--border);
      border-radius: var(--radio-s);
      color: var(--muted);
      font-size: 0.7rem;
    }
    .otra img {
      width: 60px;
      height: auto;
      border-radius: var(--radio-s);
    }
  `,
})
export class ScannerPage implements OnDestroy {
  protected readonly reco = inject(ReconocimientoService);
  protected readonly col = inject(CollectionService);
  protected readonly t = inject(TraduccionService);
  private readonly catalog = inject(CatalogService);
  private readonly valuation = inject(ValuationService);

  private readonly video = viewChild.required<ElementRef<HTMLVideoElement>>('video');
  private readonly guia = viewChild<ElementRef<HTMLDivElement>>('guia');

  protected readonly camaraActiva = signal(false);
  /** Tras encontrar una carta, la cámara deja de buscar hasta "Escanear otra". */
  protected readonly pausado = signal(false);
  /** Nombre de la carta que parece, mientras aún no es segura. */
  protected readonly provisional = signal<string | null>(null);
  protected readonly manual = signal('');
  protected readonly resultados = signal<Resultado[]>([]);
  protected readonly error = signal<string | null>(null);
  protected readonly aviso = signal<string | null>(null);
  protected readonly encontrada = signal<Encontrada | null>(null);
  protected readonly anadidas = signal<{ clave: number; card: CatalogCard; finish: Finish }[]>([]);
  private readonly primerBoton = viewChild<ElementRef<HTMLButtonElement>>('primerBoton');

  /** Cartas que el usuario ha dicho que no son; se olvidan al pasar a otra carta. */
  private descartadas = new Set<string>();
  /**
   * La última carta añadida desde la cámara: mientras siga delante, no se vuelve a
   * proponer (si no, la ventana saltaría otra vez nada más cerrarla).
   */
  private recienAnadida: string | null = null;
  /**
   * Hasta cuándo dura ese bloqueo. Caduca solo: si no, al volver a escanear la misma
   * carta (otra copia) la cámara se quedaba buscando para siempre.
   */
  private recienAnadidaHasta = 0;
  /** La última foto, para "no es esta" (se vuelve a buscar en ella sin la descartada). */
  private ultimaFoto: { px: Pixeles; encuadres: Encuadre[] } | null = null;
  private contador = 0;

  private stream: MediaStream | null = null;
  private temporizador: ReturnType<typeof setTimeout> | null = null;
  /** Decide cuándo hay carta a partir de varias lecturas seguidas. */
  private readonly votacion = new Votacion();
  protected readonly red = inject(RedService);
  /** Con la red cargada, decide esta votación; mientras tanto, la de la huella. */
  private readonly votacionRed = new VotacionRed();
  /** Para medir el margen contra otra carta y no contra una versión gemela. */
  private readonly nombresBase = computed(
    () =>
      new Map(this.catalog.cards().map((c) => [c.cardId, c.name.replace(/\s*\([^)]*\)\s*$/, '')])),
  );
  private readonly nombreBase = (id: string) => this.nombresBase().get(id) ?? id;
  private procesando = false;
  private readonly lienzo = document.createElement('canvas');

  private readonly setsValidos = computed(() => new Set(this.catalog.sets().map((s) => s.id)));

  constructor() {
    void this.col.loadMine();
    void this.reco.load();
    void this.red.load();
    // Al abrir la ventana, el foco va a "+ Normal": se puede añadir con Intro.
    effect(() => {
      if (this.encontrada()) this.primerBoton()?.nativeElement.focus();
    });
  }

  ngOnDestroy(): void {
    this.cerrarCamara();
  }

  protected async abrirCamara(): Promise<void> {
    this.error.set(null);
    this.aviso.set(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      this.error.set(
        'Este navegador no deja usar la cámara desde la web. Prueba con "Usar una foto".',
      );
      return;
    }
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      const v = this.video().nativeElement;
      v.srcObject = this.stream;
      await v.play();
      this.camaraActiva.set(true);
      this.seguir();
    } catch (e) {
      this.cerrarCamara();
      const nombre = e instanceof DOMException ? e.name : '';
      this.error.set(
        nombre === 'NotAllowedError'
          ? 'No hay permiso para usar la cámara. Actívalo en los ajustes del navegador o usa una foto.'
          : nombre === 'NotFoundError'
            ? 'No se ha encontrado ninguna cámara. Usa una foto o escribe el código.'
            : `No se pudo abrir la cámara: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  protected cerrarCamara(): void {
    this.recienAnadida = null;
    this.descartadas = new Set();
    if (this.temporizador) clearTimeout(this.temporizador);
    this.temporizador = null;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.camaraActiva.set(false);
    this.provisional.set(null);
  }

  protected seguir(): void {
    this.pausado.set(false);
    this.votacion.reiniciar();
    this.votacionRed.reiniciar();
    this.programar(0);
  }

  private programar(ms: number): void {
    if (this.temporizador) clearTimeout(this.temporizador);
    this.temporizador = setTimeout(() => void this.leerFotograma(), ms);
  }

  /** Dónde buscar la carta en la captura: donde se ve su borde y, por si acaso, en la guía. */
  private encuadresCamara(px: Pixeles, guia: Encuadre): Encuadre[] {
    return [...localizarCarta(px, guia, 6), ...encuadresAlrededor(guia, [0.6, 0.8, 1])];
  }

  /**
   * Reconoce la carta del recuadro y vota entre lecturas seguidas (ver `Votacion`): se
   * para sola cuando varias coinciden, no con una lectura suelta.
   */
  private async leerFotograma(): Promise<void> {
    if (!this.camaraActiva() || this.pausado()) return;
    // Si aún se está procesando el fotograma anterior, se reintenta luego (antes se
    // perdía la vuelta y el bucle se quedaba parado, "buscando" sin hacer nada).
    if (this.procesando) return this.programar(PAUSA_MS);
    if (this.recienAnadida && Date.now() > this.recienAnadidaHasta) this.recienAnadida = null;
    const captura = this.reco.listo() ? this.recuadro() : null;
    if (!captura) return this.programar(PAUSA_MS);
    this.procesando = true;
    try {
      const encuadres = this.encuadresCamara(captura.px, captura.guia);
      const r = this.reco.reconocer(captura.px, encuadres, this.descartadas);
      let ganadora: string | null;
      let candidatas = r.candidatas.map((c) => c.cardId);
      let provisional: string | null;
      if (this.red.listo()) {
        // La huella localiza la carta; la red compara lo que hay en los dos mejores sitios.
        const zonas = [r.encuadre, encuadres[0]].filter((z): z is Encuadre => !!z);
        const puntos = await this.red.puntuar(captura.px, zonas);
        if (!this.camaraActiva() || this.pausado()) return;
        const c = combinarRedYHuella(puntos ?? new Map(), r, this.nombreBase, this.descartadas);
        candidatas = c.candidatas.map((x) => x.cardId);
        ganadora = this.votacionRed.anadir(c);
        provisional = c.margen >= 0.05 ? (candidatas[0] ?? null) : null;
      } else {
        ganadora = this.votacion.anadir(r);
        provisional = this.votacion.provisional();
      }
      if (provisional && provisional !== this.recienAnadida) this.recienAnadida = null;
      if (ganadora && ganadora === this.recienAnadida) {
        // Sigue delante la que se acaba de añadir: se espera a que cambien de carta.
        this.votacion.reiniciar();
        this.votacionRed.reiniciar();
        this.provisional.set(null);
      } else if (ganadora) {
        this.mostrar([ganadora, ...candidatas.filter((id) => id !== ganadora)], null, 'camara');
        this.pausado.set(true);
        this.provisional.set(null);
        navigator.vibrate?.(60);
        return;
      } else {
        this.provisional.set(
          provisional && provisional !== this.recienAnadida
            ? (this.catalog.card(provisional)?.name ?? null)
            : null,
        );
      }
    } finally {
      this.procesando = false;
    }
    this.programar(PAUSA_MS);
  }

  /** Por si no se para sola: usa lo que haya ahora en el recuadro. */
  protected async usarFotograma(): Promise<void> {
    const captura = this.reco.listo() ? this.recuadro() : null;
    if (!captura) return;
    this.pausado.set(true);
    this.provisional.set(null);
    const encuadres = this.encuadresCamara(captura.px, captura.guia);
    const { ids, clara } = await this.reconocerCompleto(captura.px, encuadres);
    this.mostrar(ids, clara ? null : 'No está claro: si no es esta, mira las de abajo.', 'camara');
  }

  /**
   * Huella y, si está cargada, red. Devuelve las candidatas y si la primera es clara
   * (margen suficiente con la red; "segura" con la huella sola).
   */
  private async reconocerCompleto(
    px: Pixeles,
    encuadres: Encuadre[],
  ): Promise<{ ids: string[]; clara: boolean }> {
    const r = this.reco.reconocer(px, encuadres, this.descartadas);
    if (!this.red.listo()) return { ids: r.candidatas.map((c) => c.cardId), clara: r.segura };
    const zonas = [r.encuadre, encuadres[0]].filter((z): z is Encuadre => !!z);
    const puntos = await this.red.puntuar(px, zonas);
    const c = combinarRedYHuella(puntos ?? new Map(), r, this.nombreBase, this.descartadas);
    return { ids: c.candidatas.map((x) => x.cardId), clara: c.margen >= 0.05 };
  }

  /**
   * Píxeles del recuadro guía en el fotograma actual, con un margen alrededor (la carta
   * no siempre cabe justa dentro), y dónde queda la guía dentro de esos píxeles. El
   * recuadro se dibuja sobre el vídeo tal como se ve (con object-fit: cover, que
   * recorta), así que se traduce a coordenadas del fotograma real.
   */
  private recuadro(): { px: Pixeles; guia: Encuadre } | null {
    const v = this.video().nativeElement;
    const g = this.guia()?.nativeElement;
    if (!v.videoWidth || !g) return null;
    const caja = v.getBoundingClientRect();
    const marco = g.getBoundingClientRect();
    const escala = Math.max(caja.width / v.videoWidth, caja.height / v.videoHeight);
    const offX = (v.videoWidth - caja.width / escala) / 2;
    const offY = (v.videoHeight - caja.height / escala) / 2;
    const gw = marco.width / escala;
    const gh = marco.height / escala;
    const gx = offX + (marco.left - caja.left) / escala;
    const gy = offY + (marco.top - caja.top) / escala;
    // Captura con un MARGEN de la guía por cada lado, sin salirse del fotograma.
    const sx = Math.max(0, gx - gw * MARGEN);
    const sy = Math.max(0, gy - gh * MARGEN);
    const sw = Math.min(v.videoWidth, gx + gw * (1 + MARGEN)) - sx;
    const sh = Math.min(v.videoHeight, gy + gh * (1 + MARGEN)) - sy;
    const k = ANCHO_MUESTRA / gw;
    const ancho = Math.round(sw * k);
    const alto = Math.round(sh * k);
    this.lienzo.width = ancho;
    this.lienzo.height = alto;
    const ctx = this.lienzo.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(v, sx, sy, sw, sh, 0, 0, ancho, alto);
    return {
      px: ctx.getImageData(0, 0, ancho, alto),
      guia: { x: (gx - sx) * k, y: (gy - sy) * k, w: gw * k, h: gh * k },
    };
  }

  protected async leerFoto(evento: Event): Promise<void> {
    const input = evento.target as HTMLInputElement;
    const archivo = input.files?.[0];
    input.value = '';
    if (!archivo) return;
    this.error.set(null);
    this.aviso.set('Buscando la carta en la foto…');
    try {
      await this.reco.load();
      const bitmap = await createImageBitmap(archivo);
      // Reducida: para una huella de 32×32 no hace falta más, y así va rápido.
      const escala = Math.min(1, 900 / Math.max(bitmap.width, bitmap.height));
      const W = Math.round(bitmap.width * escala);
      const H = Math.round(bitmap.height * escala);
      this.lienzo.width = W;
      this.lienzo.height = H;
      const ctx = this.lienzo.getContext('2d', { willReadFrequently: true })!;
      ctx.drawImage(bitmap, 0, 0, W, H);
      bitmap.close();
      this.descartadas = new Set();
      const px = ctx.getImageData(0, 0, W, H);
      this.ultimaFoto = { px, encuadres: encuadresDeFoto(px) };
      await this.buscarEnFoto();
    } catch (e) {
      this.aviso.set(null);
      this.error.set(`No se pudo leer la foto: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  protected buscarManual(): void {
    this.error.set(null);
    this.aviso.set(null);
    // A mano se acepta "SFD198", "sfd-198" o "SFD 198/221".
    const texto = this.manual().replace(/^([A-Za-z]{2,3})(\d)/, '$1 $2');
    const codigos = parseCodigos(texto, this.setsValidos());
    if (!codigos.length) {
      this.aviso.set('Eso no parece un código de carta. Escríbelo como SFD 198.');
      return;
    }
    const cards = this.catalog.cards();
    for (const codigo of [...codigos].reverse()) {
      const cartas = cartasDelCodigo(cards, codigo);
      this.anadirResultado({
        clave: `codigo-${codigo.set}-${codigo.num}`,
        titulo: `${codigo.set} · ${codigo.num}`,
        nota:
          cartas.length > 1
            ? `Hay ${cartas.length} versiones con este número: suma la que tengas.`
            : null,
        cartas,
      });
    }
    this.manual.set('');
  }

  private async buscarEnFoto(): Promise<void> {
    if (!this.ultimaFoto) return;
    const { px, encuadres } = this.ultimaFoto;
    if (this.red.cargando()) this.aviso.set('Preparando el reconocimiento…');
    await this.red.load();
    const { ids, clara } = await this.reconocerCompleto(px, encuadres);
    this.mostrar(
      ids,
      clara
        ? null
        : 'No está claro (quizá la carta no llena la foto): si no es esta, mira las de abajo.',
      'foto',
    );
  }

  /** Abre la ventana con las candidatas del reconocimiento. */
  private mostrar(cardIds: string[], nota: string | null, origen: Encontrada['origen']): void {
    const cartas = cardIds.map((id) => this.catalog.card(id)).filter((c): c is CatalogCard => !!c);
    if (!cartas.length) {
      this.aviso.set('No se ha reconocido ninguna carta.');
      return;
    }
    this.aviso.set(null);
    this.encontrada.set({ cartas, elegida: 0, nota, origen });
  }

  /** Tendencia de Cardmarket del acabado añadido; null si no hay precio. */
  protected precio(cardId: string, finish: Finish): number | null {
    return this.valuation.pricing(cardId)[finish];
  }

  protected readonly valorEscaneos = computed(() => {
    let total = 0;
    let alguno = false;
    for (const a of this.anadidas()) {
      const p = this.precio(a.card.cardId, a.finish);
      if (p === null) continue;
      total += p;
      alguno = true;
    }
    return alguno || !this.anadidas().length ? total : null;
  });

  /** Quita de la colección la copia que se añadió por error y la borra de la lista. */
  protected deshacer(clave: number): void {
    const a = this.anadidas().find((x) => x.clave === clave);
    if (!a) return;
    this.col.adjust(a.card.cardId, a.finish, -1);
    this.anadidas.set(this.anadidas().filter((x) => x.clave !== clave));
  }

  protected elegir(i: number): void {
    const e = this.encontrada();
    if (e) this.encontrada.set({ ...e, elegida: i });
  }

  /** Suma una copia de la carta enseñada y, con la cámara, sigue buscando la siguiente. */
  protected anadir(finish: Finish): void {
    const e = this.encontrada();
    if (!e) return;
    const card = e.cartas[e.elegida];
    this.col.adjust(card.cardId, finish, 1);
    this.anadidas.set([{ clave: ++this.contador, card, finish }, ...this.anadidas()].slice(0, 50));
    this.aviso.set(`Añadida ${card.name} (${finish === 'foil' ? 'foil' : 'normal'}).`);
    this.encontrada.set(null);
    this.descartadas = new Set();
    if (e.origen === 'camara' && this.camaraActiva()) {
      this.recienAnadida = card.cardId;
      this.recienAnadidaHasta = Date.now() + BLOQUEO_MS;
      this.seguir();
    }
  }

  /** La enseñada no es: se descarta y se vuelve a buscar sin ella. */
  protected noEsEsta(): void {
    const e = this.encontrada();
    if (!e) return;
    this.descartadas.add(e.cartas[e.elegida].cardId);
    this.encontrada.set(null);
    if (e.origen === 'foto') void this.buscarEnFoto();
    else if (this.camaraActiva()) this.seguir();
  }

  /**
   * Cierra sin añadir y la cámara sigue buscando. La carta que se acaba de enseñar no
   * vuelve a saltar mientras siga delante (igual que tras añadirla).
   */
  protected cerrarVentana(): void {
    const e = this.encontrada();
    this.encontrada.set(null);
    this.descartadas = new Set();
    if (e?.origen === 'camara' && this.camaraActiva()) {
      this.recienAnadida = e.cartas[e.elegida]?.cardId ?? null;
      this.recienAnadidaHasta = Date.now() + BLOQUEO_MS;
      this.seguir();
    }
  }

  private anadirResultado(r: Resultado): void {
    this.resultados.set([r, ...this.resultados().filter((o) => o.clave !== r.clave)].slice(0, 8));
  }
}

/**
 * En una foto no se sabe dónde está la carta: se prueban recortes con forma de carta,
 * centrados y de varios tamaños, con pequeños desplazamientos, y gana el que más se
 * parezca a alguna.
 */
function encuadresDeFoto(px: Pixeles): Encuadre[] {
  const W = px.width;
  const H = px.height;
  // La carta más grande que cabe centrada, como referencia de tamaño para localizarla.
  let gh = H;
  let gw = gh * PROPORCION_CARTA;
  if (gw > W) {
    gw = W;
    gh = gw / PROPORCION_CARTA;
  }
  const salida = localizarCarta(px, { x: (W - gw) / 2, y: (H - gh) / 2, w: gw, h: gh }, 6, 0.25, 1);
  for (const f of [1, 0.85, 0.7, 0.55]) {
    let h = H * f;
    let w = h * PROPORCION_CARTA;
    if (w > W * f) {
      w = W * f;
      h = w / PROPORCION_CARTA;
    }
    salida.push(...encuadresAlrededor({ x: (W - w) / 2, y: (H - h) / 2, w, h }, [0.95, 1, 1.05]));
  }
  return salida;
}
