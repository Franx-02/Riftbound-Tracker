import { CatalogCard } from './catalog.service';

/** Lo que se lee abajo a la izquierda de la carta: `SFD • 198/221` → set SFD, número 198. */
export interface CodigoLeido {
  set: string;
  num: number;
  /** El total del set (221), si se ha leído. Sirve para descartar lecturas imposibles. */
  total: number | null;
  /** Tras el total venía "• P": es la versión promo de esa carta. */
  promo: boolean;
}

/** Confusiones típicas del OCR en la parte de números. */
const A_DIGITO: Record<string, string> = {
  O: '0',
  D: '0',
  Q: '0',
  I: '1',
  L: '1',
  S: '5',
  B: '8',
  Z: '2',
};
/** Y en la parte del set, que siempre son letras. */
const A_LETRA: Record<string, string> = { '0': 'O', '1': 'I', '5': 'S', '8': 'B', '2': 'Z' };

const digitos = (s: string) => s.replace(/[ODQILSBZ]/g, (c) => A_DIGITO[c]);
const letras = (s: string) => s.replace(/[01582]/g, (c) => A_LETRA[c]);

/**
 * Busca códigos de carta en un texto (lo que devuelve el OCR o lo que escribe el
 * usuario). Solo acepta sets que existan (`setsValidos`) y, si se leyó el total,
 * números que quepan en él (las overnumbered pasan del total, pero poco).
 * Devuelve los distintos, en el orden en que aparecen.
 */
export function parseCodigos(texto: string, setsValidos: ReadonlySet<string>): CodigoLeido[] {
  const t = texto.toUpperCase().replace(/[|]/g, '/');
  // Set de 2-3 caracteres, separador opcional (• · . - :), número de 1-3 cifras con una
  // letra o asterisco de variante opcional, "/total" opcional y, tras el total, una P
  // opcional: las promos llevan el código de la carta original seguido de "• P".
  const re =
    /\b([A-Z0-9]{2,3})\s*[•·.\-:,*°]?\s*([0-9ODQILSBZ]{1,3})[A-Z*]?(?:\s*\/\s*([0-9ODQILSBZ]{2,3})(\s*[•·.,*°]?\s*P\b)?)?/g;
  const salida: CodigoLeido[] = [];
  const vistos = new Set<string>();
  for (const m of t.matchAll(re)) {
    const set = letras(m[1]);
    if (!setsValidos.has(set)) continue;
    const num = Number(digitos(m[2]));
    const total = m[3] ? Number(digitos(m[3])) : null;
    if (!Number.isFinite(num) || num < 1) continue;
    if (total !== null && (!Number.isFinite(total) || num > total + 30)) continue;
    const clave = `${set}-${num}`;
    if (vistos.has(clave)) continue;
    vistos.add(clave);
    salida.push({ set, num, total, promo: !!m[4] });
  }
  return salida;
}

/** "Akali, Brash (Champion)" y "Akali, Brash" son la misma carta: se compara sin el paréntesis. */
const nombreBase = (nombre: string) => nombre.replace(/\s*\([^)]*\)\s*$/, '').toLowerCase();

/**
 * Cartas del catálogo que llevan impreso ese código. Suele ser una, pero las alt art
 * (`SFD-198A`) y las firmadas (`OGN-299*`) comparten número con la normal, y las promos
 * (`OPP-015`) llevan impreso el código de la carta original (`RAD • 015/167 • P`). Van
 * todas: primero la normal, después sus variantes y al final las promos con el mismo
 * nombre, salvo que se leyera la P, que entonces van delante. El usuario elige.
 */
export function cartasDelCodigo(
  cards: readonly CatalogCard[],
  codigo: Pick<CodigoLeido, 'set' | 'num'> & { promo?: boolean },
): CatalogCard[] {
  const orden = (a: CatalogCard, b: CatalogCard) =>
    a.cardId.length - b.cardId.length || a.cardId.localeCompare(b.cardId);
  // Por el código y no por `num`: las runas (`RAD-R01`) y las showcase (`RAD-SP1`) tienen
  // `num` 1 pero llevan impreso otro código, no `RAD • 001`.
  const propio = new RegExp(`^${codigo.set}-0*${codigo.num}[A-Z*]?$`);
  const propias = cards.filter((c) => propio.test(c.cardId)).sort(orden);
  if (!propias.length) return [];
  const nombres = new Set(propias.map((c) => nombreBase(c.name)));
  const promos = cards
    .filter((c) => c.set !== codigo.set && c.rarity === 'Promo' && nombres.has(nombreBase(c.name)))
    .sort(orden);
  return codigo.promo ? [...promos, ...propias] : [...propias, ...promos];
}
