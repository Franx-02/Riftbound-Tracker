import { CatalogCard } from './catalog.service';
import { MAX_COPIAS, Mazo, NUM_CAMPOS, TAMANO_PRINCIPAL, TAMANO_RUNAS, nombreBase } from './mazos';

/**
 * Motor del simulador en solitario, siguiendo las Core Rules de Riftbound (versión del
 * 16/7/2026), modo 1v1 (Duel). El rival es un "muñeco": sus unidades son fichas con fuerza
 * que mueve el propio jugador en el turno del rival, pero todo lo que ocurre en la mesa
 * (costes, movimientos, enfrentamientos, combate, puntuación, robo, Burn Out) sigue las
 * reglas. Las funciones son puras: devuelven una partida nueva y anotan en `log`; cuando
 * una acción es ilegal devuelven la misma partida con `aviso` explicando por qué.
 *
 * Referencias a reglas (CR): setup 110-118, turno 314-317, limpieza 323, control 190,
 * movimiento 144/445, combate 463-466, puntuación 467-472, 1v1 485, palabras clave 800.
 */

// ── Palabras clave (CR 800) ────────────────────────────────────────────────────────────

export interface PalabrasClave {
  accelerate: boolean;
  action: boolean;
  reaction: boolean;
  assault: number;
  shield: number;
  tank: boolean;
  backline: boolean;
  ganking: boolean;
  temporary: boolean;
  vision: boolean;
  deathknell: boolean;
  hidden: boolean;
  legion: boolean;
  ambush: boolean;
  deflect: number;
  mighty: boolean;
  flow: boolean;
  repeat: boolean;
  equip: boolean;
  quickDraw: boolean;
  hunt: number;
  level: boolean;
  empower: boolean;
  weaponmaster: boolean;
  unique: boolean;
}

/** Nombre y explicación en castellano de cada palabra clave (CR 805-829). */
export const GLOSARIO_KW: Record<string, string> = {
  Accelerate:
    'Al jugarla puedes pagar 1 de energía y 1 de poder de su dominio para que entre preparada (CR 805).',
  Action:
    'Se puede jugar en tu turno o durante enfrentamientos, también en el turno del rival (CR 806).',
  Reaction:
    'Como Action, y además mientras hay cadena, es decir, en respuesta a otra carta (CR 813).',
  Assault: 'Mientras ataca tiene +X de fuerza (CR 807).',
  Shield: 'Mientras defiende tiene +X de fuerza (CR 814).',
  Tank: 'En combate debe recibir daño letal antes que sus compañeras sin Tank (CR 815).',
  Backline: 'En combate recibe daño letal después de sus compañeras sin Backline (CR 826).',
  Ganking: 'Con su movimiento normal puede ir de un campo de batalla a otro (CR 810).',
  Temporary: 'Al empezar la fase de inicio de su controlador, antes de puntuar, muere (CR 816).',
  Vision: 'Al jugarla miras la primera carta de tu mazo y puedes reciclarla (CR 817).',
  Deathknell: 'Cuando muere, se produce el efecto (CR 808).',
  Hidden:
    'Puedes pagar 1 de poder para ponerla boca abajo en un campo que controles; a partir del turno siguiente se juega gratis y como Reaction (CR 811).',
  Legion: 'Si ya has jugado otra carta este turno, gana el texto que sigue (CR 812).',
  Ambush: 'Puede jugarse en un campo donde controles unidades, y entonces es Reaction (CR 822).',
  Deflect: 'Las cartas del rival que la elijan cuestan X de poder más (CR 809).',
  Mighty: 'Una unidad es Mighty mientras tenga 5 o más de fuerza (CR 706).',
  Flow: 'Puede jugarse desde el cementerio por su coste de Flow; después se destierra (CR 829).',
  Repeat: 'Puedes pagar el coste adicional para que el efecto ocurra dos veces (CR 820).',
  Equip: 'Paga el coste para acoplarla a una unidad que controles (CR 818).',
  'Quick-Draw': 'Es Reaction y al jugarla se acopla a una unidad tuya (CR 819).',
  Hunt: 'Cuando conquista o mantiene un campo, ganas X de XP (CR 823).',
  Level: 'Mientras tengas N o más XP, gana el texto que sigue (CR 824).',
  Empower: 'Paga el coste para volverla Empowered; solo si no lo es ya (CR 827).',
  Empowered: 'Mientras sea Empowered, gana el texto que sigue (CR 828).',
  Weaponmaster:
    'Al jugarla puedes acoplarle un equipamiento tuyo pagando su Equip con 1 de poder menos (CR 821).',
  Unique: 'Solo una copia por mazo (CR 825).',
};

export function palabrasClave(texto: string | null | undefined): PalabrasClave {
  const t = texto ?? '';
  const tiene = (k: string) => new RegExp(`\\[${k}(?: \\d+)?\\]`).test(t);
  const valor = (k: string) => {
    const m = t.match(new RegExp(`\\[${k}(?: (\\d+))?\\]`));
    return m ? Number(m[1] ?? 1) : 0;
  };
  return {
    accelerate: tiene('Accelerate'),
    action: tiene('Action'),
    reaction: tiene('Reaction'),
    assault: valor('Assault'),
    shield: valor('Shield'),
    tank: tiene('Tank'),
    backline: tiene('Backline'),
    ganking: tiene('Ganking'),
    temporary: tiene('Temporary'),
    vision: tiene('Vision'),
    deathknell: tiene('Deathknell'),
    hidden: tiene('Hidden'),
    legion: tiene('Legion'),
    ambush: tiene('Ambush'),
    deflect: valor('Deflect'),
    mighty: tiene('Mighty'),
    flow: tiene('Flow'),
    repeat: tiene('Repeat'),
    equip: tiene('Equip'),
    quickDraw: tiene('Quick-Draw'),
    hunt: valor('Hunt'),
    level: tiene('Level'),
    empower: tiene('Empower'),
    weaponmaster: tiene('Weaponmaster'),
    unique: tiene('Unique'),
  };
}

/** Palabras clave presentes en un texto, tal como aparecen ([Assault 2] → "Assault 2"). */
export function listarPalabrasClave(texto: string | null | undefined): string[] {
  const vistas = new Set<string>();
  for (const m of (texto ?? '').matchAll(/\[([A-Z][A-Za-z-]+(?: \d+)?)\]/g)) {
    const nombre = m[1].replace(/ \d+$/, '');
    if (GLOSARIO_KW[nombre]) vistas.add(m[1]);
  }
  return [...vistas];
}

/** Momentos del texto de una carta en los que hay que acordarse de su efecto. */
export type Disparador = 'jugar' | 'morir' | 'atacar' | 'defender' | 'hold' | 'conquer' | 'inicio';

