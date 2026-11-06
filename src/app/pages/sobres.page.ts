import { Component, HostListener, computed, effect, inject, signal } from '@angular/core';
import { AlbumService } from '../core/album.service';
import { CatalogCard, CatalogService } from '../core/catalog.service';
import { DORSO_OSCURO } from '../core/dorsos';
import { colorDominio } from '../core/dominios';
import {
  CARTAS_POR_SOBRE,
  MAX_APERTURAS,
  ORDEN_RAREZA,
  Rareza,
  SETS_SOBRE,
  Sobre,
  faltaParaSiguiente,
  progreso,
  rarezaDe,
} from '../core/sobres';
import { sonar } from '../core/sonidos';
import { TraduccionService } from '../core/traduccion.service';
import { CabeceraComponent } from '../ui/cabecera.component';
import { InclinarDirective } from '../ui/inclinar.directive';
import { ThumbPipe } from '../ui/pipes';

type Vista = 'sobres' | 'album';
const CLAVE_LIBRE = 'riftbound-sobres-libre';
/** Color de cada sobre, como los reales. */
const COLORES: Record<string, string> = {
  OGN: '#1f3f8f',
  SFD: '#b9a070',
  UNL: '#7c2fa6',
  VEN: '#b3123a',
  RAD: '#6fa8dc',
};

/**
 * Sobres: eliges un sobre en el carrusel, lo rasgas deslizando por arriba, revelas las 14
 * cartas una a una y van a un álbum virtual que no tiene nada que ver con tu colección
 * real. Modo diario (dos sobres cada 12 h) o sin límite.
 */
@Component({
  selector: 'app-sobres-page',
  imports: [CabeceraComponent, ThumbPipe, InclinarDirective],
  templateUrl: './sobres.page.html',
  styleUrl: './sobres.page.scss',
})
export class SobresPage {
  protected readonly catalog = inject(CatalogService);
  protected readonly albumSrv = inject(AlbumService);
  protected readonly t = inject(TraduccionService);

  protected readonly max = MAX_APERTURAS;
  protected readonly porSobre = CARTAS_POR_SOBRE;
  protected readonly rarezas: Rareza[] = ['Common', 'Uncommon', 'Rare', 'Epic', 'Showcase'];
  protected readonly dorso = DORSO_OSCURO;
  protected readonly vista = signal<Vista>('sobres');
  /** Índice del sobre en el carrusel. */
  protected readonly sel = signal(0);
  protected readonly setElegido = computed(() => SETS_SOBRE[this.sel()] ?? SETS_SOBRE[0]);
  protected readonly modoLibre = signal(leerLibre());
  protected readonly filtroRareza = signal<Rareza | ''>('');
  /** Fases de la apertura: sobre grande para rasgar → cartas boca abajo. */
  protected readonly rasgando = signal(false);
  protected readonly rasgado = signal(0);
  protected readonly abierto = signal(false);
  protected readonly sobre = signal<Sobre | null>(null);
  protected readonly reveladas = signal<ReadonlySet<number>>(new Set());
  protected readonly nuevas = signal<ReadonlySet<string>>(new Set());
  protected readonly ampliada = signal<CatalogCard | null>(null);
  protected readonly ahora = signal(Date.now());

  protected readonly sets = computed(() =>
    SETS_SOBRE.map((id) => {
      const s = this.catalog.sets().find((x) => x.id === id);
      const p = progreso(id, this.albumSrv.album(), this.catalog.cards());
      const cartas = this.catalog.cards();
      const legend =
        cartas.find((c) => c.set === id && c.type === 'Legend' && c.alt) ??
        cartas.find((c) => c.set === id && c.type === 'Legend');
      const arte = legend ?? cartas.find((c) => c.set === id && c.alt);
      return {
        id,
        nombre: s?.name ?? id,
        progreso: p,
        color: COLORES[id] ?? colorDominio(legend?.domains[0]),
        arte: arte?.imgUrl ?? '',
      };
    }),
  );
  protected readonly setActual = computed(() => this.sets()[this.sel()] ?? this.sets()[0]);
  protected readonly restantes = computed(() => {
    this.ahora();
    return this.albumSrv.album().aperturas.restantes;
  });
  protected readonly puedeAbrir = computed(
    () => this.albumSrv.listo() && (this.modoLibre() || this.restantes() > 0),
  );
  protected readonly cuentaAtras = computed(() => {
    const ms = faltaParaSiguiente(this.albumSrv.album().aperturas, new Date(this.ahora()));
    if (!ms) return '';
    const h = Math.floor(ms / 3_600_000);
    const m = Math.floor((ms % 3_600_000) / 60_000);
    const s = Math.floor((ms % 60_000) / 1000);
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  });
  protected readonly todasReveladas = computed(() => {
    const s = this.sobre();
    return !!s && this.reveladas().size >= s.cartas.length;
  });
  protected readonly cartasAlbum = computed(() => {
    const set = this.setElegido();
    const f = this.filtroRareza();
    return this.catalog
      .cards()
      .filter((c) => c.set === set && c.supertype !== 'Token' && c.type !== 'Rune' && rarezaDe(c))
      .filter((c) => !f || rarezaDe(c) === f)
      .sort((a, b) => ORDEN_RAREZA[rarezaDe(a)!] - ORDEN_RAREZA[rarezaDe(b)!] || a.num - b.num);
  });
  protected readonly totalCartas = computed(() =>
    Object.values(this.albumSrv.album().cartas).reduce((a, b) => a + b, 0),
  );
  protected readonly distintas = computed(() => Object.keys(this.albumSrv.album().cartas).length);

  private arrastre: { x0: number; ancho: number } | null = null;

