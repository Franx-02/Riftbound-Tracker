import {
  Component,
  ElementRef,
  OnDestroy,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { CatalogCard, CatalogService } from '../core/catalog.service';
import { CollectionService } from '../core/collection.service';
import { PROPORCION_CARTA, Pixeles } from '../core/huella';
import {
  Encuadre,
  ReconocimientoService,
  encuadresAlrededor,
} from '../core/reconocimiento.service';
import { cartasDelCodigo, parseCodigos } from '../core/scanner';
import { TraduccionService } from '../core/traduccion.service';
import { ThumbPipe } from '../ui/pipes';
import { QtyControlComponent } from '../ui/qty-control.component';

/** Pausa entre lecturas de la cámara. Reconocer un fotograma tarda unos 20-60 ms. */
const PAUSA_MS = 350;
/** Ancho al que se reduce la carta antes de calcular su huella: de sobra para 32×32. */
const ANCHO_MUESTRA = 240;
/** Margen alrededor de la guía que también se captura, en fracción de su tamaño. */
const MARGEN = 0.2;

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
  imports: [RouterLink, ThumbPipe, QtyControlComponent],
  template: `
    <main class="pagina">
      <header>
        <h1>Escanear cartas</h1>
        <p class="muted">
          Encaja la carta en el recuadro, de frente y entera. Funciona mejor con buena luz, sobre un
          fondo liso y sin reflejos.
        </p>
      </header>

      <section class="camara" [class.activa]="camaraActiva()">
        <video #video playsinline muted [hidden]="!camaraActiva()"></video>
        @if (camaraActiva()) {
          <div #guia class="guia" aria-hidden="true"></div>
          <p class="estado-camara" aria-live="polite">
            @if (!reco.listo()) {
              Preparando el reconocimiento…
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
      border-radius: 12px;
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
      top: 5%;
      height: 82%;
      aspect-ratio: 744 / 1039;
      transform: translateX(-50%);
      border: 2px solid var(--accent);
      border-radius: 14px;
      box-shadow: 0 0 0 9999px rgb(0 0 0 / 45%);
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
      border-radius: 8px;
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
      border-radius: 12px;
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
      border-radius: 10px;
    }
    .cartas li.primera {
      outline: 2px solid var(--accent);
    }
    .cartas img {
      display: block;
      width: 100px;
      height: auto;
      border-radius: 6px;
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
  `,
})
export class ScannerPage implements OnDestroy {
  protected readonly reco = inject(ReconocimientoService);
  protected readonly col = inject(CollectionService);
  protected readonly t = inject(TraduccionService);
  private readonly catalog = inject(CatalogService);

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

  private stream: MediaStream | null = null;
  private temporizador: ReturnType<typeof setTimeout> | null = null;
  /** La carta segura del fotograma anterior: hace falta la misma dos veces seguidas. */
  private anterior: string | null = null;
  private readonly lienzo = document.createElement('canvas');

  private readonly setsValidos = computed(() => new Set(this.catalog.sets().map((s) => s.id)));

  constructor() {
    void this.col.loadMine();
    void this.reco.load();
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
    if (this.temporizador) clearTimeout(this.temporizador);
    this.temporizador = null;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.camaraActiva.set(false);
    this.provisional.set(null);
  }

  protected seguir(): void {
    this.pausado.set(false);
    this.aviso.set(null);
    this.anterior = null;
    this.programar(0);
  }

  private programar(ms: number): void {
    if (this.temporizador) clearTimeout(this.temporizador);
    this.temporizador = setTimeout(() => this.leerFotograma(), ms);
  }

  /**
   * Reconoce la carta del recuadro. Se para sola cuando el resultado es seguro dos
   * fotogramas seguidos (con uno solo saltaría con la carta aún moviéndose).
   */
  private leerFotograma(): void {
    if (!this.camaraActiva() || this.pausado()) return;
    const captura = this.reco.listo() ? this.recuadro() : null;
    if (captura) {
      const r = this.reco.reconocer(captura.px, encuadresAlrededor(captura.guia));
      const primera = r.candidatas[0]?.cardId ?? null;
      if (r.segura && primera === this.anterior) {
        this.mostrar(
          r.candidatas.map((c) => c.cardId),
          null,
        );
        this.pausado.set(true);
        this.provisional.set(null);
        navigator.vibrate?.(60);
        return;
      }
      this.anterior = r.segura ? primera : null;
      this.provisional.set(r.segura && primera ? (this.catalog.card(primera)?.name ?? null) : null);
    }
    this.programar(PAUSA_MS);
  }

  /** Por si no se para sola: usa lo que haya ahora en el recuadro. */
  protected usarFotograma(): void {
    const captura = this.reco.listo() ? this.recuadro() : null;
    if (!captura) return;
    const r = this.reco.reconocer(captura.px, encuadresAlrededor(captura.guia));
    this.mostrar(
      r.candidatas.map((c) => c.cardId),
      r.segura ? null : 'No está claro: la buena puede ser cualquiera de estas.',
    );
    this.pausado.set(true);
    this.provisional.set(null);
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
      const r = this.reco.reconocer(ctx.getImageData(0, 0, W, H), encuadresDeFoto(W, H));
      this.aviso.set(null);
      this.mostrar(
        r.candidatas.map((c) => c.cardId),
        r.segura
          ? null
          : 'No está claro: puede que la carta no llene la foto. La buena puede ser cualquiera de estas.',
      );
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

  /** Las candidatas del reconocimiento, arriba de los resultados. */
  private mostrar(cardIds: string[], nota: string | null): void {
    const cartas = cardIds.map((id) => this.catalog.card(id)).filter((c): c is CatalogCard => !!c);
    if (!cartas.length) {
      this.aviso.set('No se ha reconocido ninguna carta.');
      return;
    }
    this.anadirResultado({
      clave: `foto-${Date.now()}`,
      titulo: `Parece ${cartas[0].name}`,
      nota: nota ?? 'Si no es la marcada, elige entre las siguientes.',
      cartas,
    });
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
function encuadresDeFoto(W: number, H: number): Encuadre[] {
  const salida: Encuadre[] = [];
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
