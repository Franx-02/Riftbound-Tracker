import { CatalogCard } from './catalog.service';

/**
 * Sobres virtuales, al estilo de los juegos de cartas de móvil: abres sobres de un set,
 * cada carta se revela una a una y lo que sale va a un álbum aparte. No toca la colección
 * real. Las probabilidades son inventadas (no hay datos oficiales de distribución).
 */

/** Sets con sobre: los de expansión, con sus rarezas completas. */
export const SETS_SOBRE = ['OGN', 'SFD', 'UNL', 'VEN', 'RAD'] as const;
export const CARTAS_POR_SOBRE = 14;
/** Sobres que se acumulan como máximo y cada cuánto se recarga uno. */
export const MAX_APERTURAS = 2;
export const RECARGA_MS = 12 * 60 * 60 * 1000;

export type Rareza = 'Common' | 'Uncommon' | 'Rare' | 'Epic' | 'Showcase';

/** Orden de valor, para ordenar el revelado y pintar el brillo. */
export const ORDEN_RAREZA: Record<string, number> = {
  Common: 0,
  Uncommon: 1,
  Rare: 2,
  Epic: 3,
  Showcase: 4,
  Promo: 2,
};

export interface Aperturas {
  /** Sobres listos para abrir. */
  restantes: number;
  /** Momento (ISO) desde el que cuenta la recarga del siguiente sobre. */
  desde: string;
}

export interface Album {
  /** cardId → copias conseguidas. */
  cartas: Record<string, number>;
  aperturas: Aperturas;
  /** Sobres abiertos en total. */
  abiertos: number;
}

export function albumVacio(ahora = new Date()): Album {
  return {
    cartas: {},
    aperturas: { restantes: MAX_APERTURAS, desde: ahora.toISOString() },
    abiertos: 0,
  };
}

/** Aplica la recarga pendiente: un sobre cada RECARGA_MS, hasta el máximo. */
export function recargar(a: Aperturas, ahora = new Date()): Aperturas {
  if (a.restantes >= MAX_APERTURAS) return { restantes: MAX_APERTURAS, desde: ahora.toISOString() };
  const desde = Date.parse(a.desde) || ahora.getTime();
  const pasados = Math.floor((ahora.getTime() - desde) / RECARGA_MS);
  if (pasados <= 0) return a;
  const restantes = Math.min(MAX_APERTURAS, a.restantes + pasados);
  const nuevoDesde = restantes >= MAX_APERTURAS ? ahora.getTime() : desde + pasados * RECARGA_MS;
  return { restantes, desde: new Date(nuevoDesde).toISOString() };
}

/** Milisegundos hasta el siguiente sobre (0 si ya hay el máximo). */
export function faltaParaSiguiente(a: Aperturas, ahora = new Date()): number {
  const r = recargar(a, ahora);
  if (r.restantes >= MAX_APERTURAS) return 0;
  return Math.max(0, (Date.parse(r.desde) || ahora.getTime()) + RECARGA_MS - ahora.getTime());
}

/** Gasta un sobre; si no quedaba ninguno, devuelve null. */
export function consumir(a: Aperturas, ahora = new Date()): Aperturas | null {
  const r = recargar(a, ahora);
  if (r.restantes <= 0) return null;
  // Si estaba lleno, la recarga del siguiente empieza ahora.
  const desde = r.restantes >= MAX_APERTURAS ? ahora.toISOString() : r.desde;
  return { restantes: r.restantes - 1, desde };
}

/** Rareza "de sobre" de una carta: las versiones alternativas cuentan como Showcase. */
export function rarezaDe(c: CatalogCard): Rareza | null {
  if (c.alt || c.signature || c.overnumbered || c.rarity === 'Showcase') return 'Showcase';
  if (
    c.rarity === 'Common' ||
    c.rarity === 'Uncommon' ||
    c.rarity === 'Rare' ||
    c.rarity === 'Epic'
  ) {
    return c.rarity;
  }
  return null;
}

/** Cartas de un set que pueden salir en un sobre, agrupadas por rareza. */
export function reparto(
  set: string,
  cartas: readonly CatalogCard[],
): Record<Rareza, CatalogCard[]> {
  const r: Record<Rareza, CatalogCard[]> = {
    Common: [],
    Uncommon: [],
    Rare: [],
    Epic: [],
    Showcase: [],
  };
  for (const c of cartas) {
    if (c.set !== set || c.supertype === 'Token' || c.type === 'Rune') continue;
    const z = rarezaDe(c);
    if (z) r[z].push(c);
  }
  return r;
}

