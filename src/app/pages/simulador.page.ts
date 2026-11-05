import { NgTemplateOutlet } from '@angular/common';
import { Component, HostListener, computed, effect, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CatalogService } from '../core/catalog.service';
import { estiloDominios } from '../core/dominios';
import { MazosService } from '../core/mazos.service';
import {
  Copia,
  DestinoJuego,
  DestinoMovimiento,
  GLOSARIO_KW,
  MULLIGAN_MAX,
  PUNTOS_PARA_GANAR,
  Partida,
  Rival,
  ZonaSim,
  aMano,
  aZonaCampeon,
  alCementerio,
  alMazo,
  alternarAgotada,
  anadirEnergia,
  anadirPoder,
  anadirAlPozo,
  crearToken,
  aturdir,
  barajarMazo,
  buff,
  cambiarCampo,
  canalizar,
  cerrarRecordatorio,
  copiaDe,
  costeDe,
  planDePago,
  danar,
  desterrar,
  fijarPuntos,
  fuerzaDe,
  jugar,
  listarPalabrasClave,
  matar,
  mover,
  mulligan,
  nuevaPartida,
  ocultar,
  porQueNoJugar,
  porQueNoMover,
  porQueNoMoverRival,
  resolverEnfrentamiento,
  resolverVision,
  robarTurno,
  prepararLeyenda,
  usarLeyenda,
  rivalAlternarAgotada,
  rivalCrear,
  rivalDanar,
  rivalDe,
  rivalMover,
  rivalQuitar,
  robar,
  terminarTurno,
  terminarTurnoRival,
  validarMazo,
  zonaDe,
} from '../core/simulador';
import { TraduccionService } from '../core/traduccion.service';
import { InclinarDirective } from '../ui/inclinar.directive';
import { ThumbPipe } from '../ui/pipes';
import { RulesTextComponent } from '../ui/rules-text.component';

/** Zonas donde se puede soltar algo (atributo data-zona). */
type Destino =
  DestinoJuego | 'cementerio' | 'mano' | 'campeon' | 'mazo' | 'oculta0' | 'oculta1' | 'rival-base';

interface Arrastre {
  uid: number;
  rival: boolean;
  x: number;
  y: number;
}

/**
 * Mesa de práctica en solitario (1v1) con las reglas del juego: el motor de
 * `core/simulador.ts` decide qué es legal; esta página solo pinta la mesa, arrastra cartas
 * y enseña por qué algo no se puede hacer. El rival es un muñeco cuyas fichas mueves tú en
 * su turno.
 */
@Component({
  selector: 'app-simulador-page',
  imports: [RouterLink, NgTemplateOutlet, ThumbPipe, InclinarDirective, RulesTextComponent],
  templateUrl: './simulador.page.html',
  styleUrl: './simulador.page.scss',
})
export class SimuladorPage {
  readonly id = input.required<string>();
  private readonly mazos = inject(MazosService);
  private readonly catalog = inject(CatalogService);
  protected readonly t = inject(TraduccionService);

  protected readonly meta = PUNTOS_PARA_GANAR;
  protected readonly mulliganMax = MULLIGAN_MAX;
  protected readonly glosario = GLOSARIO_KW;
  protected readonly pista = Array.from({ length: PUNTOS_PARA_GANAR + 1 }, (_, i) => i);