export function disparadores(texto: string | null | undefined): Disparador[] {
  const t = texto ?? '';
  const d: Disparador[] = [];
  if (/When (?:you play me|I'm played|this is played|you play this)/i.test(t)) d.push('jugar');
  if (/\[Deathknell\]|When I die/i.test(t)) d.push('morir');
  if (/When I attack|When I (?:attack or defend|defend or attack)/i.test(t)) d.push('atacar');
  if (/When I defend|When I (?:attack or defend|defend or attack)/i.test(t)) d.push('defender');
  if (/When (?:I|you) hold|When you (?:conquer or hold|hold or conquer)/i.test(t)) d.push('hold');
  if (/When (?:I|you) conquer|When you (?:conquer or hold|hold or conquer)/i.test(t))
    d.push('conquer');
  if (/At the start of your (?:turn|Beginning Phase|Main Phase)/i.test(t)) d.push('inicio');
  return d;
}

// ── Estado ─────────────────────────────────────────────────────────────────────────────

/** Lo que el motor necesita saber de una carta, copiado del catálogo al crear la partida. */
export interface Ficha {
  id: string;
  nombre: string;
  tipo: string;
  /** Unidad con supertipo Champion. */
  campeon: boolean;
  energia: number;
  poder: number;
  dominios: string[];
  fuerza: number;
  texto: string;
  kw: PalabrasClave;
  disparadores: Disparador[];
}

export interface Copia {
  /** Único dentro de la partida. */
  uid: number;
  id: string;
  ficha: Ficha;
  agotada: boolean;
  danio: number;
  buffs: number;
  aturdida: boolean;
  /** Ronda en la que se ocultó (Hidden): se puede jugar gratis a partir de la siguiente. */
  ocultaDesde: number | null;
}

/** Unidad del rival: una ficha con fuerza, opcionalmente con Tank o Ganking. */
export interface Rival {
  uid: number;
  nombre: string;
  fuerza: number;
  tank: boolean;
  ganking: boolean;
  agotada: boolean;
  danio: number;
}

export interface Campo {
  id: string;
  /** Quién aportó el campo (en 1v1 cada jugador pone uno). */
  de: 'yo' | 'rival';
  control: 'yo' | 'rival' | null;
  unidades: Copia[];
  rival: Rival[];
  /** Ronda en la que cada jugador puntuó aquí por última vez (CR 470: una vez por turno). */
  puntuado: { yo: number | null; rival: number | null };
  /** Carta boca abajo (Hidden). Como mucho una (CR 107.3.b). */
  oculta: Copia | null;
}

export interface Enfrentamiento {
  campo: 0 | 1;
  tipo: 'conquista' | 'combate';
  atacante: 'yo' | 'rival';
}

export interface Recordatorio {
  id: number;
  titulo: string;
  texto: string;
}

export interface Pozo {
  energia: number;
  /** Poder por dominio. */
  poder: Record<string, number>;
}

export type Fase = 'mulligan' | 'principal' | 'rival' | 'fin';

export type ZonaSim =
  | 'mano'
  | 'base'
  | 'cementerio'
  | 'desterradas'
  | 'runas'
  | 'campeon'
  | 'campo0'
  | 'campo1'
  | 'oculta0'
  | 'oculta1';

export interface Partida {
  mazo: Copia[];
  mazoRunas: Copia[];
  mano: Copia[];
  base: Copia[];
  cementerio: Copia[];
  desterradas: Copia[];
  runas: Copia[];
  /** El Campeón elegido empieza en su zona y se juega desde ahí (CR 108.3). */
  campeon: Copia[];
  campos: [Campo, Campo];
  /** Mis tres campos del mazo; en 1v1 solo uno entra en juego (CR 485.5). */
  camposMios: string[];
  rivalBase: Rival[];
  /** Número de mi turno (1 en mi primer turno). */
  turno: number;
  /** Cuenta turnos de los dos jugadores; sirve para "una vez por turno". */
  ronda: number;
  fase: Fase;
  puntos: number;
  puntosRival: number;
  xp: number;
  empiezoYo: boolean;
  pozo: Pozo;
  /** Cartas del mazo principal que he jugado este turno (Legion, CR 812). */
  jugadasEsteTurno: number;
  enfrentamiento: Enfrentamiento | null;
  /** Vision pendiente de resolver: la primera carta del mazo se mira y se decide. */
  pendiente: { tipo: 'vision'; de: string } | null;
  recordatorios: Recordatorio[];
  ganador: 'yo' | 'rival' | null;
  /** Último aviso para la interfaz (acción ilegal, coste no pagable…). */
  aviso: string | null;
  log: string[];
  siguienteUid: number;
}

export const MANO_INICIAL = 4;
export const MULLIGAN_MAX = 2;
export const RUNAS_POR_TURNO = 2;
export const PUNTOS_PARA_GANAR = 8;

export type Catalogo = (id: string) => CatalogCard | undefined;

export function barajar<T>(lista: readonly T[], azar: () => number = Math.random): T[] {
  const a = [...lista];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(azar() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function ficha(id: string, carta: CatalogCard | undefined): Ficha {
  return {
    id,
    nombre: carta?.name ?? id,
    tipo: carta?.type ?? 'Unit',
    campeon: carta?.supertype === 'Champion',
    energia: carta?.energy ?? 0,
    poder: carta?.power ?? 0,
    dominios: carta?.domains ?? [],
    fuerza: carta?.might ?? 0,
    texto: carta?.text ?? '',
    kw: palabrasClave(carta?.text),
    disparadores: disparadores(carta?.text),
  };
}

/** Avisos de construcción del mazo según CR 101-103 (no impiden jugar). */
export function validarMazo(m: Mazo, carta: Catalogo): string[] {
  const avisos: string[] = [];
  const total = Object.values(m.principal).reduce((a, b) => a + b, 0) + (m.campeon ? 1 : 0);
  if (total < TAMANO_PRINCIPAL)
    avisos.push(`El mazo principal tiene ${total} cartas; mínimo ${TAMANO_PRINCIPAL}.`);
  const runas = Object.values(m.runas).reduce((a, b) => a + b, 0);
  if (runas !== TAMANO_RUNAS)
    avisos.push(`Hay ${runas} runas; deben ser exactamente ${TAMANO_RUNAS}.`);
  if (m.campos.length !== NUM_CAMPOS)
    avisos.push(`Hay ${m.campos.length} campos de batalla; deben ser ${NUM_CAMPOS}.`);
  const nombresCampos = new Set(m.campos.map((id) => carta(id)?.name ?? id));
  if (nombresCampos.size !== m.campos.length)
    avisos.push('Los campos de batalla no pueden repetir nombre.');
  const leyenda = m.leyenda ? carta(m.leyenda) : undefined;
  if (!leyenda) avisos.push('Falta la leyenda.');
  const campeon = m.campeon ? carta(m.campeon) : undefined;
  if (!campeon) avisos.push('Falta el campeón elegido.');
  else if (leyenda && !campeon.tags.some((t) => leyenda.tags.includes(t))) {
    avisos.push(`${campeon.name} no comparte etiqueta de campeón con ${leyenda.name}.`);
  }
  const porNombre = new Map<string, number>();
  for (const [id, n] of Object.entries(m.principal)) {
    const c = carta(id);
    const nombre = nombreBase(c?.name ?? id);
    porNombre.set(nombre, (porNombre.get(nombre) ?? 0) + n);
    if (leyenda && c && c.domains.length && !c.domains.every((d) => leyenda.domains.includes(d))) {
      avisos.push(`${c.name} no es de los dominios de la leyenda.`);
    }
  }
  if (campeon)
    porNombre.set(nombreBase(campeon.name), (porNombre.get(nombreBase(campeon.name)) ?? 0) + 1);
  for (const [nombre, n] of porNombre) {
    if (n > MAX_COPIAS) avisos.push(`${nombre}: ${n} copias (máximo ${MAX_COPIAS}).`);
  }
  return avisos;
}

export function nuevaPartida(
  m: Mazo,
  carta: Catalogo,
  opciones: { empiezoYo?: boolean; campoRival?: string; campoMio?: string } = {},
  azar: () => number = Math.random,
): Partida {
  let uid = 0;
  const copia = (id: string): Copia => ({
    uid: ++uid,
    id,
    ficha: ficha(id, carta(id)),
    agotada: false,
    danio: 0,
    buffs: 0,
    aturdida: false,
    ocultaDesde: null,
  });
  const copias = (zona: Record<string, number>) =>
    Object.entries(zona).flatMap(([id, n]) => Array.from({ length: n }, () => copia(id)));
  const campo = (id: string, de: 'yo' | 'rival'): Campo => ({
    id,
    de,
    control: null,
    unidades: [],
    rival: [],
    puntuado: { yo: null, rival: null },
    oculta: null,
  });
  const mio =
    opciones.campoMio && m.campos.includes(opciones.campoMio)
      ? opciones.campoMio
      : (m.campos[Math.floor(azar() * Math.max(1, m.campos.length))] ?? '');
  const empiezoYo = opciones.empiezoYo ?? true;
  const p: Partida = {
    mazo: barajar(copias(m.principal), azar),
    mazoRunas: barajar(copias(m.runas), azar),
    mano: [],
    base: [],
    cementerio: [],
    desterradas: [],
    runas: [],
    campeon: m.campeon ? [copia(m.campeon)] : [],
    campos: [campo(mio, 'yo'), campo(opciones.campoRival ?? '', 'rival')],
    camposMios: [...m.campos],
    rivalBase: [],
    turno: 0,
    ronda: 0,
    fase: 'mulligan',
    puntos: 0,
    puntosRival: 0,
    xp: 0,
    empiezoYo,
    pozo: { energia: 0, poder: {} },
    jugadasEsteTurno: 0,
    enfrentamiento: null,
    pendiente: null,
    recordatorios: [],
    ganador: null,
    aviso: null,
    log: [
      `Partida nueva (1v1). Robas ${MANO_INICIAL}. Mulligan: elige hasta ${MULLIGAN_MAX} cartas para reciclar y robar otras tantas.`,
    ],
    siguienteUid: uid,
  };
  return robar(p, MANO_INICIAL, false);
}

// ── Utilidades internas ────────────────────────────────────────────────────────────────

const anota = (p: Partida, texto: string): Partida => ({
  ...p,
  log: [...p.log, texto],
  aviso: null,
});
const rechaza = (p: Partida, aviso: string): Partida => ({ ...p, aviso });

function recordar(p: Partida, titulo: string, texto: string): Partida {
  const id = p.siguienteUid + 1;
  return {
    ...p,
    siguienteUid: id,
    recordatorios: [...p.recordatorios, { id, titulo, texto }],
  };
}

export function cerrarRecordatorio(p: Partida, id: number): Partida {
  return { ...p, recordatorios: p.recordatorios.filter((r) => r.id !== id) };
}

export const ZONAS: ZonaSim[] = [
  'mano',
  'base',
  'cementerio',
  'desterradas',
  'runas',
  'campeon',
  'campo0',
  'campo1',
  'oculta0',
  'oculta1',
];

function lista(p: Partida, z: ZonaSim): Copia[] {
  switch (z) {
    case 'campo0':
      return p.campos[0].unidades;
    case 'campo1':
      return p.campos[1].unidades;
    case 'oculta0':
      return p.campos[0].oculta ? [p.campos[0].oculta] : [];
    case 'oculta1':
      return p.campos[1].oculta ? [p.campos[1].oculta] : [];
    default:
      return p[z];
  }
}

function conLista(p: Partida, z: ZonaSim, l: Copia[]): Partida {
  if (z === 'campo0' || z === 'campo1' || z === 'oculta0' || z === 'oculta1') {
    const i = z.endsWith('0') ? 0 : 1;
    const campos: [Campo, Campo] = [p.campos[0], p.campos[1]];
    campos[i] = z.startsWith('campo')
      ? { ...campos[i], unidades: l }
      : { ...campos[i], oculta: l[0] ?? null };
    return { ...p, campos };
  }
  return { ...p, [z]: l };
}

function conCampo(p: Partida, i: 0 | 1, c: Partial<Campo>): Partida {
  const campos: [Campo, Campo] = [p.campos[0], p.campos[1]];
  campos[i] = { ...campos[i], ...c };
  return { ...p, campos };
}

export function zonaDe(p: Partida, uid: number): ZonaSim | null {
  return ZONAS.find((z) => lista(p, z).some((c) => c.uid === uid)) ?? null;
}

export function copiaDe(p: Partida, uid: number): Copia | undefined {
  for (const z of ZONAS) {
    const c = lista(p, z).find((x) => x.uid === uid);
    if (c) return c;
  }
  return p.mazo.find((c) => c.uid === uid) ?? p.mazoRunas.find((c) => c.uid === uid);
}

function quitar(p: Partida, uid: number): [Partida, Copia | null, ZonaSim | null] {
  const z = zonaDe(p, uid);
  if (!z) return [p, null, null];
  const c = lista(p, z).find((x) => x.uid === uid)!;
  return [
    conLista(
      p,
      z,
      lista(p, z).filter((x) => x.uid !== uid),
    ),
    c,
    z,
  ];
}

/** Fuerza actual de una unidad mía: impresa + buffs (CR 703), nunca menos de 0 (CR 143.2.b). */
export function fuerzaDe(c: Copia, papel: 'ataca' | 'defiende' | null = null): number {
  const extra =
    papel === 'ataca' ? c.ficha.kw.assault : papel === 'defiende' ? c.ficha.kw.shield : 0;
  return Math.max(0, c.ficha.fuerza + c.buffs + extra);
}

function esMiTurno(p: Partida): boolean {
  return p.fase === 'principal';
}

/** Mis unidades en juego, con su zona. */
function enJuego(p: Partida): { c: Copia; z: ZonaSim }[] {
  return (['base', 'campo0', 'campo1'] as const).flatMap((z) => lista(p, z).map((c) => ({ c, z })));
}

/** Limpieza (CR 323): muertes por daño letal, pérdida de control y victoria. */
function limpieza(p: Partida): Partida {
  let s = p;
  // 3b. Daño letal: daño distinto de 0 e igual o mayor que la fuerza (CR 142.4.b).
  for (const { c } of enJuego(s)) {
    if (c.ficha.tipo === 'Unit' && c.danio > 0 && c.danio >= fuerzaDe(c))
      s = matar(s, c.uid, 'por el daño');
  }
  for (const i of [0, 1] as const) {
    for (const r of s.campos[i].rival)
      if (r.danio > 0 && r.danio >= r.fuerza) s = rivalQuitar(s, r.uid, 'muere');
  }
  for (const r of s.rivalBase)
    if (r.danio > 0 && r.danio >= r.fuerza) s = rivalQuitar(s, r.uid, 'muere');
  // 4. Se pierde el control de un campo sin unidades si no hay enfrentamiento (CR 190.4.c).
  if (!s.enfrentamiento) {
    for (const i of [0, 1] as const) {
      const c = s.campos[i];
      if (c.control === 'yo' && !c.unidades.length)
        s = anota(
          conCampo(s, i, { control: null }),
          `Pierdes el control de ${nombreCampo(s, i)}: no te quedan unidades.`,
        );
      if (c.control === 'rival' && !c.rival.length)
        s = anota(
          conCampo(s, i, { control: null }),
          `El rival pierde el control de ${nombreCampo(s, i)}.`,
        );
      // Las cartas ocultas en un campo que ya no controlas van al cementerio (CR 323.7).
      if (s.campos[i].oculta && s.campos[i].control !== 'yo') {
        const oc = s.campos[i].oculta!;
        s = conLista(s, i === 0 ? 'oculta0' : 'oculta1', []);
        s = anota(
          { ...s, cementerio: [...s.cementerio, { ...oc, ocultaDesde: null }] },
          `${oc.ficha.nombre} estaba oculta en un campo que ya no controlas: al cementerio.`,
        );
      }
    }
  }
  // 1. Victoria (CR 194.2).
  if (!s.ganador) {
    if (s.puntos >= PUNTOS_PARA_GANAR && s.puntos > s.puntosRival)
      s = anota({ ...s, ganador: 'yo', fase: 'fin' }, `¡Has ganado con ${s.puntos} puntos!`);
    else if (s.puntosRival >= PUNTOS_PARA_GANAR && s.puntosRival > s.puntos)
      s = anota(
        { ...s, ganador: 'rival', fase: 'fin' },
        `El rival gana con ${s.puntosRival} puntos.`,
      );
  }
  return s;
}

export function nombreCampo(p: Partida, i: 0 | 1): string {
  return p.campos[i].id ? `el campo ${i + 1}` : `el campo ${i + 1} (sin carta)`;
}

// ── Robar, canalizar, mulligan ─────────────────────────────────────────────────────────

export function robar(p: Partida, n = 1, anotar = true): Partida {
  let s = p;
  let faltan = n;
  while (faltan > 0) {
    const n2 = Math.min(faltan, s.mazo.length);
    s = { ...s, mazo: s.mazo.slice(n2), mano: [...s.mano, ...s.mazo.slice(0, n2)] };
    faltan -= n2;
    if (faltan > 0) {
      // Burn Out (CR 431): el cementerio vuelve barajado al mazo y el rival gana 1 punto.
      if (!s.cementerio.length) {
        s = anota(
          s,
          'Burn Out: no quedan cartas ni en el mazo ni en el cementerio. El rival gana 1 punto.',
        );
        s = { ...s, puntosRival: s.puntosRival + 1 };
        if (s.puntosRival >= PUNTOS_PARA_GANAR && s.puntosRival > s.puntos) return limpieza(s);
        continue;
      }
      s = anota(
        { ...s, mazo: barajar(s.cementerio), cementerio: [], puntosRival: s.puntosRival + 1 },
        `Burn Out: barajas el cementerio en el mazo y el rival gana 1 punto (CR 431).`,
      );
    }
  }
  return anotar ? anota(s, n === 1 ? 'Robas 1.' : `Robas ${n}.`) : s;
}

export function canalizar(p: Partida, n = RUNAS_POR_TURNO): Partida {
  const n2 = Math.min(n, p.mazoRunas.length);
  const nuevas = p.mazoRunas.slice(0, n2).map((r) => ({ ...r, agotada: false }));
  const s = { ...p, mazoRunas: p.mazoRunas.slice(n2), runas: [...p.runas, ...nuevas] };
  return anota(
    s,
    n2 ? `Canalizas ${n2} runa${n2 === 1 ? '' : 's'}.` : 'No quedan runas que canalizar.',
  );
}

/** Mulligan (CR 117): hasta 2 cartas se apartan, robas otras tantas y las apartadas se reciclan. */
export function mulligan(p: Partida, uids: number[]): Partida {
  if (p.fase !== 'mulligan') return rechaza(p, 'El mulligan ya se hizo.');
  if (uids.length > MULLIGAN_MAX)
    return rechaza(
      p,
      `Solo puedes cambiar hasta ${MULLIGAN_MAX} cartas en el mulligan (CR 117.1).`,
    );
  const apartadas = p.mano.filter((c) => uids.includes(c.uid));
  let s: Partida = { ...p, mano: p.mano.filter((c) => !uids.includes(c.uid)) };
  s = robar(s, apartadas.length, false);
  s = { ...s, mazo: [...s.mazo, ...apartadas] };
  s = anota(
    s,
    apartadas.length
      ? `Mulligan: cambias ${apartadas.length} y las reciclas al fondo.`
      : 'Te quedas la mano.',
  );
  return p.empiezoYo ? empezarTurno(s) : empezarTurnoRival(s);
}

// ── Turnos (CR 314-317) ────────────────────────────────────────────────────────────────

function empezarTurno(p: Partida): Partida {
  let s: Partida = {
    ...p,
    fase: 'principal',
    turno: p.turno + 1,
    ronda: p.ronda + 1,
    jugadasEsteTurno: 0,
    enfrentamiento: null,
  };
  s = anota(s, `── Turno ${s.turno} (tuyo) ──`);
  // Despertar (CR 315.1): se prepara todo lo que controlo.
  s = {
    ...s,
    runas: s.runas.map((r) => ({ ...r, agotada: false })),
    base: s.base.map((c) => ({ ...c, agotada: false })),
    campos: [
      { ...s.campos[0], unidades: s.campos[0].unidades.map((c) => ({ ...c, agotada: false })) },
      { ...s.campos[1], unidades: s.campos[1].unidades.map((c) => ({ ...c, agotada: false })) },
    ],
  };
  s = anota(s, 'Despertar: preparas tus runas, unidades y equipo.');
  // Inicio: Temporary muere antes de puntuar (CR 816); recordatorios de "al inicio de tu turno".
  for (const { c } of enJuego(s)) {
    if (c.ficha.kw.temporary) s = matar(s, c.uid, 'Temporary');
    else if (c.ficha.disparadores.includes('inicio'))
      s = recordar(s, c.ficha.nombre, c.ficha.texto);
  }
  // Puntuación: Hold de cada campo que controlo (CR 315.2.b, 469.2).
  for (const i of [0, 1] as const) if (s.campos[i].control === 'yo') s = puntuar(s, i, 'hold');
  // Canalizar 2; el segundo jugador canaliza 3 en su primer turno (CR 485.7).
  s = canalizar(s, RUNAS_POR_TURNO + (!s.empiezoYo && s.turno === 1 ? 1 : 0));
  // Robar 1 (CR 315.4), con Burn Out si hace falta.
  s = robar(s, 1);
  // El pozo se vacía al empezar la fase principal (CR 316.3).
  s = { ...s, pozo: { energia: 0, poder: {} } };
  return limpieza(anota(s, 'Fase principal: juega cartas, mueve unidades o termina el turno.'));
}

export function terminarTurno(p: Partida): Partida {
  if (p.fase !== 'principal') return rechaza(p, 'No es tu fase principal.');
  if (p.enfrentamiento) return rechaza(p, 'Resuelve antes el enfrentamiento.');
  if (p.pendiente) return rechaza(p, 'Resuelve antes la Vision pendiente.');
  // Fin (CR 317.2): se cura todo, expiran los efectos del turno y el pozo se vacía.
  let s = curarTodo(p);
  s = { ...s, pozo: { energia: 0, poder: {} } };
  s = anota(s, 'Fin de tu turno: se cura el daño y se vacía el pozo.');
  return empezarTurnoRival(s);
}

function curarTodo(p: Partida): Partida {
  const cura = (l: Copia[]) => l.map((c) => ({ ...c, danio: 0, aturdida: false }));
  const curaR = (l: Rival[]) => l.map((r) => ({ ...r, danio: 0 }));
  return {
    ...p,
    base: cura(p.base),
    rivalBase: curaR(p.rivalBase),
    campos: [
      { ...p.campos[0], unidades: cura(p.campos[0].unidades), rival: curaR(p.campos[0].rival) },
      { ...p.campos[1], unidades: cura(p.campos[1].unidades), rival: curaR(p.campos[1].rival) },
    ],
  };
}

function empezarTurnoRival(p: Partida): Partida {
  let s: Partida = { ...p, fase: 'rival', ronda: p.ronda + 1, enfrentamiento: null };
  s = anota(s, `── Turno del rival ──`);
  const prep = (l: Rival[]) => l.map((r) => ({ ...r, agotada: false }));
  s = {
    ...s,
    rivalBase: prep(s.rivalBase),
    campos: [
      { ...s.campos[0], rival: prep(s.campos[0].rival) },
      { ...s.campos[1], rival: prep(s.campos[1].rival) },
    ],
  };
  for (const i of [0, 1] as const)
    if (s.campos[i].control === 'rival') s = puntuarRival(s, i, 'hold');
  return limpieza(
    anota(s, 'El rival prepara sus unidades. Mueve sus fichas por él y termina su turno.'),
  );
}

export function terminarTurnoRival(p: Partida): Partida {
  if (p.fase !== 'rival') return rechaza(p, 'No es el turno del rival.');
  if (p.enfrentamiento) return rechaza(p, 'Resuelve antes el enfrentamiento.');
  return empezarTurno(curarTodo(p));
}

// ── Puntuación (CR 467-472) ────────────────────────────────────────────────────────────

function puntuar(p: Partida, i: 0 | 1, motivo: 'hold' | 'conquista'): Partida {
  const campo = p.campos[i];
  if (campo.puntuado.yo === p.ronda) return p;
  let s = conCampo(p, i, { puntuado: { ...campo.puntuado, yo: p.ronda } });
  // Hunt (CR 823): XP al conquistar o mantener.
  const xp = campo.unidades.reduce((t, c) => t + c.ficha.kw.hunt, 0);
  if (xp) s = anota({ ...s, xp: s.xp + xp }, `Hunt: ganas ${xp} XP.`);
  for (const c of campo.unidades) {
    if (c.ficha.disparadores.includes(motivo === 'hold' ? 'hold' : 'conquer'))
      s = recordar(s, c.ficha.nombre, c.ficha.texto);
  }
  // El punto final por conquista exige haber puntuado todos los campos este turno (CR 471.1.b).
  if (motivo === 'conquista' && s.puntos >= PUNTOS_PARA_GANAR - 1) {
    const todos = s.campos.every((c) => c.puntuado.yo === s.ronda);
    if (!todos)
      return robar(
        anota(
          s,
          'Conquista a 1 punto de ganar sin haber puntuado todos los campos este turno: en vez del punto, robas 1 (CR 471.1.b).',
        ),
        1,
        false,
      );
  }
  s = { ...s, puntos: Math.min(PUNTOS_PARA_GANAR, s.puntos + 1) };
  return anota(
    s,
    motivo === 'hold'
      ? `Hold: mantienes el campo ${i + 1}, +1 punto (${s.puntos}).`
      : `¡Conquista del campo ${i + 1}! +1 punto (${s.puntos}).`,
  );
}

function puntuarRival(p: Partida, i: 0 | 1, motivo: 'hold' | 'conquista'): Partida {
  const campo = p.campos[i];
  if (campo.puntuado.rival === p.ronda) return p;
  let s = conCampo(p, i, { puntuado: { ...campo.puntuado, rival: p.ronda } });
  if (
    motivo === 'conquista' &&
    s.puntosRival >= PUNTOS_PARA_GANAR - 1 &&
    !s.campos.every((c) => c.puntuado.rival === s.ronda)
  ) {
    return anota(
      s,
      'El rival conquista a 1 punto de ganar sin haber puntuado todos los campos: robaría en vez de puntuar.',
    );
  }
  s = { ...s, puntosRival: Math.min(PUNTOS_PARA_GANAR, s.puntosRival + 1) };
  return anota(
    s,
    motivo === 'hold'
      ? `El rival mantiene el campo ${i + 1}: +1 punto (${s.puntosRival}).`
      : `El rival conquista el campo ${i + 1}: +1 punto (${s.puntosRival}).`,
  );
}

/** Ajuste manual del marcador (por efectos de cartas que dan o quitan puntos). */
export function fijarPuntos(p: Partida, quien: 'yo' | 'rival', n: number): Partida {
  const v = Math.max(0, Math.min(PUNTOS_PARA_GANAR, n));
  return limpieza(
    anota(
      quien === 'yo' ? { ...p, puntos: v } : { ...p, puntosRival: v },
      `${quien === 'yo' ? 'Tus puntos' : 'Puntos del rival'}: ${v}.`,
    ),
  );
}

// ── Pozo de runas (CR 160-168) ─────────────────────────────────────────────────────────

function runasListas(p: Partida): Copia[] {
  return p.runas.filter((r) => !r.agotada);
}

/** Agota una runa preparada: +1 de energía al pozo. */
export function anadirEnergia(p: Partida, uid?: number): Partida {
  const r = uid ? p.runas.find((x) => x.uid === uid && !x.agotada) : runasListas(p)[0];
  if (!r) return rechaza(p, 'No tienes runas preparadas.');
  const s = {
    ...p,
    runas: p.runas.map((x) => (x.uid === r.uid ? { ...x, agotada: true } : x)),
    pozo: { ...p.pozo, energia: p.pozo.energia + 1 },
  };
  return anota(s, `Agotas una runa: +1 de energía (pozo: ${s.pozo.energia}).`);
}

/** Recicla una runa preparada: +1 de poder de su dominio. */
export function anadirPoder(p: Partida, uid?: number): Partida {
  const r = uid ? p.runas.find((x) => x.uid === uid && !x.agotada) : runasListas(p)[0];
  if (!r) return rechaza(p, 'No tienes runas preparadas.');
  const dom = r.ficha.dominios[0] ?? 'Any';
  const s = {
    ...p,
    runas: p.runas.filter((x) => x.uid !== r.uid),
    mazoRunas: [...p.mazoRunas, { ...r, agotada: false }],
    pozo: { ...p.pozo, poder: { ...p.pozo.poder, [dom]: (p.pozo.poder[dom] ?? 0) + 1 } },
  };
  return anota(s, `Reciclas una runa de ${dom}: +1 de poder de ${dom}.`);
}

interface Coste {
  energia: number;
  poder: number;
  /** Dominios válidos para el poder; vacío = cualquiera. */
  dominios: string[];
}

/** Cuántas runas preparadas sirven para un dominio. */
function runasPara(p: Partida, dominios: string[]): Copia[] {
  return runasListas(p).filter(
    (r) => !dominios.length || r.ficha.dominios.some((d) => dominios.includes(d)),
  );
}

function poderEnPozo(p: Partida, dominios: string[]): number {
  return Object.entries(p.pozo.poder).reduce(
    (t, [d, n]) => t + (!dominios.length || dominios.includes(d) || d === 'Any' ? n : 0),
    0,
  );
}

/** Por qué no se puede pagar, o null si se puede (pozo primero, luego runas preparadas). */
function porQueNoPagar(p: Partida, coste: Coste): string | null {
  const listas = runasListas(p);
  const poderFalta = Math.max(0, coste.poder - poderEnPozo(p, coste.dominios));
  const runasPoder = runasPara(p, coste.dominios);
  if (runasPoder.length < poderFalta) {
    return `falta poder de ${coste.dominios.join('/') || 'cualquier dominio'}: necesitas ${coste.poder} y tienes ${poderEnPozo(p, coste.dominios)} en el pozo y ${runasPoder.length} runa(s) de ese dominio preparadas`;
  }
  const energiaFalta = Math.max(0, coste.energia - p.pozo.energia);
  if (listas.length - poderFalta < energiaFalta) {
    return `falta energía: cuesta ${coste.energia} y tienes ${p.pozo.energia} en el pozo y ${listas.length - poderFalta} runa(s) preparadas disponibles`;
  }
  return null;
}

function pagar(p: Partida, coste: Coste): Partida {
  let s = p;
  // Poder: primero del pozo, luego reciclando runas del dominio (CR 164.2.b).
  let poder = coste.poder;
  const pozoPoder = { ...s.pozo.poder };
  for (const d of Object.keys(pozoPoder)) {
    if (!coste.dominios.length || coste.dominios.includes(d) || d === 'Any') {
      const usa = Math.min(poder, pozoPoder[d]);
      pozoPoder[d] -= usa;
      poder -= usa;
    }
  }
  s = { ...s, pozo: { ...s.pozo, poder: pozoPoder } };
  for (let k = 0; k < poder; k++) {
    const r = runasPara(s, coste.dominios)[0];
    s = {
      ...s,
      runas: s.runas.filter((x) => x.uid !== r.uid),
      mazoRunas: [...s.mazoRunas, { ...r, agotada: false }],
    };
  }
  // Energía: del pozo y agotando runas (CR 164.2.a).
  let energia = coste.energia;
  const delPozo = Math.min(energia, s.pozo.energia);
  energia -= delPozo;
  s = { ...s, pozo: { ...s.pozo, energia: s.pozo.energia - delPozo } };
  for (let k = 0; k < energia; k++) {
    const r = runasListas(s)[0];
    s = { ...s, runas: s.runas.map((x) => (x.uid === r.uid ? { ...x, agotada: true } : x)) };
  }
  return s;
}

// ── Jugar cartas (CR 349-358, 419) ─────────────────────────────────────────────────────

export type DestinoJuego = 'base' | 'campo0' | 'campo1';

/** Coste real de jugar una copia (gratis desde Hidden, CR 811). */
export function costeDe(p: Partida, c: Copia, acelerar = false): Coste {
  const z = zonaDe(p, c.uid);
  const oculta = z === 'oculta0' || z === 'oculta1';
  const base: Coste = oculta
    ? { energia: 0, poder: 0, dominios: c.ficha.dominios }
    : { energia: c.ficha.energia, poder: c.ficha.poder, dominios: c.ficha.dominios };
  return acelerar ? { ...base, energia: base.energia + 1, poder: base.poder + 1 } : base;
}

/** Razón por la que no se puede jugar ahora una copia en ese destino, o null si es legal. */
export function porQueNoJugar(
  p: Partida,
  c: Copia,
  destino: DestinoJuego,
  acelerar = false,
): string | null {
  const z = zonaDe(p, c.uid);
  if (p.ganador) return 'La partida ha terminado.';
  if (!z || !['mano', 'campeon', 'oculta0', 'oculta1'].includes(z))
    return 'Solo se juega desde la mano, la zona del campeón o una carta oculta (CR 419.1.a).';
  const oculta = z === 'oculta0' || z === 'oculta1';
  if (oculta && c.ocultaDesde === p.ronda)
    return 'Una carta oculta se puede jugar a partir del turno siguiente (CR 811).';
  if (p.pendiente) return 'Resuelve antes la Vision pendiente.';
  const kw = c.ficha.kw;
  const ambushAqui =
    kw.ambush && destino !== 'base' && p.campos[destino === 'campo0' ? 0 : 1].unidades.length > 0;
  const reaccion = kw.reaction || oculta || (kw.quickDraw && c.ficha.tipo === 'Gear') || ambushAqui;
  const accion = kw.action || reaccion;
  if (p.fase === 'rival') {
    if (!accion)
      return 'En el turno del rival solo se juegan cartas con Action o Reaction, y solo en enfrentamientos (CR 806/813).';
    if (!p.enfrentamiento)
      return 'Fuera de un enfrentamiento no puedes jugar en el turno del rival (CR 310.1.a).';
  } else if (p.fase !== 'principal') {
    return 'Solo se juega en la fase principal.';
  } else if (p.enfrentamiento && !accion) {
    return 'Durante un enfrentamiento solo se juegan cartas con Action o Reaction (CR 308.1.a).';
  }
  if (c.ficha.tipo === 'Spell' && destino !== 'base')
    return 'Los hechizos no van a un campo: se resuelven y van al cementerio.';
  if (c.ficha.tipo === 'Gear' && destino !== 'base' && !oculta)
    return 'El equipo solo se juega en la base (CR 148).';
  if (c.ficha.tipo === 'Unit' && destino !== 'base') {
    const i = destino === 'campo0' ? 0 : 1;
    const campo = p.campos[i];
    const desdeOculta = oculta && z === `oculta${i}`;
    if (campo.control !== 'yo' && !ambushAqui && !desdeOculta) {
      return `Una unidad solo se juega en tu base o en un campo que controles (CR 355.2.a)${kw.ambush ? '; con Ambush, también donde tengas unidades' : ''}.`;
    }
    if (p.enfrentamiento && p.enfrentamiento.campo !== i)
      return 'Hay un enfrentamiento en el otro campo: resuélvelo antes.';
  }
  if (oculta && c.ficha.tipo !== 'Spell' && destino !== (z === 'oculta0' ? 'campo0' : 'campo1')) {
    return 'Una carta oculta se juega en el campo donde está oculta (CR 811.1.d.1).';
  }
  if (acelerar && !kw.accelerate) return 'Esta carta no tiene Accelerate.';
  if (acelerar && c.ficha.tipo !== 'Unit') return 'Accelerate es solo de unidades.';
  const falta = porQueNoPagar(p, costeDe(p, c, acelerar));
  return falta ? `No puedes pagar ${c.ficha.nombre}: ${falta}.` : null;
}

export function jugar(p: Partida, uid: number, destino: DestinoJuego, acelerar = false): Partida {
  const c = copiaDe(p, uid);
  if (!c) return p;
  const razon = porQueNoJugar(p, c, destino, acelerar);
  if (razon) return rechaza(p, razon);
  const coste = costeDe(p, c, acelerar);
  let s = pagar(p, coste);
  const [sinCarta] = quitar(s, uid);
  s = sinCarta;
  const pagado =
    coste.energia || coste.poder
      ? ` (${coste.energia}⚡${coste.poder ? ` ${coste.poder}✦` : ''})`
      : '';
  s = { ...s, jugadasEsteTurno: s.jugadasEsteTurno + 1 };
  const nueva: Copia = {
    ...c,
    agotada: c.ficha.tipo === 'Unit' ? !acelerar : false,
    danio: 0,
    buffs: 0,
    aturdida: false,
    ocultaDesde: null,
  };
  if (c.ficha.tipo === 'Spell') {
    s = anota(
      { ...s, cementerio: [...s.cementerio, nueva] },
      `Juegas el hechizo ${c.ficha.nombre}${pagado}: resuelve su efecto y va al cementerio.`,
    );
    s = recordar(s, `Efecto de ${c.ficha.nombre}`, c.ficha.texto);
  } else {
    const z: ZonaSim = c.ficha.tipo === 'Gear' && destino === 'base' ? 'base' : destino;
    s = conLista(s, z, [...lista(s, z), nueva]);
    s = anota(
      s,
      `Juegas ${c.ficha.nombre}${pagado} en ${destino === 'base' ? 'tu base' : `el campo ${destino === 'campo0' ? 1 : 2}`}${c.ficha.tipo === 'Unit' ? (acelerar ? ', preparada (Accelerate)' : ', agotada (CR 143.4)') : ''}.`,
    );
    if (c.ficha.disparadores.includes('jugar') || c.ficha.kw.weaponmaster)
      s = recordar(s, `Al jugar ${c.ficha.nombre}`, c.ficha.texto);
    if (c.ficha.kw.vision)
      s = anota(
        { ...s, pendiente: { tipo: 'vision', de: c.ficha.nombre } },
        `Vision: mira la primera carta del mazo y decide si la reciclas.`,
      );
    if (destino !== 'base') s = contestar(s, destino === 'campo0' ? 0 : 1, 'yo');
  }
  if (c.ficha.kw.legion)
    s = anota(
      s,
      s.jugadasEsteTurno > 1
        ? 'Legion activa: ya habías jugado otra carta este turno.'
        : 'Legion inactiva: es la primera carta que juegas este turno.',
    );
  return limpieza(s);
}

export function resolverVision(p: Partida, reciclar: boolean): Partida {
  if (!p.pendiente) return p;
  const arriba = p.mazo[0];
  let s: Partida = { ...p, pendiente: null };
  if (arriba && reciclar)
    s = anota(
      { ...s, mazo: [...s.mazo.slice(1), arriba] },
      `Vision: reciclas ${arriba.ficha.nombre} al fondo.`,
    );
  else
    s = anota(
      s,
      arriba ? `Vision: dejas ${arriba.ficha.nombre} arriba.` : 'Vision: el mazo está vacío.',
    );
  return s;
}

/** Hidden (CR 811): paga 1 de poder y pon la carta boca abajo en un campo que controles. */
export function ocultar(p: Partida, uid: number, i: 0 | 1): Partida {
  const c = copiaDe(p, uid);
  if (!c) return p;
  const z = zonaDe(p, uid);
  if (!c.ficha.kw.hidden) return rechaza(p, `${c.ficha.nombre} no tiene Hidden.`);
  if (z !== 'mano' && z !== 'campeon')
    return rechaza(p, 'Solo se ocultan cartas de la mano o del campeón.');
  if (p.fase !== 'principal' || p.enfrentamiento)
    return rechaza(p, 'Solo puedes ocultar en tu fase principal, fuera de enfrentamientos.');
  if (p.campos[i].control !== 'yo')
    return rechaza(p, 'Solo puedes ocultar en un campo que controles.');
  if (p.campos[i].oculta) return rechaza(p, 'Ese campo ya tiene una carta oculta (CR 107.3.b).');
  const coste: Coste = { energia: 0, poder: 1, dominios: [] };
  const falta = porQueNoPagar(p, coste);
  if (falta) return rechaza(p, `No puedes pagar el coste de ocultar: ${falta}.`);
  let s = pagar(p, coste);
  [s] = quitar(s, uid);
  s = conLista(s, i === 0 ? 'oculta0' : 'oculta1', [{ ...c, ocultaDesde: s.ronda }]);
  return anota(
    s,
    `Ocultas ${c.ficha.nombre} en el campo ${i + 1} (1✦). Podrás jugarla gratis a partir del turno que viene.`,
  );
}

// ── Movimiento (CR 144, 445-453) ───────────────────────────────────────────────────────

export type DestinoMovimiento = 'base' | 'campo0' | 'campo1';

export function porQueNoMover(
  p: Partida,
  uids: number[],
  destino: DestinoMovimiento,
): string | null {
  if (p.ganador) return 'La partida ha terminado.';
  if (p.fase !== 'principal') return 'Solo puedes mover en tu fase principal (CR 144.1.a).';
  if (p.enfrentamiento) return 'No se mueve durante un enfrentamiento o combate (CR 144.1.c).';
  if (!uids.length) return 'Elige alguna unidad.';
  for (const uid of uids) {
    const c = copiaDe(p, uid);
    const z = zonaDe(p, uid);
    if (!c || !z || !['base', 'campo0', 'campo1'].includes(z))
      return 'Solo se mueven unidades en juego.';
    if (c.ficha.tipo !== 'Unit')
      return `${c.ficha.nombre} no es una unidad: el equipo no se mueve.`;
    if (c.agotada)
      return `${c.ficha.nombre} está agotada: mover cuesta agotar la unidad (CR 144.2).`;
    if (z === destino) return `${c.ficha.nombre} ya está ahí.`;
    if (z !== 'base' && destino !== 'base' && !c.ficha.kw.ganking)
      return `${c.ficha.nombre} no puede ir de un campo a otro sin Ganking (CR 144.4).`;
  }
  return null;
}

export function mover(p: Partida, uids: number[], destino: DestinoMovimiento): Partida {
  const razon = porQueNoMover(p, uids, destino);
  if (razon) return rechaza(p, razon);
  let s = p;
  const nombres: string[] = [];
  for (const uid of uids) {
    const [sin, c] = quitar(s, uid);
    s = conLista(sin, destino, [...lista(sin, destino), { ...c!, agotada: true }]);
    nombres.push(c!.ficha.nombre);
  }
  s = anota(
    s,
    `Mueves ${nombres.join(', ')} a ${destino === 'base' ? 'tu base' : `el campo ${destino === 'campo0' ? 1 : 2}`} (se agotan).`,
  );
  if (destino !== 'base') s = contestar(s, destino === 'campo0' ? 0 : 1, 'yo');
  return limpieza(s);
}

/** Aplica el estado "disputado" (CR 190.3): abre un enfrentamiento de conquista o un combate. */
function contestar(p: Partida, i: 0 | 1, quien: 'yo' | 'rival'): Partida {
  const campo = p.campos[i];
  if (p.enfrentamiento) return p;
  if (quien === 'yo') {
    if (campo.rival.length)
      return anota(
        { ...p, enfrentamiento: { campo: i, tipo: 'combate', atacante: 'yo' } },
        `¡Combate en el campo ${i + 1}! Atacas con ${campo.unidades.length} unidad(es) contra ${campo.rival.length}. Puedes jugar Action/Reaction; luego resuélvelo.`,
      );
    if (campo.control !== 'yo')
      return anota(
        { ...p, enfrentamiento: { campo: i, tipo: 'conquista', atacante: 'yo' } },
        `Enfrentamiento en el campo ${i + 1}: nadie lo defiende. Ventana para Action/Reaction; al cerrarla lo conquistas (CR 348.2).`,
      );
    return p;
  }
  if (campo.unidades.length)
    return anota(
      { ...p, enfrentamiento: { campo: i, tipo: 'combate', atacante: 'rival' } },
      `¡El rival ataca el campo ${i + 1}! Defiendes con ${campo.unidades.length} unidad(es). Puedes jugar Action/Reaction; luego resuélvelo.`,
    );
  if (campo.control !== 'rival')
    return anota(
      { ...p, enfrentamiento: { campo: i, tipo: 'conquista', atacante: 'rival' } },
      `El rival entra en el campo ${i + 1} sin defensa: al cerrar el enfrentamiento lo conquista.`,
    );
  return p;
}

// ── Enfrentamientos y combate (CR 341-348, 459-466) ────────────────────────────────────

export function resolverEnfrentamiento(p: Partida): Partida {
  const e = p.enfrentamiento;
  if (!e) return rechaza(p, 'No hay ningún enfrentamiento abierto.');
  if (p.pendiente) return rechaza(p, 'Resuelve antes la Vision pendiente.');
  const i = e.campo;
  let s: Partida = { ...p, enfrentamiento: null };
  const campo = s.campos[i];
  if (e.tipo === 'conquista' || !campo.unidades.length || !campo.rival.length) {
    return limpieza(establecerControl(s, i));
  }
  // Combate: fuerzas con Assault/Shield; las aturdidas no suman (CR 423.1.b).
  const yoAtaco = e.atacante === 'yo';
  const papel = yoAtaco ? 'ataca' : 'defiende';
  const miDanio = campo.unidades.reduce((t, c) => t + (c.aturdida ? 0 : fuerzaDe(c, papel)), 0);
  const suDanio = campo.rival.reduce((t, r) => t + r.fuerza, 0);
  for (const c of campo.unidades) {
    if (c.ficha.disparadores.includes(yoAtaco ? 'atacar' : 'defender'))
      s = recordar(s, c.ficha.nombre, c.ficha.texto);
  }
  // Asignación (CR 465.2.c): letal a una antes de pasar a otra; Tank primero, Backline al final.
  const rivalesOrden = [...campo.rival].sort(
    (a, b) => Number(b.tank) - Number(a.tank) || a.fuerza - b.fuerza,
  );
  const miasOrden = [...campo.unidades].sort(
    (a, b) =>
      Number(b.ficha.kw.tank) - Number(a.ficha.kw.tank) ||
      Number(a.ficha.kw.backline) - Number(b.ficha.kw.backline) ||
      fuerzaDe(a, papel) - fuerzaDe(b, papel),
  );
  const rivalesTras = asignar(
    rivalesOrden,
    miDanio,
    (r) => r.fuerza,
    (r) => r.danio,
  );
  const miasTras = asignar(
    miasOrden,
    suDanio,
    (c) => fuerzaDe(c, papel),
    (c) => c.danio,
  );
  s = conCampo(s, i, {
    unidades: campo.unidades.map((c) => ({ ...c, danio: miasTras.get(c.uid) ?? c.danio })),
    rival: campo.rival.map((r) => ({ ...r, danio: rivalesTras.get(r.uid) ?? r.danio })),
  });
  s = anota(
    s,
    `Daño de combate: tú ${miDanio} contra ellos, el rival ${suDanio} contra ti (CR 465).`,
  );
  s = limpieza(s);
  // Limpieza de combate (CR 466.1): se cura todo y, si quedan defensores, los atacantes vuelven a base.
  let c2 = s.campos[i];
  s = conCampo(s, i, {
    unidades: c2.unidades.map((c) => ({ ...c, danio: 0 })),
    rival: c2.rival.map((r) => ({ ...r, danio: 0 })),
  });
  c2 = s.campos[i];
  if (c2.unidades.length && c2.rival.length) {
    if (yoAtaco) {
      s = anota(
        { ...s, base: [...s.base, ...c2.unidades] },
        'Quedan defensores: tus atacantes vuelven a la base (CR 466.1.a.2).',
      );
      s = conCampo(s, i, { unidades: [] });
    } else {
      s = anota(
        { ...s, rivalBase: [...s.rivalBase, ...c2.rival] },
        'Quedan defensores: los atacantes del rival vuelven a su base.',
      );
      s = conCampo(s, i, { rival: [] });
    }
  }
  return limpieza(establecerControl(s, i));
}

/** Reparte `total` de daño por orden, letal a cada una antes de pasar a la siguiente. */
function asignar<T extends { uid: number }>(
  orden: T[],
  total: number,
  fuerza: (x: T) => number,
  danio: (x: T) => number,
): Map<number, number> {
  const res = new Map<number, number>();
  let resto = total;
  for (let k = 0; k < orden.length && resto > 0; k++) {
    const x = orden[k];
    const letal = Math.max(1, fuerza(x)) - danio(x);
    const ultimo = k === orden.length - 1;
    const asignado = ultimo ? resto : Math.min(resto, Math.max(0, letal));
    res.set(x.uid, danio(x) + asignado);
    resto -= asignado;
  }
  return res;
}

/** Tras un enfrentamiento: quien queda controla el campo y conquista si no lo había puntuado (CR 466.5). */
function establecerControl(p: Partida, i: 0 | 1): Partida {
  const campo = p.campos[i];
  if (campo.unidades.length && !campo.rival.length) {
    const s = conCampo(p, i, { control: 'yo' });
    return campo.control === 'yo'
      ? s
      : puntuar(anota(s, `Controlas el campo ${i + 1}.`), i, 'conquista');
  }
  if (campo.rival.length && !campo.unidades.length) {
    const s = conCampo(p, i, { control: 'rival' });
    return campo.control === 'rival'
      ? s
      : puntuarRival(anota(s, `El rival controla el campo ${i + 1}.`), i, 'conquista');
  }
  if (!campo.unidades.length && !campo.rival.length)
    return anota(conCampo(p, i, { control: null }), `El campo ${i + 1} queda sin control.`);
  return p;
}

// ── Rival (fichas) ─────────────────────────────────────────────────────────────────────

export function rivalCrear(
  p: Partida,
  donde: 'base' | 0 | 1,
  datos: { fuerza: number; tank?: boolean; ganking?: boolean; nombre?: string },
): Partida {
  const uid = p.siguienteUid + 1;
  const r: Rival = {
    uid,
    nombre: datos.nombre ?? `Unidad ${datos.fuerza}`,
    fuerza: Math.max(0, datos.fuerza),
    tank: !!datos.tank,
    ganking: !!datos.ganking,
    agotada: donde !== 'base',
    danio: 0,
  };
  let s: Partida = { ...p, siguienteUid: uid };
  if (donde === 'base')
    s = anota(
      { ...s, rivalBase: [...s.rivalBase, r] },
      `El rival pone ${r.nombre} (${r.fuerza}) en su base.`,
    );
  else {
    if (s.enfrentamiento && s.enfrentamiento.campo !== donde)
      return rechaza(p, 'Hay un enfrentamiento en el otro campo: resuélvelo antes.');
    if (s.campos[donde].control !== 'rival')
      return rechaza(
        p,
        'El rival solo juega unidades en su base o en un campo que controle (CR 355.2.a).',
      );
    s = conCampo(s, donde, { rival: [...s.campos[donde].rival, r] });
    s = anota(s, `El rival pone ${r.nombre} (${r.fuerza}) en el campo ${donde + 1}.`);
    s = contestar(s, donde, 'rival');
  }
  return limpieza(s);
}

function rivalDonde(p: Partida, uid: number): 'base' | 0 | 1 | null {
  if (p.rivalBase.some((r) => r.uid === uid)) return 'base';
  if (p.campos[0].rival.some((r) => r.uid === uid)) return 0;
  if (p.campos[1].rival.some((r) => r.uid === uid)) return 1;
  return null;
}

export function rivalDe(p: Partida, uid: number): Rival | undefined {
  return [...p.rivalBase, ...p.campos[0].rival, ...p.campos[1].rival].find((r) => r.uid === uid);
}

function rivalSacar(p: Partida, uid: number): [Partida, Rival | null] {
  const donde = rivalDonde(p, uid);
  const r = rivalDe(p, uid);
  if (donde === null || !r) return [p, null];
  if (donde === 'base') return [{ ...p, rivalBase: p.rivalBase.filter((x) => x.uid !== uid) }, r];
  return [conCampo(p, donde, { rival: p.campos[donde].rival.filter((x) => x.uid !== uid) }), r];
}

export function rivalQuitar(p: Partida, uid: number, motivo = 'se retira'): Partida {
  const [s, r] = rivalSacar(p, uid);
  return r ? limpieza(anota(s, `${r.nombre} del rival ${motivo}.`)) : p;
}

export function porQueNoMoverRival(
  p: Partida,
  uid: number,
  destino: 'base' | 0 | 1,
): string | null {
  if (p.fase !== 'rival') return 'El rival solo mueve en su turno.';
  if (p.enfrentamiento) return 'No se mueve durante un enfrentamiento (CR 144.1.c).';
  const r = rivalDe(p, uid);
  const donde = rivalDonde(p, uid);
  if (!r || donde === null) return 'Esa ficha no existe.';
  if (r.agotada) return `${r.nombre} está agotada: mover cuesta agotar (CR 144.2).`;
  if (donde === destino) return 'Ya está ahí.';
  if (donde !== 'base' && destino !== 'base' && !r.ganking)
    return 'De un campo a otro solo con Ganking (CR 144.4).';
  return null;
}

export function rivalMover(p: Partida, uid: number, destino: 'base' | 0 | 1): Partida {
  const razon = porQueNoMoverRival(p, uid, destino);
  if (razon) return rechaza(p, razon);
  let [s, r] = rivalSacar(p, uid);
  const movida = { ...r!, agotada: true };
  if (destino === 'base')
    s = anota(
      { ...s, rivalBase: [...s.rivalBase, movida] },
      `${r!.nombre} del rival vuelve a su base.`,
    );
  else {
    s = conCampo(s, destino, { rival: [...s.campos[destino].rival, movida] });
    s = anota(s, `El rival mueve ${r!.nombre} (${r!.fuerza}) al campo ${destino + 1}.`);
    s = contestar(s, destino, 'rival');
  }
  return limpieza(s);
}

export function rivalDanar(p: Partida, uid: number, d: number): Partida {
  const donde = rivalDonde(p, uid);
  if (donde === null) return p;
  const f = (l: Rival[]) =>
    l.map((r) => (r.uid === uid ? { ...r, danio: Math.max(0, r.danio + d) } : r));
  const s =
    donde === 'base'
      ? { ...p, rivalBase: f(p.rivalBase) }
      : conCampo(p, donde, { rival: f(p.campos[donde].rival) });
  return limpieza(s);
}

export function rivalAlternarAgotada(p: Partida, uid: number): Partida {
  const donde = rivalDonde(p, uid);
  if (donde === null) return p;
  const f = (l: Rival[]) => l.map((r) => (r.uid === uid ? { ...r, agotada: !r.agotada } : r));
  return donde === 'base'
    ? { ...p, rivalBase: f(p.rivalBase) }
    : conCampo(p, donde, { rival: f(p.campos[donde].rival) });
}

// ── Acciones manuales sobre mis cartas (efectos de cartas que el motor no ejecuta) ─────

function editar(p: Partida, uid: number, f: (c: Copia) => Copia): Partida {
  const z = zonaDe(p, uid);
  if (!z) return p;
  return conLista(
    p,
    z,
    lista(p, z).map((c) => (c.uid === uid ? f(c) : c)),
  );
}

export function alternarAgotada(p: Partida, uid: number): Partida {
  const c = copiaDe(p, uid);
  if (!c) return p;
  return anota(
    editar(p, uid, (x) => ({ ...x, agotada: !x.agotada })),
    `${c.ficha.nombre} ${c.agotada ? 'se prepara' : 'se agota'}.`,
  );
}

export function danar(p: Partida, uid: number, d: number): Partida {
  const c = copiaDe(p, uid);
  if (!c) return p;
  return limpieza(
    anota(
      editar(p, uid, (x) => ({ ...x, danio: Math.max(0, x.danio + d) })),
      d > 0 ? `${c.ficha.nombre} recibe ${d} de daño.` : `${c.ficha.nombre} se cura ${-d}.`,
    ),
  );
}

export function buff(p: Partida, uid: number, d: number): Partida {
  const c = copiaDe(p, uid);
  if (!c) return p;
  return limpieza(
    anota(
      editar(p, uid, (x) => ({ ...x, buffs: Math.max(0, x.buffs + d) })),
      `${c.ficha.nombre}: ${d > 0 ? '+' : ''}${d} buff.`,
    ),
  );
}

export function aturdir(p: Partida, uid: number): Partida {
  const c = copiaDe(p, uid);
  if (!c) return p;
  return anota(
    editar(p, uid, (x) => ({ ...x, aturdida: !x.aturdida })),
    `${c.ficha.nombre} ${c.aturdida ? 'ya no está aturdida' : 'queda aturdida (no suma fuerza en combate)'}.`,
  );
}

export function matar(p: Partida, uid: number, motivo = ''): Partida {
  const [s, c, z] = quitar(p, uid);
  if (!c || !z) return p;
  let r: Partida = {
    ...s,
    cementerio: [
      ...s.cementerio,
      { ...c, danio: 0, buffs: 0, aturdida: false, agotada: false, ocultaDesde: null },
    ],
  };
  r = anota(r, `${c.ficha.nombre} muere${motivo ? ` (${motivo})` : ''}.`);
  if (c.ficha.disparadores.includes('morir'))
    r = recordar(r, `${c.ficha.nombre} muere`, c.ficha.texto);
  return r;
}

export function aMano(p: Partida, uid: number): Partida {
  const [s, c] = quitar(p, uid);
  if (!c) return p;
  return limpieza(
    anota(
      {
        ...s,
        mano: [
          ...s.mano,
          { ...c, danio: 0, buffs: 0, aturdida: false, agotada: false, ocultaDesde: null },
        ],
      },
      `${c.ficha.nombre} vuelve a la mano.`,
    ),
  );
}

export function alCementerio(p: Partida, uid: number): Partida {
  const z = zonaDe(p, uid);
  if (z === 'base' || z === 'campo0' || z === 'campo1') return matar(p, uid);
  const [s, c] = quitar(p, uid);
  if (!c) return p;
  if (z === 'runas')
    return limpieza(
      anota(
        { ...s, mazoRunas: [...s.mazoRunas, { ...c, agotada: false }] },
        `${c.ficha.nombre} se recicla al mazo de runas.`,
      ),
    );
  return limpieza(
    anota(
      { ...s, cementerio: [...s.cementerio, { ...c, ocultaDesde: null }] },
      `${c.ficha.nombre} al cementerio${z === 'mano' ? ' (descarte)' : ''}.`,
    ),
  );
}

export function desterrar(p: Partida, uid: number): Partida {
  const [s, c] = quitar(p, uid);
  if (!c) return p;
  return limpieza(
    anota(
      { ...s, desterradas: [...s.desterradas, { ...c, ocultaDesde: null }] },
      `${c.ficha.nombre} desterrada.`,
    ),
  );
}

/** A la zona del campeón, solo si está vacía (CR 108.3.c.1). */
export function aZonaCampeon(p: Partida, uid: number): Partida {
  if (p.campeon.length) return rechaza(p, 'La zona del campeón ya está ocupada (CR 108.3.c.1).');
  const [s, c] = quitar(p, uid);
  if (!c) return p;
  return limpieza(
    anota(
      {
        ...s,
        campeon: [{ ...c, danio: 0, buffs: 0, aturdida: false, agotada: false, ocultaDesde: null }],
      },
      `${c.ficha.nombre} vuelve a la zona del campeón.`,
    ),
  );
}

/** Devuelve una carta a su mazo (runas al de runas), arriba o abajo. */
export function alMazo(p: Partida, uid: number, donde: 'arriba' | 'abajo'): Partida {
  const [s, c, z] = quitar(p, uid);
  if (!c) return p;
  const limpia = { ...c, agotada: false, danio: 0, buffs: 0, aturdida: false, ocultaDesde: null };
  const clave = z === 'runas' ? 'mazoRunas' : 'mazo';
  const pila = donde === 'arriba' ? [limpia, ...s[clave]] : [...s[clave], limpia];
  return limpieza(
    anota(
      { ...s, [clave]: pila },
      `${c.ficha.nombre} ${donde === 'arriba' ? 'encima' : 'al fondo'} del mazo.`,
    ),
  );
}

export function barajarMazo(p: Partida): Partida {
  return anota({ ...p, mazo: barajar(p.mazo) }, 'Barajas el mazo.');
}

/** Cambia el campo de batalla (antes de que tenga unidades). */
export function cambiarCampo(p: Partida, i: 0 | 1, id: string): Partida {
  const c = p.campos[i];
  if (c.unidades.length || c.rival.length || c.control)
    return rechaza(p, 'Solo se cambia un campo vacío y sin control.');
  return anota(conCampo(p, i, { id }), `Campo ${i + 1} cambiado.`);
}

export function ajustarXp(p: Partida, d: number): Partida {
  return { ...p, xp: Math.max(0, p.xp + d) };
}
