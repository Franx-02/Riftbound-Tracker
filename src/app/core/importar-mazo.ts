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
 * habituales. Cada carta en una línea, "3 Brawl", "3x Brawl", "Brawl x3", "3 Brawl (OGN-004)"
 * o "3xOGN-004" (Riftmana); el código, si viene, manda sobre el nombre. Las
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
  // Por nombre, la impresión que uno tiene en la mano: la de un set normal antes que la de
  // un set de promos (el catálogo empieza por JDG, OPP y PR, que repiten nombres de los
  // sets normales) y la normal antes que las variantes de arte.
  const porNombre = new Map<string, CatalogCard>();
  for (const c of [...cartas].sort((a, b) => prioridad(a) - prioridad(b))) {
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
    let linea = bruta.replace(/ /g, ' ').trim();
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
    // "Legend: Jinx, Loose Cannon": cabecera y carta en la misma línea.
    const enLinea = linea.match(/^([^:\d][^:]*):\s*(\S.*)$/);
    const s2 = enLinea && SECCIONES.find(([re]) => re.test(normalizar(enLinea[1])));
    if (enLinea && s2) {
      seccion = s2[1];
      linea = enLinea[2].trim();
    }

    let n = 1;
    let resto = linea;
    // "3 Brawl", "3x Brawl", "3 x Brawl" y "3xOGN-004" (así exporta Riftmana, sin espacio).
    const delante = linea.match(/^(\d+)(?:x\s*|\s+x\s+|\s+)(.+)$/i);
    const detras = linea.match(/^(.+?)\s+x\s*(\d+)$/i);
    if (delante) [n, resto] = [Number(delante[1]), delante[2]];
    else if (detras) [n, resto] = [Number(detras[2]), detras[1]];
    if (!n || n > 99) {
      noEncontradas.push(linea);
      continue;
    }
    // El código puede venir entre paréntesis o corchetes, con número de colección
    // ("OGN-004/298") o suelto al principio o al final. Solo cuenta si existe en el catálogo.
    const codigo = [...resto.matchAll(CODIGO)].map((m) => m[1].toUpperCase()).find((c) => porId.has(c));
    const sinCodigo = codigo
      ? resto.replace(CODIGO_ENVUELTO, (m, c: string) => (c.toUpperCase() === codigo ? ' ' : m)).trim()
      : resto;
    const card =
      (codigo && porId.get(codigo)) ||
      porId.get(sinCodigo.toUpperCase()) ||
      porNombre.get(normalizar(sinCodigo)) ||
      // "Brawl (Alternate Art)", "Brawl [Foil]": lo de entre paréntesis sobra si el nombre vale.
      porNombre.get(normalizar(sinCodigo.replace(/\s*[([][^)\]]*[)\]]\s*$/, '')));
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

/** Un código de carta (OGN-004, SFD-R01B, VEN-SP5, OGN-299*) que no sea parte de otra palabra. */
const CODIGO = /(?<![A-Z0-9])([A-Z]{2,5}-[A-Z]{0,2}\d{1,4}[A-Z*]?)(?:\/\d+)?(?![A-Z0-9])/gi;
/** El mismo código con sus paréntesis o corchetes y el número de colección, para quitarlo. */
const CODIGO_ENVUELTO = /\s*[([]?([A-Z]{2,5}-[A-Z]{0,2}\d{1,4}[A-Z*]?)(?:\/\d+)?[)\]]?\s*/gi;

/** Sets de promos: repiten cartas de los sets normales y nadie los pone en una lista. */
const esPromo = (c: CatalogCard) =>
  /promo|bundle|judge/i.test(c.setName) || /^(JDG|OPP|PR|RWB|SGN)-/.test(c.cardId);

/** Qué impresión elegir cuando una línea solo trae el nombre: menor gana. */
function prioridad(c: CatalogCard): number {
  return (
    (c.alt || c.signature || c.overnumbered ? 4 : 0) +
    (esPromo(c) ? 2 : 0) +
    // Dentro del mismo set, el número normal antes que las reimpresiones con letra (R01B).
    (/^[A-Z]{2,5}-\d{1,4}$/.test(c.cardId) ? 0 : 1)
  );
}

function sumar(zona: Record<string, number>, id: string, n: number): void {
  const v = (zona[id] ?? 0) + n;
  if (v > 0) zona[id] = v;
  else delete zona[id];
}
