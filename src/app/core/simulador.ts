import { CatalogCard } from './catalog.service';
import { Mazo } from './mazos';

/**
 * Partida de práctica en solitario contra un rival "muñeco", pura y sin Angular para poder
 * probarla. Sigue las Core Rules de Riftbound en lo que se puede simular sin un rival real:
 * - Preparación: 4 cartas de mano; mulligan de las que quieras, al fondo del mazo, robando
 *   otras tantas. En 1v1 hay 2 campos de batalla en juego, uno de cada jugador.
 * - Turno: Despertar (se prepara todo y se puntúa 1 por cada campo que controlas: "Hold"),
 *   Inicio (se canalizan 2 runas y se roba 1; quien empieza no roba en su primer turno),
 *   Acción (jugar, mover, combatir) y Final.
 * - Costes: la energía se paga agotando runas (1 cada una) y el poder reciclando runas (van
 *   al fondo del mazo de runas). Las runas se canalizan preparadas.
 * - Puntos: 8 para ganar. Conquistar un campo (tomar su control) da 1 punto. El último
 *   punto no puede venir de un Hold: hay que conquistar.
 * - El rival se representa con contadores de unidades en su base y en cada campo; los
 *   combates los resuelve el jugador diciendo quién gana.
 */
export interface Copia {
  /** Único dentro de la partida. */
  uid: number;
  id: string;
  agotada: boolean;
}

export type Fase = 'mulligan' | 'despertar' | 'inicio' | 'accion' | 'final';

export interface Campo {
  id: string;
  /** Quién lo controla. */
  control: 'yo' | 'rival' | null;
  unidades: Copia[];
  /** Unidades del rival ahí (solo un contador). */
  rival: number;
}

export type ZonaSim = 'mano' | 'base' | 'cementerio' | 'runas' | 'campeon' | 'campo0' | 'campo1';

export interface Partida {
  mazo: Copia[];
  mazoRunas: Copia[];
  mano: Copia[];
  base: Copia[];
  cementerio: Copia[];
  runas: Copia[];
  /** El Campeón elegido empieza aparte y se juega desde ahí. */
  campeon: Copia[];
  campos: [Campo, Campo];
  /** Campos del mazo que no están en juego (se pueden intercambiar). */
  camposReserva: string[];
  rivalBase: number;
  turno: number;
  fase: Fase;
  puntos: number;
  puntosRival: number;
  /** Si empiezo yo, no robo en el primer turno. */
  empiezoYo: boolean;
  /** Pagar energía y poder agotando/reciclando runas al jugar desde la mano. */
  pagarCostes: boolean;
  /** Último aviso para la interfaz (coste no pagable, etc.). */
  aviso: string | null;
  log: string[];
}

export const MANO_INICIAL = 4;
export const RUNAS_POR_TURNO = 2;
export const PUNTOS_PARA_GANAR = 8;

