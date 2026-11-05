import { NgTemplateOutlet } from '@angular/common';
import { Component, HostListener, computed, effect, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CatalogCard, CatalogService } from '../core/catalog.service';
import { estiloDominios } from '../core/dominios';
import { MazosService } from '../core/mazos.service';
import {
  Copia,
  PUNTOS_PARA_GANAR,
  Partida,
  ZonaSim,
  agotarRuna,
  ajustarPuntos,
  alMazo,
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

/** Dónde se puede soltar una carta: zonas de juego, la mano, el cementerio y el mazo. */
type Destino = 'base' | 'campo0' | 'campo1' | 'cementerio' | 'mano' | 'campeon' | 'mazo' | 'fondo';

interface Arrastre {
  c: Copia;
  x: number;
  y: number;
}

/**
 * Mesa de práctica en solitario con la disposición de un tapete: el rival arriba (espejado),
 * los dos campos de batalla en medio, tu lado abajo y las pistas de puntos a los lados.
 * Las cartas se arrastran con el ratón o el dedo (pointer events, no drag nativo) a
 * cualquier zona, o se pulsan para abrir sus acciones. Las reglas están en `core/simulador.ts`.
 */
@Component({
  selector: 'app-simulador-page',
  imports: [RouterLink, NgTemplateOutlet, ThumbPipe, InclinarDirective],
  templateUrl: './simulador.page.html',
  styleUrl: './simulador.page.scss',
})
export class SimuladorPage {
  readonly id = input.required<string>();
  private readonly mazos = inject(MazosService);
  private readonly catalog = inject(CatalogService);

  protected readonly meta = PUNTOS_PARA_GANAR;
  protected readonly pista = Array.from({ length: PUNTOS_PARA_GANAR + 1 }, (_, i) => i);
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

  protected readonly mazo = computed(() => this.mazos.mazo(this.id()));
  protected readonly empiezoYo = signal(true);
  protected readonly p = signal<Partida>(nuevaPartida(VACIO));
  protected readonly elegidas = signal<ReadonlySet<number>>(new Set());
  protected readonly seleccion = signal<Copia | null>(null);
  protected readonly sobre = signal<string | null>(null);
  protected readonly arrastre = signal<Arrastre | null>(null);
  protected readonly logAbierto = signal(false);
  protected readonly vistaPrevia = signal<CatalogCard | null>(null);
  /** Estados anteriores, para deshacer (los últimos 30). */
  protected readonly historial = signal<Partida[]>([]);
  protected readonly ultimo = computed(() => this.p().log.at(-1) ?? '');
  protected readonly colores = computed(() => {
    const l = this.mazo()?.leyenda;
    return estiloDominios((l && this.catalog.card(l)?.domains) || []);
  });
  protected readonly runasListas = computed(() => this.p().runas.filter((r) => !r.agotada).length);
  /** Fuerza total de tus unidades en cada campo. */
  protected readonly fuerza = computed(() =>
    this.p().campos.map((c) =>
      c.unidades.reduce((t, u) => t + (this.catalog.card(u.id)?.might ?? 0), 0),
    ),
  );

  /** Pulsación pendiente: si el puntero se mueve más de unos píxeles, pasa a ser arrastre. */
  private inicio: { x: number; y: number; c: Copia } | null = null;
  private ignorarClick = false;

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

  /** Todo cambio de partida pasa por aquí para poder deshacerlo. */
  private mutar(f: (p: Partida) => Partida): void {
    const antes = this.p();
    const despues = f(antes);
    if (despues === antes) return;
    this.historial.update((h) => [...h.slice(-29), antes]);
    this.p.set(despues);
  }

  protected deshacer(): void {
    const h = this.historial();
    if (!h.length) return;
    this.p.set(h[h.length - 1]);
    this.historial.set(h.slice(0, -1));
    this.seleccion.set(null);
  }

  @HostListener('document:keydown', ['$event'])
  protected tecla(e: KeyboardEvent): void {
    const t = e.target as HTMLElement | null;
    if (t && ['INPUT', 'SELECT', 'TEXTAREA'].includes(t.tagName)) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      this.deshacer();
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    switch (e.key.toLowerCase()) {
      case 'd':
        this.aplicar(this.robar1);
        break;
      case 'c':
        this.aplicar(this.canalizar1);
        break;
      case 'e':
        if (this.p().fase !== 'mulligan') this.aplicar(terminarTurno);
        break;
      case 'escape':
        this.seleccion.set(null);
        this.logAbierto.set(false);
        break;
    }
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
    this.historial.set([]);
    this.elegidas.set(new Set());
    this.seleccion.set(null);
  }

  protected aplicar(f: (p: Partida) => Partida): void {
    this.mutar(f);
    this.elegidas.set(new Set());
  }

  protected alternarPago(): void {
    this.p.update((p) => ({ ...p, pagarCostes: !p.pagarCostes }));
  }

  protected hacerMulligan(): void {
    this.mutar((p) => mulligan(p, [...this.elegidas()]));
    this.elegidas.set(new Set());
  }

  protected puntosA(n: number): void {
    this.mutar((p) => ajustarPuntos(p, n - p.puntos));
  }

  protected puntosRivalA(n: number): void {
    this.mutar((p) => puntosRival(p, n - p.puntosRival));
  }

  protected rivalEn(donde: number, d: number): void {
    this.mutar((p) => rival(p, donde as 0 | 1 | -1, d));
  }

  protected combate(i: number, gano: boolean): void {
    this.mutar((p) => resolverCombate(p, i as 0 | 1, gano));
  }

  protected cambiarCampo(i: number, id: string): void {
    if (id) this.mutar((p) => cambiarCampo(p, i as 0 | 1, id));
  }

  protected zonaSel(c: Copia): ZonaSim | null {
    return zonaDe(this.p(), c.uid);
  }

  protected pulsar(c: Copia): void {
    if (this.ignorarClick) return;
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
    if (z === 'runas') {
      return [
        { zona: 'cementerio', texto: 'Reciclar al cementerio' },
        { zona: 'fondo', texto: 'Al fondo del mazo de runas' },
      ];
    }
    const todas: { zona: Destino; texto: string }[] = [
      { zona: 'base', texto: 'A la base' },
      { zona: 'campo0', texto: `A ${nombreCampo(0)}` },
      { zona: 'campo1', texto: `A ${nombreCampo(1)}` },
      { zona: 'mano', texto: 'A la mano' },
      { zona: 'cementerio', texto: 'Al cementerio' },
      { zona: 'mazo', texto: 'Encima del mazo' },
      { zona: 'fondo', texto: 'Al fondo del mazo' },
    ];
    if (this.catalog.card(c.id)?.supertype === 'Champion') {
      todas.splice(3, 0, { zona: 'campeon', texto: 'A la zona del campeón' });
    }
    return todas.filter((a) => a.zona !== z);
  }

  protected moverA(c: Copia, zona: Destino): void {
    const nombre = this.carta(c.id)?.name;
    if (zona === 'mazo' || zona === 'fondo') {
      this.mutar((p) => alMazo(p, c.uid, zona === 'mazo' ? 'arriba' : 'abajo', nombre));
    } else {
      this.mutar((p) => mover(p, c.uid, zona, this.carta(c.id)));
    }
    this.seleccion.set(null);
    this.vistaPrevia.set(null);
  }

  protected agotar(c: Copia): void {
    this.mutar((p) => alternarAgotada(p, c.uid));
    const s = this.seleccion();
    if (s?.uid === c.uid) this.seleccion.set({ ...s, agotada: !s.agotada });
  }

  protected previsualizar(c: Copia | null): void {
    if (this.arrastre()) return;
    this.vistaPrevia.set(c ? (this.carta(c.id) ?? null) : null);
  }

  // ── Arrastrar y soltar con pointer events (ratón, lápiz y dedo) ─────────────────────
  protected bajar(e: PointerEvent, c: Copia): void {
    if (e.button !== 0) return;
    this.inicio = { x: e.clientX, y: e.clientY, c };
  }

  @HostListener('document:pointermove', ['$event'])
  protected arrastrar(e: PointerEvent): void {
    const ini = this.inicio;
    if (!ini) return;
    let a = this.arrastre();
    if (!a) {
      if (Math.hypot(e.clientX - ini.x, e.clientY - ini.y) < 6) return;
      a = { c: ini.c, x: e.clientX, y: e.clientY };
      this.seleccion.set(null);
      this.vistaPrevia.set(null);
    }
    e.preventDefault();
    this.arrastre.set({ ...a, x: e.clientX, y: e.clientY });
    const zona = document
      .elementFromPoint(e.clientX, e.clientY)
      ?.closest<HTMLElement>('[data-zona]')?.dataset['zona'];
    const destino = zona && zona !== this.zonaSel(a.c) ? zona : null;
    if (this.sobre() !== destino) this.sobre.set(destino);
  }

  @HostListener('document:pointerup')
  @HostListener('document:pointercancel')
  protected soltar(): void {
    this.inicio = null;
    const a = this.arrastre();
    if (!a) return;
    const zona = this.sobre();
    this.arrastre.set(null);
    this.sobre.set(null);
    // El click que sigue al pointerup no debe abrir el menú de la carta soltada.
    this.ignorarClick = true;
    setTimeout(() => (this.ignorarClick = false));
    if (zona) this.moverA(a.c, zona as Destino);
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
