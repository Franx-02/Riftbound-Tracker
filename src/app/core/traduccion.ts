/**
 * Traducciones al español (F4). Funciones puras compartidas por la app y por
 * tools/traducir.mts. El glosario está en docs/glosario.md.
 *
 * Cada traducción se guarda bajo una clave calculada a partir del texto inglés, no
 * del código de la carta: así las alt arts y reimpresiones (mismo texto) comparten
 * traducción, y si Riot corrige el texto de una carta la clave cambia y la carta
 * vuelve al inglés en vez de enseñar una traducción desfasada.
 */

/** cyrb53: hash rápido de 53 bits. Con ~2.000 textos, una colisión es improbabilísima. */
export function claveTexto(texto: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < texto.length; i++) {
    const ch = texto.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

export interface OpcionesValidacion {
  /** Decisión 1 del glosario: las keywords entre corchetes se quedan en inglés. */
  keywordsEnIngles: boolean;
}

const contar = (texto: string, patron: RegExp): Map<string, number> => {
  const m = new Map<string, number>();
  for (const x of texto.match(patron) ?? []) m.set(x, (m.get(x) ?? 0) + 1);
  return m;
};

function diferencias(nombre: string, en: Map<string, number>, es: Map<string, number>): string[] {
  const problemas: string[] = [];
  for (const k of new Set([...en.keys(), ...es.keys()])) {
    const a = en.get(k) ?? 0;
    const b = es.get(k) ?? 0;
    if (a !== b) problemas.push(`${nombre} «${k}»: ${a} en inglés, ${b} en español`);
  }
  return problemas;
}

/**
 * Comprueba que la traducción conserva todo lo que no se traduce: símbolos del juego,
 * flechas, keywords, números, viñetas y saltos de línea. Devuelve la lista de
 * problemas; vacía si está bien.
 */
export function validarTraduccion(en: string, es: string, opciones: OpcionesValidacion): string[] {
  if (!es.trim()) return ['La traducción está vacía'];
  const problemas = [
    ...diferencias('Símbolo', contar(en, /:rb_[a-z0-9_]+:/g), contar(es, /:rb_[a-z0-9_]+:/g)),
    ...diferencias('Flecha', contar(en, /\[>+\]/g), contar(es, /\[>+\]/g)),
    ...diferencias(
      'Número',
      contar(en.replace(/:rb_[a-z0-9_]+:/g, ''), /\d+/g),
      contar(es.replace(/:rb_[a-z0-9_]+:/g, ''), /\d+/g),
    ),
  ];
  const corchetes = /\[(?!>)[^\]]+\]/g;
  if (opciones.keywordsEnIngles) {
    problemas.push(...diferencias('Keyword', contar(en, corchetes), contar(es, corchetes)));
  } else {
    const a = en.match(corchetes)?.length ?? 0;
    const b = es.match(corchetes)?.length ?? 0;
    if (a !== b) problemas.push(`Keywords entre corchetes: ${a} en inglés, ${b} en español`);
  }
  const lineas = (t: string) => t.split('\n').length;
  if (lineas(en) !== lineas(es))
    problemas.push(`Líneas: ${lineas(en)} en inglés, ${lineas(es)} en español`);
  const vinetas = (t: string) => (t.match(/^• /gm) ?? []).length;
  if (vinetas(en) !== vinetas(es))
    problemas.push(`Viñetas: ${vinetas(en)} en inglés, ${vinetas(es)} en español`);
  return problemas;
}

/** Etiquetas de los filtros y de la ficha (docs/glosario.md). Lo que no está, en inglés. */
export const ETIQUETAS_ES: Readonly<Record<string, string>> = {
  Unit: 'Unidad',
  Spell: 'Hechizo',
  Gear: 'Equipo',
  Legend: 'Leyenda',
  Rune: 'Runa',
  Battlefield: 'Campo de batalla',
  Champion: 'Campeón',
  Basic: 'Básica',
  Signature: 'Firma',
  Token: 'Ficha',
  Fury: 'Furia',
  Calm: 'Calma',
  Mind: 'Mente',
  Body: 'Cuerpo',
  Chaos: 'Caos',
  Order: 'Orden',
  Colorless: 'Incolora',
  Common: 'Común',
  Uncommon: 'Infrecuente',
  Rare: 'Rara',
  Epic: 'Épica',
};
