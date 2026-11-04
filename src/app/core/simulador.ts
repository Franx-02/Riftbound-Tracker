import { Mazo } from './mazos';

/**
 * Estado de una partida de práctica en solitario ("goldfish"), puro y sin Angular para
 * poder probarlo. Reglas que se simulan (Core Rules): mano inicial de 4, mulligan de
 * hasta 2 cartas que van al fondo del mazo, en cada turno se preparan las runas, se roba
 * 1 y se canalizan 2 runas (el primer jugador, el primer turno, roba igualmente aquí).
 */
export interface Copia {
  /** Único dentro de la partida. */
  uid: number;
  id: string;
  agotada: boolean;
}

export type ZonaSim = 'mano' | 'base' | 'campo' | 'cementerio' | 'runas' | 'campeon';

export interface Partida {
  mazo: Copia[];
  mazoRunas: Copia[];
  mano: Copia[];
  base: Copia[];
  campo: Copia[];
  cementerio: Copia[];
  runas: Copia[];
  campeon: Copia[];
  campos: string[];
  turno: number;
  puntos: number;
  /** Mientras es true se puede hacer mulligan. */
  inicio: boolean;
  log: string[];
}

export const MANO_INICIAL = 4;
export const MAX_MULLIGAN = 2;
export const RUNAS_POR_TURNO = 2;

export function barajar<T>(lista: readonly T[], azar: () => number = Math.random): T[] {
  const a = [...lista];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(azar() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function nuevaPartida(m: Mazo, azar: () => number = Math.random): Partida {
  let uid = 0;
  const copias = (zona: Record<string, number>) =>
    Object.entries(zona).flatMap(([id, n]) =>
      Array.from({ length: n }, () => ({ uid: ++uid, id, agotada: false })),
    );
  const mazo = barajar(copias(m.principal), azar);
  const p: Partida = {
    mazo,
    mazoRunas: barajar(copias(m.runas), azar),
    mano: [],
    base: [],
    campo: [],
    cementerio: [],
    runas: [],
    campeon: m.campeon ? [{ uid: ++uid, id: m.campeon, agotada: false }] : [],
    campos: [...m.campos],
    turno: 0,
    puntos: 0,
    inicio: true,
    log: ['Partida nueva: mano inicial de 4.'],
  };
  return robar(p, MANO_INICIAL, false);
}

export function robar(p: Partida, n = 1, anotar = true): Partida {
  const n2 = Math.min(n, p.mazo.length);
  const robadas = p.mazo.slice(0, n2);
  return {
    ...p,
    mazo: p.mazo.slice(n2),
    mano: [...p.mano, ...robadas],
    log: anotar ? [...p.log, n2 ? `Robas ${n2}.` : 'El mazo está vacío.'] : p.log,
  };
}

/** Devuelve al fondo del mazo las cartas elegidas (máx. 2) y roba otras tantas. */
export function mulligan(p: Partida, uids: number[]): Partida {
  if (!p.inicio) return p;
  const fuera = p.mano.filter((c) => uids.includes(c.uid)).slice(0, MAX_MULLIGAN);
  const quedan = p.mano.filter((c) => !fuera.includes(c));
  const sig = robar({ ...p, mano: quedan }, fuera.length, false);
  return {
    ...sig,
    mazo: [...sig.mazo, ...fuera],
    inicio: false,
    log: [...p.log, fuera.length ? `Mulligan de ${fuera.length}.` : 'Te quedas la mano.'],
  };
}

export function canalizar(p: Partida, n = RUNAS_POR_TURNO): Partida {
  const n2 = Math.min(n, p.mazoRunas.length);
  return {
    ...p,
    mazoRunas: p.mazoRunas.slice(n2),
    runas: [...p.runas, ...p.mazoRunas.slice(0, n2)],
    log: [...p.log, n2 ? `Canalizas ${n2} runa${n2 === 1 ? '' : 's'}.` : 'No quedan runas.'],
  };
}

/** Nuevo turno: prepara todo, roba 1 y canaliza 2. */
export function siguienteTurno(p: Partida): Partida {
  const preparar = (z: Copia[]) => z.map((c) => (c.agotada ? { ...c, agotada: false } : c));
  let s: Partida = {
    ...p,
    inicio: false,
    turno: p.turno + 1,
    runas: preparar(p.runas),
    base: preparar(p.base),
    campo: preparar(p.campo),
    campeon: preparar(p.campeon),
    log: [...p.log, `— Turno ${p.turno + 1} —`],
  };
  s = robar(s);
  return canalizar(s);
}

export function mover(p: Partida, uid: number, a: ZonaSim): Partida {
  const zonas: ZonaSim[] = ['mano', 'base', 'campo', 'cementerio', 'runas', 'campeon'];
  let carta: Copia | undefined;
  const s = { ...p, inicio: false };
  for (const z of zonas) {
    const i = s[z].findIndex((c) => c.uid === uid);
    if (i >= 0) {
      carta = s[z][i];
      s[z] = s[z].filter((c) => c.uid !== uid);
    }
  }
  if (!carta) return p;
  s[a] = [...s[a], { ...carta, agotada: a === 'base' || a === 'campo' ? carta.agotada : false }];
  return s;
}

export function alternarAgotada(p: Partida, uid: number): Partida {
  const cambiar = (z: Copia[]) => z.map((c) => (c.uid === uid ? { ...c, agotada: !c.agotada } : c));
  return {
    ...p,
    base: cambiar(p.base),
    campo: cambiar(p.campo),
    runas: cambiar(p.runas),
    campeon: cambiar(p.campeon),
  };
}

export function barajarMazo(p: Partida): Partida {
  return { ...p, mazo: barajar(p.mazo), log: [...p.log, 'Barajas el mazo.'] };
}