/** Probabilidad del "sobre dorado": todas las cartas Showcase. */
export const PROB_SOBRE_DORADO = 0.005;

function elegir<T>(lista: readonly T[], azar: () => number, evitar: Set<T>): T | null {
  if (!lista.length) return null;
  const candidatas = lista.filter((x) => !evitar.has(x));
  const de = candidatas.length ? candidatas : lista;
  return de[Math.floor(azar() * de.length)] ?? null;
}

export interface Sobre {
  set: string;
  cartas: CatalogCard[];
  dorado: boolean;
}

/**
 * Abre un sobre de 14 cartas, como los reales: 7 comunes, 3 infrecuentes, 2 raras (cada una
 * puede subir a épica, 25 %), 1 hueco especial (épica 85 % / Showcase 15 %) y 1 hueco
 * "foil" con cualquier rareza (común 40 %, infrecuente 30 %, rara 20 %, épica 8 %, Showcase
 * 2 %). Sin repetir dentro del sobre si hay de dónde elegir. Con poca suerte (0,5 %) sale un
 * sobre dorado, todo Showcase. Las probabilidades son inventadas.
 */
export function abrirSobre(
  set: string,
  cartas: readonly CatalogCard[],
  azar: () => number = Math.random,
): Sobre | null {
  const r = reparto(set, cartas);
  if (!r.Common.length || !r.Rare.length) return null;
  const salida: CatalogCard[] = [];
  const vistas = new Set<CatalogCard>();
  const pon = (z: Rareza) => {
    const lista = r[z].length ? r[z] : r.Rare.length ? r.Rare : r.Common;
    const c = elegir(lista, azar, vistas);
    if (c) {
      salida.push(c);
      vistas.add(c);
    }
  };
  const dorado = r.Showcase.length >= 5 && azar() < PROB_SOBRE_DORADO;
  if (dorado) {
    for (let i = 0; i < CARTAS_POR_SOBRE; i++) pon('Showcase');
    return { set, cartas: salida, dorado: true };
  }
  for (let i = 0; i < 7; i++) pon('Common');
  for (let i = 0; i < 3; i++) pon(r.Uncommon.length ? 'Uncommon' : 'Common');
  for (let i = 0; i < 2; i++) pon(azar() < 0.25 && r.Epic.length ? 'Epic' : 'Rare');
  pon(azar() < 0.15 && r.Showcase.length ? 'Showcase' : r.Epic.length ? 'Epic' : 'Rare');
  const x = azar();
  const foil: Rareza =
    x < 0.4 ? 'Common' : x < 0.7 ? 'Uncommon' : x < 0.9 ? 'Rare' : x < 0.98 ? 'Epic' : 'Showcase';
  pon(foil);
  // El álbum muestra lo mejor al final: se ordena de menor a mayor rareza.
  salida.sort(
    (a, b) => ORDEN_RAREZA[rarezaDe(a) ?? 'Common'] - ORDEN_RAREZA[rarezaDe(b) ?? 'Common'],
  );
  return { set, cartas: salida, dorado: false };
}

/** Añade las cartas de un sobre al álbum (copias sumadas). */
export function guardarEnAlbum(album: Album, sobre: Sobre, ahora = new Date()): Album {
  const cartas = { ...album.cartas };
  for (const c of sobre.cartas) cartas[c.cardId] = (cartas[c.cardId] ?? 0) + 1;
  return {
    ...album,
    cartas,
    abiertos: album.abiertos + 1,
    aperturas: recargar(album.aperturas, ahora),
  };
}

export interface Progreso {
  tengo: number;
  total: number;
  porRareza: Record<Rareza, { tengo: number; total: number }>;
}

/** Cuántas cartas distintas del set hay en el álbum. */
export function progreso(set: string, album: Album, cartas: readonly CatalogCard[]): Progreso {
  const r = reparto(set, cartas);
  const porRareza = {} as Progreso['porRareza'];
  let tengo = 0;
  let total = 0;
  for (const z of Object.keys(r) as Rareza[]) {
    const t = r[z].filter((c) => (album.cartas[c.cardId] ?? 0) > 0).length;
    porRareza[z] = { tengo: t, total: r[z].length };
    tengo += t;
    total += r[z].length;
  }
  return { tengo, total, porRareza };
}
