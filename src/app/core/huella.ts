/**
 * Huella visual de una carta, para reconocerla por la foto. Código puro, sin DOM ni
 * Angular: lo usan la app (con los píxeles de la cámara) y tools/build-huellas.mts
 * (con las imágenes oficiales), y tiene que dar lo mismo en los dos sitios.
 *
 * La huella combina dos cosas de la ilustración:
 *  - un hash perceptual (pHash) de la luminancia: la forma de la imagen, 64 bits;
 *  - una rejilla de color de 4×4 en cromaticidad (r, g normalizados por el brillo),
 *    que separa ilustraciones de forma parecida y aguanta cambios de luz.
 */

/** Zona de la carta que se compara: la ilustración, sin el marco ni la caja de texto. */
export const ZONA_ILUSTRACION = { x: 0.08, y: 0.07, w: 0.84, h: 0.43 } as const;
/** Proporción de una carta (744×1039). */
export const PROPORCION_CARTA = 744 / 1039;

export interface Pixeles {
  data: ArrayLike<number>;
  width: number;
  height: number;
}

export interface Huella {
  /** pHash de 64 bits como dos enteros de 32. */
  hash: [number, number];
  /** 4×4 celdas × (r, g) en cromaticidad, de 0 a 255. */
  color: Uint8Array;
}

const LADO = 32;
const BAJAS = 8;
const REJILLA = 4;

/** Promedia los píxeles de cada celda (remuestreo por área): no depende de cómo escale el navegador. */
function reducir(px: Pixeles, x0: number, y0: number, w: number, h: number, lado: number) {
  const r = new Float64Array(lado * lado);
  const g = new Float64Array(lado * lado);
  const b = new Float64Array(lado * lado);
  const n = new Float64Array(lado * lado);
  const xFin = Math.min(px.width, Math.round(x0 + w));
  const yFin = Math.min(px.height, Math.round(y0 + h));
  const xIni = Math.max(0, Math.round(x0));
  const yIni = Math.max(0, Math.round(y0));
  for (let y = yIni; y < yFin; y++) {
    const cy = Math.min(lado - 1, Math.floor(((y - yIni) * lado) / (yFin - yIni)));
    for (let x = xIni; x < xFin; x++) {
      const cx = Math.min(lado - 1, Math.floor(((x - xIni) * lado) / (xFin - xIni)));
      const i = (y * px.width + x) * 4;
      const c = cy * lado + cx;
      r[c] += px.data[i];
      g[c] += px.data[i + 1];
      b[c] += px.data[i + 2];
      n[c]++;
    }
  }
  for (let c = 0; c < n.length; c++) {
    if (!n[c]) continue;
    r[c] /= n[c];
    g[c] /= n[c];
    b[c] /= n[c];
  }
  return { r, g, b };
}

/** Coeficientes de la DCT-II de 32 puntos, calculados una vez. */
const COSENOS = (() => {
  const t = new Float64Array(BAJAS * LADO);
  for (let u = 0; u < BAJAS; u++)
    for (let x = 0; x < LADO; x++)
      t[u * LADO + x] = Math.cos(((2 * x + 1) * u * Math.PI) / (2 * LADO));
  return t;
})();

function phash(gris: Float64Array): [number, number] {
  // DCT separable, solo las 8×8 frecuencias más bajas.
  const filas = new Float64Array(LADO * BAJAS);
  for (let y = 0; y < LADO; y++)
    for (let u = 0; u < BAJAS; u++) {
      let s = 0;
      for (let x = 0; x < LADO; x++) s += gris[y * LADO + x] * COSENOS[u * LADO + x];
      filas[y * BAJAS + u] = s;
    }
  const coef = new Float64Array(BAJAS * BAJAS);
  for (let v = 0; v < BAJAS; v++)
    for (let u = 0; u < BAJAS; u++) {
      let s = 0;
      for (let y = 0; y < LADO; y++) s += filas[y * BAJAS + u] * COSENOS[v * LADO + y];
      coef[v * BAJAS + u] = s;
    }
  // Sin la componente continua (el brillo medio), umbral en la mediana.
  const valores = Array.from(coef.slice(1));
  const mediana = [...valores].sort((a, b) => a - b)[Math.floor(valores.length / 2)];
  const bits: [number, number] = [0, 0];
  for (let i = 0; i < 64; i++) {
    if (coef[i] > mediana) bits[i >> 5] |= 1 << (i & 31);
  }
  return [bits[0] >>> 0, bits[1] >>> 0];
}

