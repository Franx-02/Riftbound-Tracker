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
import { OcrService, prepararParaOcr } from '../core/ocr.service';
import { CodigoLeido, cartasDelCodigo, parseCodigos } from '../core/scanner';
import { TraduccionService } from '../core/traduccion.service';
import { ThumbPipe } from '../ui/pipes';
import { QtyControlComponent } from '../ui/qty-control.component';

/** Franja de la guía, en fracción del vídeo visible: ahí debe quedar el código. */
const GUIA = { x: 0.1, y: 0.42, w: 0.8, h: 0.16 };
/** Pausa entre lecturas automáticas. El OCR de una franja tarda unos 300-800 ms. */
const PAUSA_MS = 700;
const SIN_CODIGO_FOTO =
  'No se ha encontrado ningún código en la foto. Prueba con más luz, más cerca, o escríbelo a mano.';

interface Resultado {
  codigo: CodigoLeido;
  cartas: CatalogCard[];
}

/**
 * Escáner: lee el código impreso abajo a la izquierda de la carta (`SFD • 198/221`)
 * con la cámara o una foto, y deja sumar la carta a tu colección. Si no lo lee, se
 * puede escribir el código a mano: el buscador cubre lo mismo.
 */
@Component({
  selector: 'app-scanner-page',
  imports: [RouterLink, ThumbPipe, QtyControlComponent],
  template: `
    <main class="pagina">
      <header>
        <h1>Escanear cartas</h1>
        <p class="muted">
          Enfoca el código de abajo a la izquierda de la carta (por ejemplo
          <strong>SFD • 198/221</strong>) dentro del recuadro. Funciona mejor con buena luz y sin
          reflejos; con las foils puede costar.
        </p>
      </header>

      <section class="camara" [class.activa]="camaraActiva()">
        <video #video playsinline muted [hidden]="!camaraActiva()"></video>
        @if (camaraActiva()) {
          <div class="guia" aria-hidden="true"></div>
          <p class="estado-camara">
            {{
              ocr.cargando()
                ? 'Preparando el lector (solo la primera vez)…'
                : leyendo()
                  ? 'Leyendo…'
                  : pausado()
                    ? 'Carta encontrada'
                    : 'Buscando código…'
            }}
          </p>
        }
      </section>

      <div class="botones">
        @if (!camaraActiva()) {
          <button type="button" (click)="abrirCamara()">Abrir cámara</button>
        } @else {
          @if (pausado()) {
            <button type="button" (click)="seguir()">Escanear otra</button>
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
        <label for="codigo-manual">O escribe el código</label>
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
      @if (ocr.error()) {
        <p class="error" role="alert">No se pudo cargar el lector: {{ ocr.error() }}</p>
      }
      @if (aviso()) {
        <p class="muted" role="status">{{ aviso() }}</p>
      }

      @for (r of resultados(); track r.codigo.set + r.codigo.num) {
        <section class="resultado">
          <h2>{{ r.codigo.set }} · {{ r.codigo.num }}</h2>
          @if (!r.cartas.length) {
            <p class="muted">No hay ninguna carta con ese código en el catálogo.</p>
          }
          @if (r.cartas.length > 1) {
            <p class="muted">
              Hay {{ r.cartas.length }} versiones con este número: suma la que tengas.
            </p>
          }
          <ul class="cartas">
            @for (c of r.cartas; track c.cardId) {
              <li>
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
                  <span class="muted">{{ c.cardId }} · {{ t.etiqueta(c.rarity) }}</span>
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
      max-height: 60vh;
      object-fit: cover;
    }
    .guia {
      position: absolute;
      left: 10%;
      top: 42%;
      width: 80%;
      height: 16%;
      border: 2px solid var(--accent);
      border-radius: 8px;
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
  protected readonly ocr = inject(OcrService);
  protected readonly col = inject(CollectionService);
  protected readonly t = inject(TraduccionService);
  private readonly catalog = inject(CatalogService);

  private readonly video = viewChild.required<ElementRef<HTMLVideoElement>>('video');

  protected readonly camaraActiva = signal(false);
  protected readonly leyendo = signal(false);
  /** Tras encontrar una carta, la lectura automática se para hasta "Escanear otra". */
  protected readonly pausado = signal(false);
  protected readonly manual = signal('');
  protected readonly resultados = signal<Resultado[]>([]);
  protected readonly error = signal<string | null>(null);
  protected readonly aviso = signal<string | null>(null);

  private stream: MediaStream | null = null;
  private temporizador: ReturnType<typeof setTimeout> | null = null;

  private readonly setsValidos = computed(() => new Set(this.catalog.sets().map((s) => s.id)));

  constructor() {
    void this.col.loadMine();
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
    this.ocr.precargar();
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      const v = this.video().nativeElement;
      v.srcObject = this.stream;
      await v.play();
      this.camaraActiva.set(true);
      this.pausado.set(false);
      this.programar(0);
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
    this.leyendo.set(false);
  }

  protected seguir(): void {
    this.pausado.set(false);
    this.aviso.set(null);
    this.programar(0);
  }

  private programar(ms: number): void {
    if (this.temporizador) clearTimeout(this.temporizador);
    this.temporizador = setTimeout(() => void this.leerFotograma(), ms);
  }

  /** Lee la franja de la guía del fotograma actual. Se repite sola hasta encontrar algo. */
  private async leerFotograma(): Promise<void> {
    if (!this.camaraActiva() || this.pausado()) return;
    const v = this.video().nativeElement;
    if (!v.videoWidth) return this.programar(PAUSA_MS);
    this.leyendo.set(true);
    try {
      const { sx, sy, sw, sh } = this.franjaVisible(v);
      const recorte = prepararParaOcr(v, sx, sy, sw, sh);
      const texto = await this.ocr.leer(recorte, 'linea');
      if (this.procesar(texto, null)) {
        this.pausado.set(true);
        navigator.vibrate?.(60);
      }
    } catch {
      // El error de carga ya lo enseña OcrService; un fotograma malo se ignora.
    } finally {
      this.leyendo.set(false);
    }
    if (this.camaraActiva() && !this.pausado() && !this.ocr.error()) this.programar(PAUSA_MS);
  }

  /**
   * La guía se dibuja sobre el vídeo tal como se ve (con object-fit: cover, que recorta
   * los lados), así que hay que traducirla a píxeles del fotograma real.
   */
  private franjaVisible(v: HTMLVideoElement) {
    const caja = v.getBoundingClientRect();
    const escala = Math.max(caja.width / v.videoWidth, caja.height / v.videoHeight);
    const visibleW = caja.width / escala;
    const visibleH = caja.height / escala;
    const offX = (v.videoWidth - visibleW) / 2;
    const offY = (v.videoHeight - visibleH) / 2;
    return {
      sx: offX + GUIA.x * visibleW,
      sy: offY + GUIA.y * visibleH,
      sw: GUIA.w * visibleW,
      sh: GUIA.h * visibleH,
    };
  }

  protected async leerFoto(evento: Event): Promise<void> {
    const input = evento.target as HTMLInputElement;
    const archivo = input.files?.[0];
    input.value = '';
    if (!archivo) return;
    this.error.set(null);
    this.aviso.set('Leyendo la foto…');
    try {
      const bitmap = await createImageBitmap(archivo);
      const { width: w, height: h } = bitmap;
      // Primero la esquina de abajo a la izquierda y la franja de abajo, que es donde está
      // el código si la carta llena la foto: leen mejor que la foto entera, porque en las
      // cartas a sangre el umbral de toda la imagen se come el código. Si no, la foto
      // entera en texto disperso, por si la carta sale pequeña. Todo en texto disperso.
      // [x, y, ancho, alto, altura a la que se escala]. La foto entera se reduce si es
      // enorme (Tesseract tarda mucho más y no lee mejor); los recortes se amplían.
      // Con 40 imágenes oficiales acertó 35 (las que fallan son de baja resolución).
      const intentos: [number, number, number, number, number][] = [
        [0, h * 0.9, w * 0.45, h * 0.1, 120],
        [0, h * 0.8, w, h * 0.2, 240],
        [0, 0, w, h, h * Math.min(1, 2400 / Math.max(w, h))],
      ];
      // Un código con su "/total" es casi seguro; sin total puede ser ruido de la ilustración
      // (un "SFD 7" suelto), así que solo se acepta si ningún intento da algo mejor.
      let dudoso: string | null = null;
      let seguro: string | null = null;
      for (const [sx, sy, sw, sh, alto] of intentos) {
        const imagen = prepararParaOcr(bitmap, sx, sy, sw, sh, alto);
        const texto = await this.ocr.leer(imagen, 'disperso');
        const codigos = parseCodigos(texto, this.setsValidos());
        if (codigos.some((c) => c.total !== null)) {
          seguro = texto;
          break;
        }
        if (codigos.length) dudoso ??= texto;
      }
      bitmap.close();
      if (this.procesar(seguro ?? dudoso ?? '', SIN_CODIGO_FOTO)) this.aviso.set(null);
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
    if (!this.procesar(texto, 'Eso no parece un código de carta. Escríbelo como SFD 198.')) return;
    this.manual.set('');
  }

  /**
   * Añade lo leído arriba de los resultados. Devuelve si encontró algún código.
   * `avisar` es el mensaje que se enseña si no encuentra nada; la cámara no avisa,
   * porque reintenta sola.
   */
  private procesar(texto: string, avisar: string | null): boolean {
    const codigos = parseCodigos(texto, this.setsValidos());
    if (!codigos.length) {
      if (avisar) this.aviso.set(avisar);
      return false;
    }
    const cards = this.catalog.cards();
    const nuevos = codigos.map((codigo) => ({ codigo, cartas: cartasDelCodigo(cards, codigo) }));
    const claves = new Set(nuevos.map((r) => `${r.codigo.set}-${r.codigo.num}`));
    this.resultados.set(
      [
        ...nuevos,
        ...this.resultados().filter((r) => !claves.has(`${r.codigo.set}-${r.codigo.num}`)),
      ].slice(0, 10),
    );
    return true;
  }
}