  constructor() {
    void this.catalog.load();
    void this.albumSrv.load();
    effect((onCleanup) => {
      const reloj = setInterval(() => {
        this.ahora.set(Date.now());
        this.albumSrv.refrescar();
      }, 1000);
      onCleanup(() => clearInterval(reloj));
    });
  }

  protected rareza(c: CatalogCard): Rareza {
    return rarezaDe(c) ?? 'Common';
  }

  protected etiquetaRareza(z: string): string {
    const es: Record<string, string> = {
      Common: 'Común',
      Uncommon: 'Infrecuente',
      Rare: 'Rara',
      Epic: 'Épica',
      Showcase: 'Showcase',
    };
    return es[z] ?? z;
  }

  protected copias(c: CatalogCard): number {
    return this.albumSrv.copias(c.cardId);
  }

  protected porcentaje(p: { tengo: number; total: number }): number {
    return p.total ? Math.round((p.tengo / p.total) * 100) : 0;
  }

  // ── Carrusel ─────────────────────────────────────────────────────────────────────────
  protected elegir(i: number): void {
    this.sel.set(((i % SETS_SOBRE.length) + SETS_SOBRE.length) % SETS_SOBRE.length);
    sonar('mover');
  }

  /** Posición en el carrusel circular: de -2 a 2, para que siempre haya sobres a ambos lados. */
  protected offset(i: number): number {
    const n = SETS_SOBRE.length;
    return ((((i - this.sel()) % n) + n + Math.floor(n / 2)) % n) - Math.floor(n / 2);
  }

  protected anterior(): void {
    this.elegir(this.sel() - 1);
  }

  protected siguiente(): void {
    this.elegir(this.sel() + 1);
  }

  protected alternarLibre(): void {
    const v = !this.modoLibre();
    this.modoLibre.set(v);
    try {
      localStorage.setItem(CLAVE_LIBRE, v ? 'si' : 'no');
    } catch {
      /* sin almacenamiento */
    }
  }

  // ── Apertura ─────────────────────────────────────────────────────────────────────────
  protected abrir(): void {
    if (!this.puedeAbrir() || this.rasgando() || this.sobre()) return;
    this.rasgado.set(0);
    this.abierto.set(false);
    this.rasgando.set(true);
    sonar('mover');
  }

  /** Arrastre por la parte de arriba del sobre: al recorrer el 70 % se rasga. */
  protected rasgarInicio(e: PointerEvent): void {
    if (this.abierto()) return;
    const el = e.currentTarget as HTMLElement;
    this.arrastre = { x0: e.clientX, ancho: el.getBoundingClientRect().width };
    el.setPointerCapture?.(e.pointerId);
  }

  protected rasgarMover(e: PointerEvent): void {
    if (!this.arrastre || this.abierto()) return;
    const p = Math.max(0, Math.min(1, (e.clientX - this.arrastre.x0) / this.arrastre.ancho));
    this.rasgado.set(p);
    if (p >= 0.7) this.rasgar();
  }

  protected rasgarFin(): void {
    this.arrastre = null;
    if (!this.abierto()) this.rasgado.set(0);
  }

  /** Rasga el sobre (por arrastre o con el botón) y saca las cartas. */
  protected rasgar(): void {
    if (this.abierto()) return;
    this.arrastre = null;
    this.rasgado.set(1);
    this.abierto.set(true);
    sonar('robar');
    const set = this.setElegido();
    const antes = this.albumSrv.album().cartas;
    setTimeout(() => {
      const s = this.albumSrv.abrir(set, this.catalog.cards(), { gratis: this.modoLibre() });
      this.rasgando.set(false);
      if (!s) {
        sonar('error');
        return;
      }
      this.nuevas.set(new Set(s.cartas.map((c) => c.cardId).filter((id) => !(antes[id] > 0))));
      this.reveladas.set(new Set());
      this.sobre.set(s);
    }, 750);
  }

  protected revelar(i: number): void {
    const s = this.sobre();
    if (!s || this.reveladas().has(i)) return;
    const r = new Set(this.reveladas());
    r.add(i);
    this.reveladas.set(r);
    const z = this.rareza(s.cartas[i]);
    sonar(z === 'Showcase' || z === 'Epic' ? 'punto' : 'jugar');
  }

  protected revelarTodas(): void {
    const s = this.sobre();
    if (!s) return;
    s.cartas.forEach((_, i) => setTimeout(() => this.revelar(i), i * 120));
  }

  protected cerrarSobre(): void {
    this.sobre.set(null);
    this.reveladas.set(new Set());
  }

  protected otroSobre(): void {
    this.cerrarSobre();
    setTimeout(() => this.abrir(), 50);
  }

  protected cancelar(): void {
    if (!this.abierto()) this.rasgando.set(false);
  }

  @HostListener('document:keydown', ['$event'])
  protected tecla(e: KeyboardEvent): void {
    const t = e.target as HTMLElement | null;
    if (t && ['INPUT', 'SELECT', 'TEXTAREA'].includes(t.tagName)) return;
    if (e.key === 'Escape') {
      if (this.ampliada()) this.ampliada.set(null);
      else if (this.rasgando()) this.cancelar();
      else if (this.todasReveladas()) this.cerrarSobre();
      return;
    }
    if (this.vista() !== 'sobres' || this.rasgando() || this.sobre()) return;
    if (e.key === 'ArrowLeft') this.anterior();
    if (e.key === 'ArrowRight') this.siguiente();
    if (e.key === 'Enter') this.abrir();
  }
}

function leerLibre(): boolean {
  try {
    return localStorage.getItem(CLAVE_LIBRE) === 'si';
  } catch {
    return false;
  }
}