  protected readonly mazo = computed(() => this.mazos.mazo(this.id()));
  protected readonly empiezoYo = signal(true);
  protected readonly campoRival = signal('');
  protected readonly p = signal<Partida>(VACIA);
  protected readonly elegidas = signal<ReadonlySet<number>>(new Set());
  protected readonly seleccion = signal<{ uid: number; rival: boolean } | null>(null);
  protected readonly acelerar = signal(false);
  protected readonly sobre = signal<string | null>(null);
  protected readonly arrastre = signal<Arrastre | null>(null);
  protected readonly logAbierto = signal(false);
  protected readonly avisosAbiertos = signal(false);
  protected readonly recAbierto = signal<number | null>(null);
  protected readonly leyendaAbierta = signal(false);
  /** Zona donde se va a jugar una ficha (abre el selector). */
  protected readonly tokenDestino = signal<DestinoJuego | null>(null);
  /** Carta de la mano con varios destinos legales: se pregunta dónde jugarla. */
  protected readonly eleccion = signal<{
    uid: number;
    destinos: { destino: DestinoJuego; texto: string; razon: string | null }[];
  } | null>(null);
  /** Al pasar el ratón por una carta jugable: qué runas se gastarían. */
  protected readonly gasto = computed(() => {
    const c = this.vistaPrevia();
    if (!c || !this.enMano(c) || this.p().fase !== 'principal') return null;
    return planDePago(this.p(), costeDe(this.p(), c, this.acelerar() && c.ficha.kw.accelerate));
  });
  protected readonly cartaEleccion = computed(() => {
    const e = this.eleccion();
    return e ? (copiaDe(this.p(), e.uid) ?? null) : null;
  });
  protected readonly tokenNombre = signal('');
  protected readonly tokenFuerza = signal(1);
  /** Fichas del catálogo (una por nombre): Recruit, Sprite, Mech, Bird, Gold, Bomb… */
  protected readonly tokensCatalogo = computed(() => {
    const vistos = new Set<string>();
    const fuera = ['XP Tracker', 'Empowered', 'Buff'];
    return this.catalog
      .cards()
      .filter((c) => c.supertype === 'Token' && (c.type === 'Unit' || c.type === 'Gear'))
      .map((c) => ({ ...c, nombre: c.name.split(' // ')[0].replace(/\s*\([A-Z]+\)$/, '') }))
      .filter((c) => !fuera.includes(c.nombre) && !vistos.has(c.nombre) && vistos.add(c.nombre))
      .sort((a, b) => a.type.localeCompare(b.type) || a.nombre.localeCompare(b.nombre));
  });
  protected readonly leyenda = computed(() => this.carta(this.mazo()?.leyenda));
  protected readonly leyendaKw = computed(() => listarPalabrasClave(this.leyenda()?.text));
  protected readonly leyendaActivable = computed(() =>
    /:rb_exhaust:|\[Add\]|:\s*\[Reaction\]|:\s*\[Action\]/.test(this.leyenda()?.text ?? ''),
  );
  protected readonly recordatorioAbierto = computed(() => {
    const id = this.recAbierto();
    return id === null ? null : (this.p().recordatorios.find((r) => r.id === id) ?? null);
  });
  protected readonly vistaPrevia = signal<Copia | null>(null);
  protected readonly rivalFuerza = signal(2);
  protected readonly rivalTank = signal(false);
  protected readonly rivalGanking = signal(false);
  /** Estados anteriores, para deshacer (los últimos 40). */
  protected readonly historial = signal<Partida[]>([]);

  protected readonly ultimo = computed(() => this.p().log.at(-1) ?? '');
  protected readonly colores = computed(() => {
    const l = this.mazo()?.leyenda;
    return estiloDominios((l && this.catalog.card(l)?.domains) || []);
  });
  protected readonly runasListas = computed(() => this.p().runas.filter((r) => !r.agotada).length);
  protected readonly poderPozo = computed(() =>
    Object.entries(this.p().pozo.poder)
      .filter(([, n]) => n > 0)
      .map(([d, n]) => `${n} ${this.t.etiqueta(d)}`)
      .join(', '),
  );
  protected readonly avisosMazo = computed(() => {
    const m = this.mazo();
    return m ? validarMazo(m, (id) => this.catalog.card(id)) : [];
  });
  protected readonly camposCatalogo = computed(() =>
    this.catalog
      .cards()
      .filter((c) => c.type === 'Battlefield' && c.supertype !== 'Token')
      .sort((a, b) => a.name.localeCompare(b.name)),
  );
  /** Fuerza total de cada bando en cada campo (con Assault/Shield si hay combate). */
  protected readonly fuerzas = computed(() =>
    this.p().campos.map((c, i) => {
      const e = this.p().enfrentamiento;
      const papel =
        e && e.campo === i && e.tipo === 'combate'
          ? e.atacante === 'yo'
            ? 'ataca'
            : 'defiende'
          : null;
      return {
        mia: c.unidades.reduce((t, u) => t + (u.aturdida ? 0 : fuerzaDe(u, papel)), 0),
        rival: c.rival.reduce((t, r) => t + r.fuerza, 0),
      };
    }),
  );
  protected readonly seleccionada = computed(() => {
    const s = this.seleccion();
    if (!s) return null;
    return s.rival ? null : (copiaDe(this.p(), s.uid) ?? null);
  });
  protected readonly rivalSeleccionado = computed(() => {
    const s = this.seleccion();
    return s?.rival ? (rivalDe(this.p(), s.uid) ?? null) : null;
  });

