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

/**
 * Sumas acumuladas de una imagen: `r[y * (W + 1) + x]` es la suma del rojo de todos los
 * píxeles por encima y a la izquierda de (x, y). Con ellas, la suma de cualquier rectángulo
 * son cuatro lecturas en vez de recorrer sus píxeles.
 */
interface Sumas {
  r: Uint32Array;
  g: Uint32Array;
  b: Uint32Array;
}
const SUMAS = new WeakMap<object, Sumas>();

/**
 * Prepara una imagen de la que se van a sacar muchas huellas (el escáner saca más de 200
 * por fotograma, de zonas que se solapan). A partir de aquí `calcularHuella` da
 * exactamente lo mismo, bit a bit, pero sin volver a recorrer los píxeles de cada zona:
 * son sumas de enteros, y un entero se suma igual en cualquier orden. Con una sola
 * huella por imagen (las herramientas) no hace falta llamarla.
 */
export function prepararPixeles(px: Pixeles): void {
  if (SUMAS.has(px)) return;
  // Solo con bytes (lo que dan el canvas y sharp) y mientras la suma quepa en 32 bits.
  if (!(px.data instanceof Uint8Array || px.data instanceof Uint8ClampedArray)) return;
  const W = px.width;
  const H = px.height;
  if (W * H * 255 >= 2 ** 32 || px.data.length < W * H * 4) return;
  const d = px.data;
  const ancho = W + 1;
  const r = new Uint32Array(ancho * (H + 1));
  const g = new Uint32Array(ancho * (H + 1));
  const b = new Uint32Array(ancho * (H + 1));
  for (let y = 0; y < H; y++) {
    let fr = 0;
    let fg = 0;
    let fb = 0;
    let i = y * W * 4;
    const arriba = y * ancho;
    const aqui = arriba + ancho;
    for (let x = 0; x < W; x++, i += 4) {
      fr += d[i];
      fg += d[i + 1];
      fb += d[i + 2];
      r[aqui + x + 1] = r[arriba + x + 1] + fr;
      g[aqui + x + 1] = g[arriba + x + 1] + fg;
      b[aqui + x + 1] = b[arriba + x + 1] + fb;
    }
  }
  SUMAS.set(px, { r, g, b });
}