export function barajar<T>(lista: readonly T[], azar: () => number = Math.random): T[] {
  const a = [...lista];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(azar() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function nuevaPartida(
  m: Mazo,
  opciones: { empiezoYo?: boolean; pagarCostes?: boolean } = {},
  azar: () => number = Math.random,
): Partida {
  let uid = 0;
  const copias = (zona: Record<string, number>) =>
    Object.entries(zona).flatMap(([id, n]) =>
      Array.from({ length: n }, () => ({ uid: ++uid, id, agotada: false })),
    );
  const campo = (id: string | undefined): Campo => ({
    id: id ?? '',
    control: null,
    unidades: [],
    rival: 0,
  });
  const p: Partida = {
    mazo: barajar(copias(m.principal), azar),
    mazoRunas: barajar(copias(m.runas), azar),
    mano: [],
    base: [],
    cementerio: [],
    runas: [],
    campeon: m.campeon ? [{ uid: ++uid, id: m.campeon, agotada: false }] : [],
    campos: [campo(m.campos[0]), campo(m.campos[1])],
    camposReserva: m.campos.slice(2),
    rivalBase: 0,
    turno: 0,
    fase: 'mulligan',
    puntos: 0,
    puntosRival: 0,
    empiezoYo: opciones.empiezoYo ?? true,
    pagarCostes: opciones.pagarCostes ?? true,
    aviso: null,
    log: ['Partida nueva: robas 4. Elige qué cartas devuelves (mulligan) o quédate la mano.'],
  };
  return robar(p, MANO_INICIAL, false);
}

const anota = (p: Partida, texto: string): Partida => ({
  ...p,
  log: [...p.log, texto],
  aviso: null,
});

export function robar(p: Partida, n = 1, anotar = true): Partida {
  const n2 = Math.min(n, p.mazo.length);
  const s = { ...p, mazo: p.mazo.slice(n2), mano: [...p.mano, ...p.mazo.slice(0, n2)] };
  return anotar ? anota(s, n2 ? `Robas ${n2}.` : 'El mazo está vacío.') : s;
}

/** Devuelve al fondo del mazo las cartas elegidas y roba otras tantas. Solo al empezar. */
export function mulligan(p: Partida, uids: number[]): Partida {
  if (p.fase !== 'mulligan') return p;
  const fuera = p.mano.filter((c) => uids.includes(c.uid));
  const quedan = p.mano.filter((c) => !fuera.includes(c));
  const sig = robar({ ...p, mano: quedan }, fuera.length, false);
  return siguienteTurno(
    anota(
      { ...sig, mazo: [...sig.mazo, ...fuera] },
      fuera.length ? `Mulligan de ${fuera.length}.` : 'Te quedas la mano.',
    ),
  );
}

export function canalizar(p: Partida, n = RUNAS_POR_TURNO): Partida {
  const n2 = Math.min(n, p.mazoRunas.length);
  return anota(
    {
      ...p,
      mazoRunas: p.mazoRunas.slice(n2),
      runas: [...p.runas, ...p.mazoRunas.slice(0, n2)],
    },
    n2 ? `Canalizas ${n2} runa${n2 === 1 ? '' : 's'}.` : 'No quedan runas que canalizar.',
  );
}

/** Nuevo turno: Despertar (preparar y puntuar lo que controlas) e Inicio (canalizar y robar). */
export function siguienteTurno(p: Partida): Partida {
  const preparar = (z: Copia[]) => z.map((c) => (c.agotada ? { ...c, agotada: false } : c));
  const turno = p.turno + 1;
  let s: Partida = anota(
    {
      ...p,
      turno,
      fase: 'despertar',
      runas: preparar(p.runas),
      base: preparar(p.base),
      campeon: preparar(p.campeon),
      campos: [
        { ...p.campos[0], unidades: preparar(p.campos[0].unidades) },
        { ...p.campos[1], unidades: preparar(p.campos[1].unidades) },
      ],
    },
    `— Turno ${turno} — Despertar: preparas tus cartas.`,
  );
  const controlados = s.campos.filter((c) => c.control === 'yo').length;
  if (controlados) s = sumarPuntos(s, controlados, 'hold');
  s = { ...s, fase: 'inicio' };
  s = canalizar(s);
  if (turno === 1 && s.empiezoYo) s = anota(s, 'Empiezas tú: no robas en el primer turno.');
  else s = robar(s);
  return { ...s, fase: 'accion' };
}

/** Termina tu turno; el rival "muñeco" juega el suyo sin hacer nada. */
export function terminarTurno(p: Partida): Partida {
  return siguienteTurno(anota({ ...p, fase: 'final' }, 'Fin del turno. El rival pasa.'));
}

/** Hold no puede dar el último punto: hace falta conquistar. */
function sumarPuntos(p: Partida, n: number, motivo: 'hold' | 'conquista'): Partida {
  let puntos = p.puntos + n;
  let texto =
    motivo === 'hold'
      ? `Hold: +${n} por ${n === 1 ? 'el campo que controlas' : 'los campos que controlas'}.`
      : '¡Conquista! +1 punto.';
  if (motivo === 'hold' && puntos >= PUNTOS_PARA_GANAR) {
    puntos = PUNTOS_PARA_GANAR - 1;
    texto += ' El último punto tiene que ser por conquista.';
  }
  const s = anota({ ...p, puntos }, texto);
  return puntos >= PUNTOS_PARA_GANAR ? anota(s, `¡Has ganado con ${puntos} puntos!`) : s;
}

export function puntosRival(p: Partida, d: number): Partida {
  return { ...p, puntosRival: Math.max(0, Math.min(PUNTOS_PARA_GANAR, p.puntosRival + d)) };
}

export function ajustarPuntos(p: Partida, d: number): Partida {
  return { ...p, puntos: Math.max(0, Math.min(PUNTOS_PARA_GANAR, p.puntos + d)) };
}

function zonaLista(p: Partida, z: ZonaSim): Copia[] {
  if (z === 'campo0') return p.campos[0].unidades;
  if (z === 'campo1') return p.campos[1].unidades;
  return p[z];
}

function conZona(p: Partida, z: ZonaSim, lista: Copia[]): Partida {
  if (z === 'campo0' || z === 'campo1') {
    const i = z === 'campo0' ? 0 : 1;
    const campos: [Campo, Campo] = [p.campos[0], p.campos[1]];
    campos[i] = { ...campos[i], unidades: lista };
    return { ...p, campos };
  }
  return { ...p, [z]: lista };
}

export const ZONAS: ZonaSim[] = [
  'mano',
  'base',
  'cementerio',
  'runas',
  'campeon',
  'campo0',
  'campo1',
];

export function zonaDe(p: Partida, uid: number): ZonaSim | null {
  return ZONAS.find((z) => zonaLista(p, z).some((c) => c.uid === uid)) ?? null;
}

/**
 * Paga un coste con runas: `energia` runas preparadas se agotan y `poder` runas se reciclan
 * (al fondo del mazo de runas). Devuelve null si no se puede pagar.
 */
export function pagar(p: Partida, energia: number, poder: number): Partida | null {
  const listas = p.runas.filter((r) => !r.agotada);
  if (listas.length < energia + poder) return null;
  // Para el poder se reciclan runas preparadas; el resto de la energía se agota.
  const recicladas = listas.slice(0, poder);
  const agotadas = listas.slice(poder, poder + energia);
  const runas = p.runas
    .filter((r) => !recicladas.includes(r))
    .map((r) => (agotadas.includes(r) ? { ...r, agotada: true } : r));
  return {
    ...p,
    runas,
    mazoRunas: [...p.mazoRunas, ...recicladas.map((r) => ({ ...r, agotada: false }))],
  };
}

/**
 * Mueve una carta a otra zona. Si viene de la mano o del Campeón y `pagarCostes` está
 * activo, paga su coste. Si llega a un campo de batalla sin rival, lo conquista.
 */
export function mover(
  p: Partida,
  uid: number,
  a: ZonaSim,
  carta?: Pick<CatalogCard, 'name' | 'energy' | 'power'> | undefined,
): Partida {
  const desde = zonaDe(p, uid);
  if (!desde || desde === a) return p;
  const copia = zonaLista(p, desde).find((c) => c.uid === uid)!;
  const nombre = carta?.name ?? copia.id;
  let s: Partida = { ...p, aviso: null };

  const aJuego = a === 'base' || a === 'campo0' || a === 'campo1';
  if ((desde === 'mano' || desde === 'campeon') && aJuego && p.pagarCostes && carta) {
    const energia = carta.energy ?? 0;
    const poder = carta.power ?? 0;
    if (energia || poder) {
      const pagado = pagar(s, energia, poder);
      if (!pagado) {
        return {
          ...p,
          aviso: `No puedes pagar ${nombre}: cuesta ${energia} de energía${poder ? ` y ${poder} de poder` : ''} y tienes ${p.runas.filter((r) => !r.agotada).length} runas preparadas.`,
        };
      }
      s = anota(pagado, `Juegas ${nombre} (${energia}⚡${poder ? ` ${poder}✦` : ''}).`);
    } else {
      s = anota(s, `Juegas ${nombre}.`);
    }
  }

  s = conZona(
    s,
    desde,
    zonaLista(s, desde).filter((c) => c.uid !== uid),
  );
  const mantiene = aJuego && (desde === 'base' || desde === 'campo0' || desde === 'campo1');
  s = conZona(s, a, [...zonaLista(s, a), { ...copia, agotada: mantiene ? copia.agotada : false }]);

  if (!(desde === 'mano' || desde === 'campeon') || !aJuego) {
    const destinos: Record<ZonaSim, string> = {
      mano: 'a la mano',
      base: 'a la base',
      cementerio: 'al cementerio',
      runas: 'a las runas',
      campeon: 'a su sitio',
      campo0: 'al campo de batalla',
      campo1: 'al campo de batalla',
    };
    s = anota(s, `${nombre} ${destinos[a]}.`);
  }

  if (a === 'campo0' || a === 'campo1') {
    const i = a === 'campo0' ? 0 : 1;
    const campo = s.campos[i];
    if (campo.rival > 0) {
      s = anota(
        s,
        `Enfrentamiento en el campo: hay ${campo.rival} unidad(es) rival(es). Resuélvelo.`,
      );
    } else if (campo.control !== 'yo') {
      const campos: [Campo, Campo] = [s.campos[0], s.campos[1]];
      campos[i] = { ...campo, control: 'yo' };
      s = sumarPuntos({ ...s, campos }, 1, 'conquista');
    }
  }
  return s;
}

export function alternarAgotada(p: Partida, uid: number): Partida {
  const z = zonaDe(p, uid);
  if (!z || z === 'mano' || z === 'cementerio') return p;
  return conZona(
    p,
    z,
    zonaLista(p, z).map((c) => (c.uid === uid ? { ...c, agotada: !c.agotada } : c)),
  );
}

/** Agota una runa preparada para generar 1 de energía a mano (sin jugar carta). */
export function agotarRuna(p: Partida): Partida {
  const r = p.runas.find((x) => !x.agotada);
  if (!r) return { ...p, aviso: 'No tienes runas preparadas.' };
  return anota(alternarAgotada(p, r.uid), 'Agotas una runa: +1 de energía.');
}

/** Recicla una runa preparada (al fondo del mazo de runas) para generar 1 de poder. */
export function reciclarRuna(p: Partida): Partida {
  const pagado = pagar(p, 0, 1);
  if (!pagado) return { ...p, aviso: 'No tienes runas preparadas.' };
  return anota(pagado, 'Reciclas una runa: +1 de poder.');
}

export function barajarMazo(p: Partida): Partida {
  return anota({ ...p, mazo: barajar(p.mazo) }, 'Barajas el mazo.');
}

/** Unidades rivales en un campo (0/1) o en su base (-1). */
export function rival(p: Partida, donde: 0 | 1 | -1, d: number): Partida {
  if (donde === -1) return { ...p, rivalBase: Math.max(0, p.rivalBase + d) };
  const campos: [Campo, Campo] = [p.campos[0], p.campos[1]];
  const n = Math.max(0, campos[donde].rival + d);
  campos[donde] = { ...campos[donde], rival: n };
  let s: Partida = { ...p, campos };
  // Si el rival entra en un campo vacío de los míos y sin control suyo, lo conquista él.
  if (d > 0 && n > 0 && campos[donde].unidades.length === 0 && campos[donde].control !== 'rival') {
    campos[donde] = { ...campos[donde], control: 'rival' };
    s = anota(
      { ...s, campos, puntosRival: Math.min(PUNTOS_PARA_GANAR, s.puntosRival + 1) },
      'El rival conquista el campo: +1 para él.',
    );
  }
  return s;
}

/** Resuelve un enfrentamiento en un campo: si ganas, el rival se va y conquistas. */
export function resolverCombate(p: Partida, i: 0 | 1, gano: boolean): Partida {
  const campos: [Campo, Campo] = [p.campos[0], p.campos[1]];
  const campo = campos[i];
  if (gano) {
    campos[i] = { ...campo, rival: 0 };
    let s: Partida = anota({ ...p, campos }, 'Ganas el combate: las unidades rivales mueren.');
    if (campo.control !== 'yo') {
      campos[i] = { ...campos[i], control: 'yo' };
      s = sumarPuntos({ ...s, campos }, 1, 'conquista');
    }
    return s;
  }
  campos[i] = { ...campo, unidades: [], control: campo.rival > 0 ? 'rival' : campo.control };
  return anota(
    {
      ...p,
      campos,
      cementerio: [...p.cementerio, ...campo.unidades.map((c) => ({ ...c, agotada: false }))],
    },
    'Pierdes el combate: tus unidades van al cementerio.',
  );
}

/** Cambia el campo de batalla en juego por uno de la reserva (antes de que haya nada en él). */
export function cambiarCampo(p: Partida, i: 0 | 1, id: string): Partida {
  const campo = p.campos[i];
  if (campo.unidades.length || campo.rival)
    return { ...p, aviso: 'Vacía el campo antes de cambiarlo.' };
  const campos: [Campo, Campo] = [p.campos[0], p.campos[1]];
  campos[i] = { id, control: null, unidades: [], rival: 0 };
  return {
    ...p,
    campos,
    camposReserva: [...p.camposReserva.filter((x) => x !== id), ...(campo.id ? [campo.id] : [])],
  };
}