  /** Pulsación pendiente: si el puntero se mueve más de unos píxeles, pasa a ser arrastre. */
  private inicio: { x: number; y: number; uid: number; rival: boolean } | null = null;
  private ignorarClick = false;

  constructor() {
    void this.mazos.load();
    let empezado: string | null = null;
    effect(() => {
      const m = this.mazo();
      if (m && empezado !== m.id && this.catalog.loaded()) {
        empezado = m.id;
        this.reiniciar();
      }
    });
  }

  // ── Estado ───────────────────────────────────────────────────────────────────────────
  private mutar(f: (p: Partida) => Partida): void {
    const antes = this.p();
    const despues = f(antes);
    if (despues === antes) return;
    if (despues.aviso && despues.log === antes.log) {
      this.p.set(despues);
      return;
    }
    this.historial.update((h) => [...h.slice(-39), antes]);
    this.p.set(despues);
  }

  protected deshacer(): void {
    const h = this.historial();
    if (!h.length) return;
    this.p.set(h[h.length - 1]);
    this.historial.set(h.slice(0, -1));
    this.seleccion.set(null);
  }

  protected reiniciar(): void {
    const m = this.mazo();
    if (!m) return;
    let campoRival = this.campoRival();
    if (!campoRival) {
      const todos = this.camposCatalogo().filter((c) => !m.campos.includes(c.cardId));
      campoRival = todos[Math.floor(Math.random() * todos.length)]?.cardId ?? '';
      this.campoRival.set(campoRival);
    }
    this.p.set(
      nuevaPartida(m, (id) => this.catalog.card(id), { empiezoYo: this.empiezoYo(), campoRival }),
    );
    this.historial.set([]);
    this.elegidas.set(new Set());
    this.seleccion.set(null);
  }

  protected cambiarCampoRival(id: string): void {
    this.campoRival.set(id);
    this.mutar((p) => cambiarCampo(p, 1, id));
  }

