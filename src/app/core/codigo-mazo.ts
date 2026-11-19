/**
 * Códigos de mazo de Riftbound (los que comparten Riftmana y compañía): un texto en
 * base32 como "CMAAAAAAAAAQCAAB…". Dentro van varints, al estilo de los códigos de Legends
 * of Runeterra:
 *
 *   [cabecera]                        0x13 en todos los códigos vistos (versión/formato).
 *   Para cantidad = 12, 11, …, 1:     [nº de grupos] y por grupo [nº de cartas, set, variante,
 *                                     números de carta…]. Aquí van Leyenda, Campeón, mazo
 *                                     principal, runas y campos de batalla, todo junto.
 *   Para cantidad = 3, 2, 1:          lo mismo, con el banquillo.
 *   [1, set, variante, número]        el Campeón elegido.
 *
 * El set es un índice por orden de salida (0 Origins, 1 Proving Grounds, 3 Spiritforged,
 * 4 Unleashed, 5 Vendetta, 6 Radiance); la variante 1 es el arte alternativo (sufijo A).
 * Deducido de códigos reales contrastados con su lista: lo que no cuadre con esto saldrá en
 * `noEncontradas` en vez de romper la importación.
 */

const ALFABETO = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** Índice de set dentro del código → prefijo de nuestros cardId. */
export const SETS_CODIGO: Record<number, string> = {
  0: 'OGN',
  1: 'OGS',
  3: 'SFD',
  4: 'UNL',
  5: 'VEN',
  6: 'RAD',
};

/** Variante dentro del código → sufijo del cardId. */
const VARIANTES: Record<number, string> = { 0: '', 1: 'A' };

export interface EntradaCodigo {
  /** cardId tal como lo usa el catálogo (OGN-166A) o, si el set no se conoce, "set 2 #15". */
  cardId: string;
  copias: number;
  /** Lo que la app no conoce no se puede resolver, pero se dice cuál era. */
  conocida: boolean;
}

export interface CodigoMazo {
  /** Leyenda, Campeón, principal, runas y campos, sin separar (el tipo de carta los separa). */
  cartas: EntradaCodigo[];
  banquillo: EntradaCodigo[];
  /** El Campeón elegido, si el código lo trae. */
  campeon: EntradaCodigo | null;
}

/** ¿Tiene pinta de código de mazo? Solo letras y dígitos 2-7, sin espacios, y largo. */
export function pareceCodigoMazo(texto: string): boolean {
  const t = texto.trim().replace(/=+$/, '');
  return t.length >= 24 && /^[A-Z2-7]+$/i.test(t);
}

export function base32aBytes(texto: string): Uint8Array {
  const limpio = texto.trim().toUpperCase().replace(/=+$/, '');
  const bytes: number[] = [];
  let acumulado = 0;
  let bits = 0;
  for (const ch of limpio) {
    const v = ALFABETO.indexOf(ch);
    if (v < 0) throw new Error(`Carácter raro en el código: "${ch}"`);
    acumulado = (acumulado << 5) | v;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((acumulado >> bits) & 0xff);
    }
  }
  return Uint8Array.from(bytes);
}

/** Lee todos los varints (7 bits por byte, el alto marca "sigue"). */
export function leerVarints(bytes: Uint8Array): number[] {
  const out: number[] = [];
  let n = 0;
  let desplazamiento = 0;
  for (const b of bytes) {
    n |= (b & 0x7f) << desplazamiento;
    desplazamiento += 7;
    if (!(b & 0x80)) {
      out.push(n);
      n = 0;
      desplazamiento = 0;
    }
  }
  return out;
}

function cardId(set: number, variante: number, numero: number): EntradaCodigo {
  const prefijo = SETS_CODIGO[set];
  const sufijo = VARIANTES[variante];
  if (!prefijo || sufijo === undefined) {
    return { cardId: `set ${set} #${numero}${variante ? ` v${variante}` : ''}`, copias: 0, conocida: false };
  }
  return { cardId: `${prefijo}-${String(numero).padStart(3, '0')}${sufijo}`, copias: 0, conocida: true };
}

/**
 * Descodifica un código. Lanza si no es base32 o se queda sin datos a medias; lo que no se
 * reconozca (sets o variantes nuevos) sale con `conocida: false`.
 */
export function descodificarCodigoMazo(codigo: string): CodigoMazo {
  const v = leerVarints(base32aBytes(codigo));
  let i = 1; // la cabecera no se usa
  const siguiente = (): number => {
    if (i >= v.length) throw new Error('El código está incompleto');
    return v[i++];
  };
  const leerSecciones = (desde: number): EntradaCodigo[] => {
    const entradas: EntradaCodigo[] = [];
    for (let copias = desde; copias >= 1; copias--) {
      const grupos = siguiente();
      for (let g = 0; g < grupos; g++) {
        const n = siguiente();
        const set = siguiente();
        const variante = siguiente();
        for (let k = 0; k < n; k++) entradas.push({ ...cardId(set, variante, siguiente()), copias });
      }
    }
    return entradas;
  };
  const cartas = leerSecciones(12);
  // El banquillo solo admite hasta 3 copias. Un código sin banquillo puede acabar aquí.
  const banquillo = i < v.length - 4 ? leerSecciones(3) : [];
  let campeon: EntradaCodigo | null = null;
  if (v.length - i >= 4) {
    siguiente(); // siempre 1
    const set = siguiente();
    const variante = siguiente();
    campeon = { ...cardId(set, variante, siguiente()), copias: 1 };
  }
  return { cartas, banquillo, campeon };
}

/**
 * El código convertido a la lista en texto que entiende `importarMazo`, para que la zona de
 * cada carta (Leyenda, runas, campos…) se decida igual que al pegar una lista.
 */
export function codigoATexto(codigo: string): string {
  const d = descodificarCodigoMazo(codigo);
  const linea = (e: EntradaCodigo) => `${e.copias} ${e.cardId}`;
  const cartas = d.cartas.map((e) => ({ ...e }));
  if (d.campeon) {
    // La copia del Campeón va dentro del mazo principal: se saca de ahí para la sección propia.
    const dentro = cartas.find((e) => e.cardId === d.campeon!.cardId);
    if (dentro) dentro.copias -= 1;
  }
  return [
    ...cartas.filter((e) => e.copias > 0).map(linea),
    ...(d.banquillo.length ? ['Sideboard:', ...d.banquillo.map(linea)] : []),
    ...(d.campeon ? ['Champion:', linea(d.campeon)] : []),
  ].join('\n');
}
