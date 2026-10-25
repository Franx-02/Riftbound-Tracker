/**
 * Reconocimiento con red neuronal (DINOv2-small), la parte pura: la usan la app
 * (red.service.ts) y las herramientas (tools/build-vectores.mts, tools/medir-red.mts),
 * así que la app compara exactamente con lo que se generó.
 *
 * Por qué así (medido con tools/medir-red.mts, carta del 45 % al 110 % de la guía):
 *  - Condiciones normales: huella sola 96 %, red sola 85 %, las dos juntas 98 % a la primera.
 *  - Condiciones duras (reflejos fuertes, más perspectiva, mala luz): huella 78 %,
 *    red 83 %, juntas 95 %. La huella localiza bien la carta y la red aguanta la luz.
 */
import { Coincidencia, Pixeles, ZONA_ILUSTRACION } from './huella';
import { Encuadre, Reconocimiento } from './reconocimiento';

export const MODELO_RED = 'Xenova/dinov2-small';

/** La ilustración de una carta encuadrada en `e`, en RGB, lista para la red. */
export function recortarZonaRed(px: Pixeles, e: Encuadre) {
  const x0 = Math.max(0, Math.round(e.x + ZONA_ILUSTRACION.x * e.w));
  const y0 = Math.max(0, Math.round(e.y + ZONA_ILUSTRACION.y * e.h));
  const w = Math.max(1, Math.min(px.width - x0, Math.round(ZONA_ILUSTRACION.w * e.w)));
  const h = Math.max(1, Math.min(px.height - y0, Math.round(ZONA_ILUSTRACION.h * e.h)));
  const data = new Uint8ClampedArray(w * h * 3);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = ((y0 + y) * px.width + x0 + x) * 4;
      const o = (y * w + x) * 3;
      data[o] = px.data[i];
      data[o + 1] = px.data[i + 1];
      data[o + 2] = px.data[i + 2];
    }
  return { data, width: w, height: h };
}

/**
 * El vector normalizado a partir de la salida de la red: [1, dim] tal cual, [1, tokens,
 * dim] → el token CLS (el primero), [1, C, H, W] → la media de cada canal.
 */
export function vectorDeSalida(datos: ArrayLike<number>, dims: readonly number[]): Float32Array {
  let v: Float32Array;
  if (dims.length === 4) {
    const [, C, H, W] = dims;
    v = new Float32Array(C);
    for (let c = 0; c < C; c++) {
      let s = 0;
      for (let i = 0; i < H * W; i++) s += datos[c * H * W + i];
      v[c] = s / (H * W);
    }
  } else v = Float32Array.from({ length: dims[dims.length - 1] }, (_, i) => datos[i]);
  let n = 0;
  for (const x of v) n += x * x;
  n = Math.sqrt(n) || 1;
  return v.map((x) => x / n);
}

/** Vectores del catálogo, cuantizados a int8 (ver tools/build-vectores.mts). */
export interface CatalogoRed {
  ids: string[];
  dim: number;
  datos: Int8Array;
}

/** Parecido (coseno, de -1 a 1) de cada carta del catálogo con el mejor de los `vectores`. */
export function puntuarRed(
  vectores: readonly Float32Array[],
  cat: CatalogoRed,
): Map<string, number> {
  const salida = new Map<string, number>();
  for (let i = 0; i < cat.ids.length; i++) {
    let mejor = -1;
    for (const v of vectores) {
      let s = 0;
      for (let j = 0; j < cat.dim; j++) s += v[j] * cat.datos[i * cat.dim + j];
      mejor = Math.max(mejor, s / 127);
    }
    // Un mismo id puede salir varias veces (campos de batalla, girados a cada lado).
    salida.set(cat.ids[i], Math.max(mejor, salida.get(cat.ids[i]) ?? -1));
  }
  return salida;
}

/** Cuánto suma la huella a una candidata: más cuanto más cerca (ver PESO en medir-red). */
const bonoHuella = (distancia: number) => Math.max(0, 0.25 - distancia);

export interface ResultadoCombinado {
  /** Cartas ordenadas por puntuación (la `distancia` aquí es 1 − puntuación). */
  candidatas: Coincidencia[];
  /** Diferencia con la siguiente carta de otro nombre: cuanto más, más clara. */
  margen: number;
}

/**
 * Junta la red (parecido de cada carta) con la huella (sus candidatas y distancias).
 * `nombreBase` agrupa versiones de la misma carta (normal, alt art, firmada…) para que
 * el margen se mida contra otra carta, no contra una versión gemela.
 */
export function combinarRedYHuella(
  red: ReadonlyMap<string, number>,
  huella: Reconocimiento,
  nombreBase: (cardId: string) => string,
  descartadas: ReadonlySet<string> = new Set(),
): ResultadoCombinado {
  const puntos = new Map(red);
  for (const c of huella.candidatas)
    puntos.set(c.cardId, (puntos.get(c.cardId) ?? 0) + bonoHuella(c.distancia));
  const orden = [...puntos].filter(([id]) => !descartadas.has(id)).sort((a, b) => b[1] - a[1]);
  if (!orden.length) return { candidatas: [], margen: 0 };
  const primera = nombreBase(orden[0][0]);
  const otra = orden.find(([id]) => nombreBase(id) !== primera);
  return {
    candidatas: orden.slice(0, 5).map(([cardId, p]) => ({ cardId, distancia: 1 - p })),
    margen: otra ? orden[0][1] - otra[1] : 1,
  };
}

/** Margen con el que una sola lectura basta para parar. */
export const MARGEN_INMEDIATO = 0.15;
/** Margen mínimo para que una lectura cuente como voto. */
export const MARGEN_VOTO = 0.05;

/**
 * Cuándo parar con la red: una lectura muy clara (margen ≥ 0,15) o dos seguidas con la
 * misma carta y margen ≥ 0,05. En la simulación, los aciertos tienen margen ≥ 0,09 en
 * el 90 % de los casos y los fallos ≤ 0,03 en el 90 %.
 */
export class VotacionRed {
  private anterior: string | null = null;

  anadir(r: ResultadoCombinado): string | null {
    const primera = r.candidatas[0]?.cardId ?? null;
    if (!primera || r.margen < MARGEN_VOTO) {
      this.anterior = null;
      return null;
    }
    if (r.margen >= MARGEN_INMEDIATO || primera === this.anterior) return primera;
    this.anterior = primera;
    return null;
  }

  reiniciar(): void {
    this.anterior = null;
  }
}
