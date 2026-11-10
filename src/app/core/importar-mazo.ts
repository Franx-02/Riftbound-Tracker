import { CatalogCard } from './catalog.service';
import { Mazo, NUM_CAMPOS, esCampeonDe, esCampo, esLeyenda, esRuna, mazoVacio } from './mazos';

/** Resultado de leer una lista de mazo en texto. */
export interface MazoImportado {
  mazo: Mazo;
  /** Líneas que no se han podido reconocer, tal cual venían. */
  noEncontradas: string[];
  /** Total de cartas reconocidas. */
  cartas: number;
}

type Seccion = 'leyenda' | 'campeon' | 'principal' | 'runas' | 'campos' | 'banquillo' | null;

/** Cabeceras de sección en inglés y en español (con o sin dos puntos y recuento). */
const SECCIONES: [RegExp, Seccion][] = [
  [/^(legend|leyenda)s?$/, 'leyenda'],
  [/^(chosen )?(champion|campe[oó]n)(es)?( elegido)?$/, 'campeon'],
  [/^(main( deck)?|deck|mazo( principal)?|principal)$/, 'principal'],
  [/^(runes?|rune deck|runas?|mazo de runas)$/, 'runas'],
  [/^(battlefields?|campos?( de batalla)?)$/, 'campos'],
  [/^(sideboard|side ?deck|side|banquillo)$/, 'banquillo'],
];

const normalizar = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[’`]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Lee una lista de mazo en texto: la que exporta esta app y las de las webs de mazos
 * habituales. Cada carta en una línea, "3 Brawl", "3x Brawl", "Brawl x3" o
 * "3 Brawl (OGN-004)"; el código entre paréntesis, si viene, manda sobre el nombre. Las
 * cabeceras (Legend, Champion, Main Deck, Runes, Battlefields, Sideboard o en español)
 * son opcionales: sin ellas cada carta va a la zona que le toca por tipo, y el Campeón
 * elegido es la primera unidad de campeón de la Leyenda.
 */
export function importarMazo(
  texto: string,
  cartas: readonly CatalogCard[],
  id: string,
): MazoImportado {
  const porId = new Map(cartas.map((c) => [c.cardId.toUpperCase(), c]));
  // Por nombre, la impresión normal antes que las variantes de arte.
  const porNombre = new Map<string, CatalogCard>();
  for (const c of [...cartas].sort(
    (a, b) =>
      Number(a.alt || a.signature || a.overnumbered) -
      Number(b.alt || b.signature || b.overnumbered),
  )) {
    const clave = normalizar(c.name);
    if (!porNombre.has(clave)) porNombre.set(clave, c);
  }

  let nombre = 'Mazo importado';
  const mazo = mazoVacio(id, nombre);
  const noEncontradas: string[] = [];
  let total = 0;
  let seccion: Seccion = null;
  let campeonExplicito = false;

  for (const bruta of texto.split(/\r?\n/)) {
    const linea = bruta.trim();
    if (!linea || linea.startsWith('//')) continue;
    if (linea.startsWith('#')) {
      if (nombre === 'Mazo importado') nombre = linea.replace(/^#+\s*/, '').trim() || nombre;
      continue;
    }
    const cabecera = normalizar(
      linea.replace(/[:\s]*(\(\d+\))?\s*:?\s*$/, '').replace(/\s*\d+$/, ''),
    );
    const s = SECCIONES.find(([re]) => re.test(cabecera));
    if (s && !/^\d/.test(linea)) {
      seccion = s[1];
      continue;
    }

    let n = 1;
    let resto = linea;
    const delante = linea.match(/^(\d+)\s*x?\s+(.+)$/i);
    const detras = linea.match(/^(.+?)\s+x\s*(\d+)$/i);
    if (delante) [n, resto] = [Number(delante[1]), delante[2]];
    else if (detras) [n, resto] = [Number(detras[2]), detras[1]];
    if (!n || n > 99) {
      noEncontradas.push(linea);
      continue;
    }
    const codigo = resto.match(/\(([A-Z0-9]{2,5}-\d{1,4}[A-Z*]?)\)\s*$/i)?.[1];
    const sinCodigo = resto.replace(/\s*\([A-Z0-9]{2,5}-[^)]*\)\s*$/i, '');
    const card =
      (codigo && porId.get(codigo.toUpperCase())) ||
      porId.get(sinCodigo.toUpperCase()) ||
      porNombre.get(normalizar(sinCodigo));
    if (!card) {
      noEncontradas.push(linea);
      continue;
    }
    total += n;

    const zona =
      seccion ??
      (esLeyenda(card)
        ? 'leyenda'
        : esRuna(card)
          ? 'runas'
          : esCampo(card)
            ? 'campos'
            : 'principal');
    switch (zona) {
      case 'leyenda':
        mazo.leyenda = card.cardId;
        break;
      case 'campeon':
        mazo.campeon = card.cardId;
        campeonExplicito = true;
        if (n > 1) sumar(mazo.principal, card.cardId, n - 1);
        break;
      case 'campos':
        // Los campos van sin repetir y son NUM_CAMPOS: lo demás no lo admiten las reglas.
        if (!mazo.campos.includes(card.cardId) && mazo.campos.length < NUM_CAMPOS)
          mazo.campos.push(card.cardId);
        break;
      case 'runas':
        sumar(mazo.runas, card.cardId, n);
        break;
      case 'banquillo':
        sumar(mazo.banquillo, card.cardId, n);
        break;
      default:
        sumar(mazo.principal, card.cardId, n);
    }
  }

  // Sin sección de Campeón: se saca una copia de la primera unidad de campeón de la Leyenda.
  const leyenda = mazo.leyenda ? porId.get(mazo.leyenda) : undefined;
  if (!campeonExplicito && leyenda) {
    const id = Object.keys(mazo.principal).find((x) => {
      const c = porId.get(x);
      return c && esCampeonDe(c, leyenda);
    });
    if (id) {
      mazo.campeon = id;
      sumar(mazo.principal, id, -1);
    }
  }
  mazo.nombre = nombre;
  return { mazo, noEncontradas, cartas: total };
}

function sumar(zona: Record<string, number>, id: string, n: number): void {
  const v = (zona[id] ?? 0) + n;
  if (v > 0) zona[id] = v;
  else delete zona[id];
}