  protected cambiarCampoMio(id: string): void {
    this.mutar((p) => cambiarCampo(p, 0, id));
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
      case 'e':
        this.terminar();
        break;
      case 'd':
        this.robarDeTurno();
        break;
      case 'r':
        if (this.p().enfrentamiento) this.mutar(resolverEnfrentamiento);
        break;
      case 'escape':
        this.seleccion.set(null);
        this.logAbierto.set(false);
        this.leyendaAbierta.set(false);
        this.tokenDestino.set(null);
        this.eleccion.set(null);
        break;
    }
  }

  // ── Datos de cartas ──────────────────────────────────────────────────────────────────
  protected carta(id: string | null | undefined) {
    return id ? this.catalog.card(id) : undefined;
  }

  protected nombreCampo(i: number): string {
    return this.carta(this.p().campos[i].id)?.name ?? `Campo ${i + 1}`;
  }

  protected fuerza(c: Copia): number {
    return fuerzaDe(c);
  }

  protected kw(c: Copia): string[] {
    return listarPalabrasClave(c.ficha.texto);
  }

  protected zona(c: Copia): ZonaSim | null {
    return zonaDe(this.p(), c.uid);
  }

  protected enMano(c: Copia): boolean {
    const z = this.zona(c);
    return z === 'mano' || z === 'campeon' || z === 'oculta0' || z === 'oculta1';
  }

  protected enJuego(c: Copia): boolean {
    const z = this.zona(c);
    return z === 'base' || z === 'campo0' || z === 'campo1';
  }

  protected razonJugar(c: Copia, destino: DestinoJuego): string | null {
    return porQueNoJugar(this.p(), c, destino, this.acelerar() && c.ficha.kw.accelerate);
  }

  protected razonMover(c: Copia, destino: DestinoMovimiento): string | null {
    return porQueNoMover(this.p(), [c.uid], destino);
  }

  protected razonMoverRival(r: Rival, destino: 'base' | 0 | 1): string | null {
    return porQueNoMoverRival(this.p(), r.uid, destino);
  }

  protected coste(c: Copia): string {
    const k = costeDe(this.p(), c, this.acelerar() && c.ficha.kw.accelerate);
    return `${k.energia}⚡${k.poder ? ` ${k.poder}✦` : ''}`;
  }

  protected textoCarta(c: Copia): string {
    return this.t.texto(c.ficha.texto).valor;
  }

  protected nombreKw(k: string): string {
    return k.replace(/ \d+$/, '');
  }

  protected fichas(n: number): number[] {
    return Array.from({ length: Math.min(n, 12) }, (_, i) => i);
  }

  // ── Acciones de turno ────────────────────────────────────────────────────────────────
  protected hacerMulligan(): void {
    this.mutar((p) => mulligan(p, [...this.elegidas()]));
    this.elegidas.set(new Set());
  }

  protected terminar(): void {
    const f = this.p().fase;
    if (f === 'principal') this.mutar(terminarTurno);
    else if (f === 'rival') this.mutar(terminarTurnoRival);
  }

  protected resolver(): void {
    this.mutar(resolverEnfrentamiento);
    this.seleccion.set(null);
  }

  protected vision(reciclar: boolean): void {
    this.mutar((p) => resolverVision(p, reciclar));
  }

  protected cerrarRec(id: number): void {
    this.p.update((p) => cerrarRecordatorio(p, id));
    this.recAbierto.set(null);
  }

  protected puntosA(quien: 'yo' | 'rival', n: number): void {
    this.mutar((p) => fijarPuntos(p, quien, n));
  }

  protected robar1(): void {
    this.mutar((p) => robar(p));
  }

  /** Robo de la fase de robo (clic en el mazo o tecla D). */
  protected robarDeTurno(): void {
    this.mutar(robarTurno);
  }

  protected usarLaLeyenda(): void {
    const l = this.leyenda();
    if (!l) return;
    this.mutar((p) => usarLeyenda(p, l.name, l.text));
    if (!this.p().aviso) this.leyendaAbierta.set(false);
  }

  protected alternarLeyenda(): void {
    this.mutar(prepararLeyenda);
  }

  protected canalizar1(): void {
    this.mutar((p) => canalizar(p, 1));
  }

  protected barajar(): void {
    this.mutar(barajarMazo);
  }

  protected crearFicha(id?: string): void {
    const destino = this.tokenDestino();
    if (!destino) return;
    this.mutar((p) =>
      crearToken(
        p,
        destino,
        id
          ? { id }
          : { nombre: this.tokenNombre().trim(), fuerza: Math.max(0, this.tokenFuerza()) },
        (cid) => this.catalog.card(cid),
      ),
    );
    if (!this.p().aviso) this.tokenDestino.set(null);
  }

  protected pozoManual(energia: number, poder: number): void {
    this.mutar((p) => anadirAlPozo(p, energia, poder));
  }

  protected mutarEnergia(): void {
    this.mutar((p) => anadirEnergia(p));
  }

  protected mutarPoder(): void {
    this.mutar((p) => anadirPoder(p));
  }

  // ── Acciones sobre mis cartas ────────────────────────────────────────────────────────
  protected jugarA(c: Copia, destino: DestinoJuego): void {
    this.mutar((p) => jugar(p, c.uid, destino, this.acelerar() && c.ficha.kw.accelerate));
    this.acelerar.set(false);
    this.cerrarMenuSiOk();
  }

  protected moverA(c: Copia, destino: DestinoMovimiento): void {
    this.mutar((p) => mover(p, this.grupoDe(c), destino));
    this.cerrarMenuSiOk();
  }

  /** La carta y, si está entre las elegidas, todas las elegidas que sigan en juego. */
  protected grupoDe(c: Copia): number[] {
    const el = this.elegidas();
    if (!el.has(c.uid)) return [c.uid];
    const p = this.p();
    const uids = [...el].filter((uid) => {
      const z = zonaDe(p, uid);
      return z === 'base' || z === 'campo0' || z === 'campo1';
    });
    return uids.includes(c.uid) ? uids : [c.uid, ...uids];
  }

  protected razonMoverGrupo(c: Copia, destino: DestinoMovimiento): string | null {
    return porQueNoMover(this.p(), this.grupoDe(c), destino);
  }

  protected ocultarEn(c: Copia, i: 0 | 1): void {
    this.mutar((p) => ocultar(p, c.uid, i));
    this.cerrarMenuSiOk();
  }

  protected accion(nombre: string, c: Copia, arg?: number): void {
    const f: Record<string, (p: Partida) => Partida> = {
      agotar: (p) => alternarAgotada(p, c.uid),
      danar: (p) => danar(p, c.uid, arg ?? 1),
      buff: (p) => buff(p, c.uid, arg ?? 1),
      aturdir: (p) => aturdir(p, c.uid),
      matar: (p) => matar(p, c.uid),
      mano: (p) => aMano(p, c.uid),
      cementerio: (p) => alCementerio(p, c.uid),
      desterrar: (p) => desterrar(p, c.uid),
      campeon: (p) => aZonaCampeon(p, c.uid),
      arriba: (p) => alMazo(p, c.uid, 'arriba'),
      abajo: (p) => alMazo(p, c.uid, 'abajo'),
      energia: (p) => anadirEnergia(p, c.uid),
      poder: (p) => anadirPoder(p, c.uid),
    };
    this.mutar(f[nombre]);
    if (!['danar', 'buff', 'agotar', 'aturdir'].includes(nombre)) this.cerrarMenuSiOk();
  }

  private cerrarMenuSiOk(): void {
    if (!this.p().aviso) {
      this.seleccion.set(null);
      this.vistaPrevia.set(null);
      if (this.p().fase !== 'mulligan') this.elegidas.set(new Set());
    }
  }

  // ── Rival ────────────────────────────────────────────────────────────────────────────
  protected rivalAnadir(donde: 'base' | 0 | 1): void {
    this.mutar((p) =>
      rivalCrear(p, donde, {
        fuerza: this.rivalFuerza(),
        tank: this.rivalTank(),
        ganking: this.rivalGanking(),
      }),
    );
  }

  protected rivalAccion(nombre: string, r: Rival, arg?: number): void {
    const f: Record<string, (p: Partida) => Partida> = {
      agotar: (p) => rivalAlternarAgotada(p, r.uid),
      danar: (p) => rivalDanar(p, r.uid, arg ?? 1),
      quitar: (p) => rivalQuitar(p, r.uid),
    };
    this.mutar(f[nombre]);
    if (nombre === 'quitar') this.seleccion.set(null);
  }

  protected rivalMoverA(r: Rival, destino: 'base' | 0 | 1): void {
    this.mutar((p) => rivalMover(p, r.uid, destino));
    this.cerrarMenuSiOk();
  }

  // ── Pulsar y arrastrar ───────────────────────────────────────────────────────────────
  protected pulsar(c: Copia, e?: MouseEvent): void {
    if (this.ignorarClick) return;
    if (e && (e.ctrlKey || e.shiftKey || e.metaKey) && this.enJuego(c)) {
      const s = new Set(this.elegidas());
      if (s.has(c.uid)) s.delete(c.uid);
      else s.add(c.uid);
      this.elegidas.set(s);
      this.seleccion.set(null);
      return;
    }
    if (this.p().fase === 'mulligan' && this.zona(c) === 'mano') {
      const s = new Set(this.elegidas());
      if (s.has(c.uid)) s.delete(c.uid);
      else if (s.size < MULLIGAN_MAX) s.add(c.uid);
      this.elegidas.set(s);
      return;
    }
    this.acelerar.set(false);
    // Carta jugable: se juega directa si solo cabe en un sitio; si no, se pregunta dónde.
    if (this.enMano(c) && (this.p().fase === 'principal' || this.p().fase === 'rival')) {
      const destinos = (['base', 'campo0', 'campo1'] as DestinoJuego[]).map((destino) => ({
        destino,
        texto:
          destino === 'base'
            ? c.ficha.tipo === 'Spell'
              ? 'Jugar el hechizo'
              : 'Tu base'
            : this.nombreCampo(destino === 'campo0' ? 0 : 1),
        razon: porQueNoJugar(this.p(), c, destino, false),
      }));
      const legales = destinos.filter((d) => !d.razon);
      if (legales.length === 1 && !c.ficha.kw.accelerate) {
        this.jugarA(c, legales[0].destino);
        return;
      }
      if (legales.length > 0) {
        this.seleccion.set(null);
        this.eleccion.set({
          uid: c.uid,
          destinos: c.ficha.tipo === 'Unit' ? destinos : destinos.slice(0, 1),
        });
        return;
      }
    }
    this.seleccion.set(this.seleccion()?.uid === c.uid ? null : { uid: c.uid, rival: false });
  }

  /** Botón derecho: menú completo de la carta (texto, palabras clave, acciones manuales). */
  protected abrirMenu(c: Copia, e: Event): void {
    e.preventDefault();
    this.eleccion.set(null);
    this.acelerar.set(false);
    this.seleccion.set({ uid: c.uid, rival: false });
  }

  protected elegirDestino(destino: DestinoJuego): void {
    const c = this.cartaEleccion();
    if (!c) return;
    this.jugarA(c, destino);
    if (!this.p().aviso) this.eleccion.set(null);
  }

  /** Pulsar el mazo: el robo de la fase de robo o, fuera de ella, un robo por efecto. */
  protected pulsarMazo(): void {
    if (this.p().fase === 'robo') this.mutar(robarTurno);
    else this.mutar((p) => robar(p));
  }

  /** Pulsar el mazo de runas: canalizar 1 por efecto (las 2 del turno son automáticas). */
  protected pulsarRunas(): void {
    this.mutar((p) => canalizar(p, 1));
  }

  protected pulsarRival(r: Rival): void {
    if (this.ignorarClick) return;
    this.seleccion.set(this.seleccion()?.uid === r.uid ? null : { uid: r.uid, rival: true });
  }

  protected previsualizar(c: Copia | null): void {
    if (this.arrastre()) return;
    this.vistaPrevia.set(c);
  }

  protected bajar(e: PointerEvent, uid: number, rival = false): void {
    if (e.button !== 0) return;
    this.inicio = { x: e.clientX, y: e.clientY, uid, rival };
  }

  @HostListener('document:pointermove', ['$event'])
  protected arrastrar(e: PointerEvent): void {
    const ini = this.inicio;
    if (!ini) return;
    let a = this.arrastre();
    if (!a) {
      if (Math.hypot(e.clientX - ini.x, e.clientY - ini.y) < 6) return;
      a = { uid: ini.uid, rival: ini.rival, x: e.clientX, y: e.clientY };
      this.seleccion.set(null);
      this.vistaPrevia.set(null);
    }
    e.preventDefault();
    this.arrastre.set({ ...a, x: e.clientX, y: e.clientY });
    const zona =
      document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>('[data-zona]')?.dataset[
        'zona'
      ] ?? null;
    if (this.sobre() !== zona) this.sobre.set(zona);
  }

  @HostListener('document:pointerup')
  @HostListener('document:pointercancel')
  protected soltar(): void {
    this.inicio = null;
    const a = this.arrastre();
    if (!a) return;
    const zona = this.sobre() as Destino | null;
    this.arrastre.set(null);
    this.sobre.set(null);
    this.ignorarClick = true;
    setTimeout(() => (this.ignorarClick = false));
    if (!zona) return;
    if (a.rival) {
      const destino =
        zona === 'rival-base' ? 'base' : zona === 'campo0' ? 0 : zona === 'campo1' ? 1 : null;
      if (destino !== null) this.mutar((p) => rivalMover(p, a.uid, destino));
      return;
    }
    const c = copiaDe(this.p(), a.uid);
    if (!c) return;
    const z = this.zona(c);
    this.mutar((p) => {
      if (zona === 'cementerio') return alCementerio(p, c.uid);
      if (zona === 'mano') return aMano(p, c.uid);
      if (zona === 'mazo') return alMazo(p, c.uid, 'arriba');
      if (zona === 'campeon') return aZonaCampeon(p, c.uid);
      if (zona === 'oculta0' || zona === 'oculta1')
        return ocultar(p, c.uid, zona === 'oculta0' ? 0 : 1);
      if (zona === 'rival-base') return p;
      if (z === 'base' || z === 'campo0' || z === 'campo1') return mover(p, this.grupoDe(c), zona);
      return jugar(p, c.uid, zona, false);
    });
    if (!this.p().aviso && this.p().fase !== 'mulligan') this.elegidas.set(new Set());
  }

  protected fantasmaImg(a: Arrastre): string {
    if (a.rival) return '';
    const c = copiaDe(this.p(), a.uid);
    return this.carta(c?.id)?.imgUrl ?? '';
  }
}

const VACIA: Partida = nuevaPartida(
  {
    id: '',
    nombre: '',
    leyenda: null,
    campeon: null,
    principal: {},
    runas: {},
    campos: [],
    banquillo: {},
    actualizado: '',
  },
  () => undefined,
);