/** Huella de la región (x, y, w, h) de una imagen; sin región, la imagen entera. */
export function calcularHuella(
  px: Pixeles,
  region: { x: number; y: number; w: number; h: number } = {
    x: 0,
    y: 0,
    w: px.width,
    h: px.height,
  },
): Huella {
  const { r, g, b } = reducir(px, region.x, region.y, region.w, region.h, LADO);
  const gris = new Float64Array(LADO * LADO);
  for (let i = 0; i < gris.length; i++) gris[i] = 0.299 * r[i] + 0.587 * g[i] + 0.114 * b[i];

  // La rejilla de color sale de la de 32×32, agrupando bloques de 8×8.
  const color = new Uint8Array(REJILLA * REJILLA * 2);
  const paso = LADO / REJILLA;
  for (let cy = 0; cy < REJILLA; cy++)
    for (let cx = 0; cx < REJILLA; cx++) {
      let sr = 0;
      let sg = 0;
      let st = 0;
      for (let y = cy * paso; y < (cy + 1) * paso; y++)
        for (let x = cx * paso; x < (cx + 1) * paso; x++) {
          const i = y * LADO + x;
          sr += r[i];
          sg += g[i];
          st += r[i] + g[i] + b[i];
        }
      const k = (cy * REJILLA + cx) * 2;
      color[k] = st ? Math.round((255 * sr) / st) : 85;
      color[k + 1] = st ? Math.round((255 * sg) / st) : 85;
    }
  return { hash: phash(gris), color };
}

/** Región de la ilustración dentro de una imagen que es la carta entera. */
export function regionIlustracion(width: number, height: number) {
  return {
    x: ZONA_ILUSTRACION.x * width,
    y: ZONA_ILUSTRACION.y * height,
    w: ZONA_ILUSTRACION.w * width,
    h: ZONA_ILUSTRACION.h * height,
  };
}

function bitsDistintos(a: number, b: number): number {
  let v = (a ^ b) >>> 0;
  let n = 0;
  while (v) {
    v &= v - 1;
    n++;
  }
  return n;
}

/** Peso del color frente a la forma. Ajustado con tools/build-huellas.mts --medir. */
export const PESO_COLOR = 1;

/**
 * Distancia entre dos huellas, de 0 (idénticas) a ~1. La forma cuenta los bits
 * distintos del pHash (sobre 64); el color, la diferencia media de cromaticidad.
 */
export function distancia(a: Huella, b: Huella, pesoColor = PESO_COLOR): number {
  const forma = (bitsDistintos(a.hash[0], b.hash[0]) + bitsDistintos(a.hash[1], b.hash[1])) / 64;
  let dc = 0;
  for (let i = 0; i < a.color.length; i++) dc += Math.abs(a.color[i] - b.color[i]);
  const color = dc / a.color.length / 64;
  return (forma + pesoColor * color) / (1 + pesoColor);
}

/** `"hhhhhhhh:hhhhhhhh:<color en hex>"`, para el JSON del catálogo. */
export function serializarHuella(h: Huella): string {
  const hex = (n: number) => n.toString(16).padStart(8, '0');
  const color = Array.from(h.color, (v) => v.toString(16).padStart(2, '0')).join('');
  return `${hex(h.hash[0])}:${hex(h.hash[1])}:${color}`;
}

export function leerHuella(s: string): Huella | null {
  const [a, b, c] = s.split(':');
  if (!a || !b || !c || c.length !== REJILLA * REJILLA * 4) return null;
  const color = new Uint8Array(c.length / 2);
  for (let i = 0; i < color.length; i++) color[i] = parseInt(c.slice(i * 2, i * 2 + 2), 16);
  return { hash: [parseInt(a, 16) >>> 0, parseInt(b, 16) >>> 0], color };
}

/**
 * Varias huellas de la misma foto, moviendo y escalando un poco la zona: la carta nunca
 * queda exactamente en la guía, y el pHash es sensible a eso. Al comparar se usa la
 * variante que más se parezca a cada carta del catálogo.
 */
export function huellasConMargen(
  px: Pixeles,
  region: { x: number; y: number; w: number; h: number },
  margen = 0.05,
): Huella[] {
  const salida: Huella[] = [];
  for (const escala of [0.94, 1, 1.06])
    for (const dy of [-margen, 0, margen])
      for (const dx of [-margen, 0, margen]) {
        const w = region.w * escala;
        const h = region.h * escala;
        salida.push(
          calcularHuella(px, {
            x: region.x + (region.w - w) / 2 + dx * region.w,
            y: region.y + (region.h - h) / 2 + dy * region.h,
            w,
            h,
          }),
        );
      }
  return salida;
}

export interface Coincidencia {
  cardId: string;
  distancia: number;
}

/** Las `n` cartas más parecidas a cualquiera de las huellas dadas, de más a menos. */
export function masParecidas(
  huellas: readonly Huella[],
  catalogo: ReadonlyMap<string, Huella>,
  n = 5,
  pesoColor = PESO_COLOR,
): Coincidencia[] {
  const todas: Coincidencia[] = [];
  for (const [cardId, h] of catalogo) {
    let mejor = Infinity;
    for (const q of huellas) mejor = Math.min(mejor, distancia(q, h, pesoColor));
    todas.push({ cardId, distancia: mejor });
  }
  return todas.sort((a, b) => a.distancia - b.distancia).slice(0, n);
}
