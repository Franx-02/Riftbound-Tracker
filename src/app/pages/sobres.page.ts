import { Component, HostListener, computed, effect, inject, signal } from '@angular/core';
import { AlbumService } from '../core/album.service';
import { CatalogCard, CatalogService } from '../core/catalog.service';
import { DORSO_OSCURO } from '../core/dorsos';
import { colorDominio } from '../core/dominios';
import {
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

/**
 * Sobres: abres sobres de un set, revelas las cartas una a una y las guardas en un álbum
 * virtual que no tiene nada que ver con tu colección real. Dos sobres cada 12 horas.
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
  protected readonly rarezas: Rareza[] = ['Common', 'Uncommon', 'Rare', 'Epic', 'Showcase'];
  protected readonly dorso = DORSO_OSCURO;
  protected readonly vista = signal<Vista>('sobres');
  protected readonly setElegido = signal<string>(SETS_SOBRE[0]);
  protected readonly filtroRareza = signal<Rareza | ''>('');
  /** Sobre en curso: cartas boca abajo que se van revelando. */
  protected readonly sobre = signal<Sobre | null>(null);
  protected readonly reveladas = signal<ReadonlySet<number>>(new Set());
  protected readonly abriendo = signal(false);
  /** Qué cartas del sobre eran nuevas antes de guardarlo (para la insignia). */
  protected readonly nuevas = signal<ReadonlySet<string>>(new Set());
  protected readonly ampliada = signal<CatalogCard | null>(null);
  protected readonly ahora = signal(Date.now());

  protected readonly sets = computed(() =>
    SETS_SOBRE.map((id) => {
      const s = this.catalog.sets().find((x) => x.id === id);
      const p = progreso(id, this.albumSrv.album(), this.catalog.cards());
      const dominio = this.catalog.cards().find((c) => c.set === id && c.type === 'Legend')
        ?.domains[0];
      return { id, nombre: s?.name ?? id, progreso: p, color: colorDominio(dominio) };
    }),
  );
  protected readonly setActual = computed(
    () => this.sets().find((s) => s.id === this.setElegido()) ?? this.sets()[0],
  );
  protected readonly restantes = computed(() => {
    this.ahora();
    return this.albumSrv.album().aperturas.restantes;
  });
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
  /** Cartas del set para el álbum, ordenadas por número; con filtro de rareza. */
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

  private reloj: ReturnType<typeof setInterval> | null = null;

  constructor() {
    void this.catalog.load?.();
    void this.albumSrv.load();
    effect((onCleanup) => {
      this.reloj = setInterval(() => {
        this.ahora.set(Date.now());
        this.albumSrv.refrescar();
      }, 1000);
      onCleanup(() => this.reloj && clearInterval(this.reloj));
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

  // ── Apertura ─────────────────────────────────────────────────────────────────────────
  protected abrir(): void {
    if (this.abriendo() || this.sobre()) return;
    const set = this.setElegido();
    const antes = this.albumSrv.album().cartas;
    this.abriendo.set(true);
    sonar('mover');
    // Pequeña espera para la animación de rasgar el sobre.
    setTimeout(() => {
      const s = this.albumSrv.abrir(set, this.catalog.cards());
      this.abriendo.set(false);
      if (!s) {
        sonar('error');
        return;
      }
      this.nuevas.set(new Set(s.cartas.map((c) => c.cardId).filter((id) => !(antes[id] > 0))));
      this.reveladas.set(new Set());
      this.sobre.set(s);
      sonar('robar');
    }, 900);
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
    s.cartas.forEach((_, i) => setTimeout(() => this.revelar(i), i * 180));
  }

  protected cerrarSobre(): void {
    this.sobre.set(null);
    this.reveladas.set(new Set());
  }

  protected otroSobre(): void {
    this.cerrarSobre();
    setTimeout(() => this.abrir(), 50);
  }

  @HostListener('document:keydown.escape')
  protected escape(): void {
    if (this.ampliada()) this.ampliada.set(null);
    else if (this.todasReveladas()) this.cerrarSobre();
  }
}