/** Promedia los píxeles de cada celda (remuestreo por área): no depende de cómo escale el navegador. */
function reducir(px: Pixeles, x0: number, y0: number, w: number, h: number, lado: number) {
  const r = new Float64Array(lado * lado);
  const g = new Float64Array(lado * lado);
  const b = new Float64Array(lado * lado);
  const xFin = Math.min(px.width, Math.round(x0 + w));
  const yFin = Math.min(px.height, Math.round(y0 + h));
  const xIni = Math.max(0, Math.round(x0));
  const yIni = Math.max(0, Math.round(y0));
  const sumas = SUMAS.get(px);
  if (sumas) {
    // Mismas celdas que el bucle de abajo: el píxel x cae en la celda
    // ⌊(x − xIni)·lado / anchoZona⌋, o sea, la celda c va de ⌈c·ancho/lado⌉ a ⌈(c+1)·ancho/lado⌉.
    const anchoZona = xFin - xIni;
    const altoZona = yFin - yIni;
    if (anchoZona <= 0 || altoZona <= 0) return { r, g, b };
    const paso = px.width + 1;
    for (let cy = 0; cy < lado; cy++) {
      const ya = yIni + Math.ceil((cy * altoZona) / lado);
      const yb = yIni + Math.ceil(((cy + 1) * altoZona) / lado);
      if (yb <= ya) continue;
      for (let cx = 0; cx < lado; cx++) {
        const xa = xIni + Math.ceil((cx * anchoZona) / lado);
        const xb = xIni + Math.ceil(((cx + 1) * anchoZona) / lado);
        if (xb <= xa) continue;
        const n = (yb - ya) * (xb - xa);
        const a = ya * paso + xa;
        const bb = ya * paso + xb;
        const cc = yb * paso + xa;
        const dd = yb * paso + xb;
        const c = cy * lado + cx;
        r[c] = (sumas.r[dd] - sumas.r[bb] - sumas.r[cc] + sumas.r[a]) / n;
        g[c] = (sumas.g[dd] - sumas.g[bb] - sumas.g[cc] + sumas.g[a]) / n;
        b[c] = (sumas.b[dd] - sumas.b[bb] - sumas.b[cc] + sumas.b[a]) / n;
      }
    }
    return { r, g, b };
  }
  const n = new Float64Array(lado * lado);
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

/** El catálogo en vectores planos, para comparar miles de huellas sin saltar entre objetos. */
interface Compacto {
  tamano: number;
  ids: string[];
  h0: Uint32Array;
  h1: Uint32Array;
  /** `celdas` bytes de color por carta, seguidos. */
  color: Uint8Array;
  celdas: number;
}
const COMPACTOS = new WeakMap<object, Compacto>();

function compactar(catalogo: ReadonlyMap<string, Huella>): Compacto {
  const previo = COMPACTOS.get(catalogo);
  if (previo && previo.tamano === catalogo.size) return previo;
  const celdas = REJILLA * REJILLA * 2;
  const c: Compacto = {
    tamano: catalogo.size,
    ids: [],
    h0: new Uint32Array(catalogo.size),
    h1: new Uint32Array(catalogo.size),
    color: new Uint8Array(catalogo.size * celdas),
    celdas,
  };
  let i = 0;
  for (const [cardId, h] of catalogo) {
    c.ids.push(cardId);
    c.h0[i] = h.hash[0];
    c.h1[i] = h.hash[1];
    c.color.set(h.color, i * celdas);
    i++;
  }
  COMPACTOS.set(catalogo, c);
  return c;
}

/** Bits a 1 de un entero de 32 bits. */
function unos(v: number): number {
  v = v - ((v >>> 1) & 0x55555555);
  v = (v & 0x33333333) + ((v >>> 2) & 0x33333333);
  return (((v + (v >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
}

/**
 * La menor `distancia` entre la huella `q` y la carta `i` del catálogo compacto, si es
 * menor que `tope`; si no, `tope`. La forma sola ya da un mínimo de la distancia (el color
 * solo suma): cuando ese mínimo no baja del tope no hace falta mirar el color, y el
 * resultado es el mismo. La cuenta es la de `distancia()`, operación por operación.
 */
function distanciaCompacta(
  q: Huella,
  c: Compacto,
  i: number,
  pesoColor: number,
  tope: number,
): number {
  const forma = (unos((q.hash[0] ^ c.h0[i]) >>> 0) + unos((q.hash[1] ^ c.h1[i]) >>> 0)) / 64;
  if (forma / (1 + pesoColor) >= tope) return tope;
  const base = i * c.celdas;
  let dc = 0;
  for (let k = 0; k < c.celdas; k++) dc += Math.abs(q.color[k] - c.color[base + k]);
  const d = (forma + pesoColor * (dc / c.celdas / 64)) / (1 + pesoColor);
  return d < tope ? d : tope;
}

/** Las `n` cartas más parecidas a cualquiera de las huellas dadas, de más a menos. */
export function masParecidas(
  huellas: readonly Huella[],
  catalogo: ReadonlyMap<string, Huella>,
  n = 5,
  pesoColor = PESO_COLOR,
): Coincidencia[] {
  const c = compactar(catalogo);
  const todas: Coincidencia[] = [];
  for (let i = 0; i < c.ids.length; i++) {
    let mejor = Infinity;
    for (const q of huellas) mejor = distanciaCompacta(q, c, i, pesoColor, mejor);
    todas.push({ cardId: c.ids[i], distancia: mejor });
  }
  return todas.sort((a, b) => a.distancia - b.distancia).slice(0, n);
}

/**
 * La distancia de la carta más parecida a `huella`: lo mismo que
 * `masParecidas([huella], catalogo, 1)[0]?.distancia`, sin ordenar el catálogo entero.
 * El escáner la pide para cada sitio donde podría estar la carta.
 */
export function menorDistancia(
  huella: Huella,
  catalogo: ReadonlyMap<string, Huella>,
  pesoColor = PESO_COLOR,
): number | undefined {
  const c = compactar(catalogo);
  if (!c.ids.length) return undefined;
  let mejor = Infinity;
  for (let i = 0; i < c.ids.length; i++) mejor = distanciaCompacta(huella, c, i, pesoColor, mejor);
  return mejor;
}
