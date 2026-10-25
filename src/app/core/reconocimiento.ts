/**
 * Reconocimiento de cartas por la imagen: la parte pura (sin Angular), para que la
 * use la app y también tools/build-huellas.mts --medir, que así mide exactamente lo
 * mismo que hace el escáner.
 */
import {
  Coincidencia,
  PROPORCION_CARTA,
  Huella,
  Pixeles,
  calcularHuella,
  distancia,
  huellasConMargen,
  masParecidas,
  regionIlustracion,
} from './huella';

/** Por debajo de esto, dos cartas tienen la misma ilustración (firmada, promo reimpresa…). */
export const GEMELAS = 0.04;
/** Medido con tools/build-huellas.mts --medir: un acierto claro suele quedar por debajo. */
export const DISTANCIA_SEGURA = 0.14;
/** Y con al menos este margen respecto a la siguiente carta de otra ilustración. */
export const MARGEN_SEGURO = 0.03;

/**
 * Tamaños de carta que se prueban, respecto a la guía. Desde el 45 %: con el móvil,
 * para enfocar hay que alejar la carta y casi nunca llena el recuadro.
 */
export const ESCALAS = [0.45, 0.52, 0.6, 0.68, 0.77, 0.86, 0.96, 1.06, 1.16];

/** Dónde podría estar la carta entera dentro de la imagen, en píxeles. */
export interface Encuadre {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Reconocimiento {
  /** Las más parecidas, de más a menos. */
  candidatas: Coincidencia[];
  /** La primera es casi seguro la buena: la cámara puede pararse sola con una sola lectura. */
  segura: boolean;
  /** Distancia hasta la siguiente carta de otra ilustración (cuanto más, más clara). */
  margen: number;
  /** El encuadre donde mejor encaja una carta: de ahí se recorta el título para el OCR. */
  encuadre: Encuadre | null;
}

/**
 * Encuadres con forma de carta alrededor de `centro`: distintos tamaños y pequeños
 * desplazamientos, porque nadie encaja la carta exactamente en la guía.
 */
export function encuadresAlrededor(
  centro: Encuadre,
  escalas = ESCALAS,
  desplazamiento = 0.07,
): Encuadre[] {
  const salida: Encuadre[] = [];
  for (const e of escalas) {
    // Una carta pequeña puede estar en más sitios dentro de la guía: más desplazamientos.
    const libre = Math.max(desplazamiento, (1 - e) / 2);
    const pasos = e < 0.8 ? [-libre, -libre / 2, 0, libre / 2, libre] : [-libre, 0, libre];
    for (const dy of pasos)
      for (const dx of pasos) {
        const w = centro.w * e;
        const h = centro.h * e;
        salida.push({
          x: centro.x + (centro.w - w) / 2 + dx * centro.w,
          y: centro.y + (centro.h - h) / 2 + dy * centro.h,
          w,
          h,
        });
      }
  }
  return salida;
}

/**
 * Reconoce la carta de `px`. `encuadres` son los sitios donde podría estar la carta
 * entera. En dos pasos, para que probar muchos encuadres no sea lento: primero una sola
 * huella por encuadre, para quedarse con los dos que más se parecen a alguna carta, y
 * después, solo en esos, la búsqueda fina (`huellasConMargen`). `descartadas` son
 * cartas que el usuario ya ha dicho que no son.
 */
export function reconocerEn(
  px: Pixeles,
  encuadres: Encuadre[],
  huellas: ReadonlyMap<string, Huella>,
  descartadas: ReadonlySet<string> = new Set(),
  mejoresEncuadres = 6,
): Reconocimiento {
  const catalogo = descartadas.size
    ? new Map([...huellas].filter(([id]) => !descartadas.has(id)))
    : huellas;
  const ilustracion = (z: Encuadre) => {
    const ilus = regionIlustracion(z.w, z.h);
    return { ...ilus, x: z.x + ilus.x, y: z.y + ilus.y };
  };
  const mejores =
    encuadres.length <= mejoresEncuadres
      ? encuadres
      : encuadres
          .map((z) => ({
            z,
            d: masParecidas([calcularHuella(px, ilustracion(z))], catalogo, 1)[0]?.distancia ?? 1,
          }))
          .sort((a, b) => a.d - b.d)
          .slice(0, mejoresEncuadres)
          .map((m) => m.z);
  const variantes = mejores.flatMap((z) => huellasConMargen(px, ilustracion(z)));
  const candidatas = masParecidas(variantes, catalogo, 8);
  if (!candidatas.length) return { candidatas, segura: false, margen: 0, encuadre: null };
  // Las gemelas de la primera no cuentan para el margen: son la misma imagen.
  const primera = huellas.get(candidatas[0].cardId)!;
  const ajena = candidatas.find((c) => distancia(huellas.get(c.cardId)!, primera) >= GEMELAS);
  const margen = ajena ? ajena.distancia - candidatas[0].distancia : 1;
  const segura = candidatas[0].distancia <= DISTANCIA_SEGURA && margen >= MARGEN_SEGURO;
  return { candidatas: candidatas.slice(0, 5), segura, margen, encuadre: mejores[0] ?? null };
}

/**
 * Busca dónde está la carta: rectángulos con proporción de carta cuyo borde coincide
 * con bordes marcados de la imagen (la carta contra la mesa). Devuelve los `n` mejores,
 * sin solapes casi totales, en píxeles de `px`. Busca tamaños de `escalaMin` a
 * `escalaMax` veces el ancho de `guia`.
 *
 * Es barato aunque pruebe miles de rectángulos: trabaja sobre una copia pequeña en
 * grises y suma el gradiente de cada lado con sumas acumuladas (coste fijo por lado).
 */
export function localizarCarta(
  px: Pixeles,
  guia: Encuadre,
  n = 6,
  escalaMin = 0.4,
  escalaMax = 1.25,
): Encuadre[] {
  // Copia pequeña en grises: unos 160 px de ancho de guía bastan para ver el borde.
  const k = Math.min(1, 160 / guia.w);
  const W = Math.max(8, Math.floor(px.width * k));
  const H = Math.max(8, Math.floor(px.height * k));
  const gris = new Float32Array(W * H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i =
        (Math.min(px.height - 1, Math.floor(y / k)) * px.width +
          Math.min(px.width - 1, Math.floor(x / k))) *
        4;
      gris[y * W + x] = 0.299 * px.data[i] + 0.587 * px.data[i + 1] + 0.114 * px.data[i + 2];
    }
  // Gradiente horizontal (bordes verticales) y vertical (bordes horizontales), con un
  // poco de tolerancia: el máximo en ±1 px, porque la carta nunca está perfectamente recta.
  const gx = new Float32Array(W * H);
  const gy = new Float32Array(W * H);
  for (let y = 1; y < H - 1; y++)
    for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      gx[i] = Math.abs(gris[i + 1] - gris[i - 1]);
      gy[i] = Math.abs(gris[i + W] - gris[i - W]);
    }
  const ensanchar = (g: Float32Array, paso: number) => {
    const s = new Float32Array(g.length);
    for (let i = paso; i < g.length - paso; i++) s[i] = Math.max(g[i - paso], g[i], g[i + paso]);
    return s;
  };
  const bx = ensanchar(gx, 1); // un borde vertical puede estar 1 px a un lado o al otro
  const by = ensanchar(gy, W); // y uno horizontal, 1 px arriba o abajo
  // Sumas acumuladas: por filas para los bordes horizontales, por columnas para los verticales.
  const filas = new Float32Array((W + 1) * H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) filas[y * (W + 1) + x + 1] = filas[y * (W + 1) + x] + by[y * W + x];
  const columnas = new Float32Array((H + 1) * W);
  for (let x = 0; x < W; x++)
    for (let y = 0; y < H; y++)
      columnas[x * (H + 1) + y + 1] = columnas[x * (H + 1) + y] + bx[y * W + x];
  const fila = (y: number, x0: number, x1: number) =>
    filas[y * (W + 1) + x1] - filas[y * (W + 1) + x0];
  const columna = (x: number, y0: number, y1: number) =>
    columnas[x * (H + 1) + y1] - columnas[x * (H + 1) + y0];

  const candidatos: (Encuadre & { puntos: number })[] = [];
  const gw = guia.w * k;
  for (let e = escalaMin; e <= escalaMax + 1e-9; e *= 1.04) {
    const w = Math.round(gw * e);
    const h = Math.round(w / PROPORCION_CARTA);
    if (w < 12 || w >= W - 2 || h >= H - 2) continue;
    const paso = Math.max(1, Math.round(w / 40));
    for (let y0 = 1; y0 + h < H - 1; y0 += paso)
      for (let x0 = 1; x0 + w < W - 1; x0 += paso) {
        const arriba = fila(y0, x0, x0 + w);
        const abajo = fila(y0 + h, x0, x0 + w);
        const izq = columna(x0, y0, y0 + h);
        const der = columna(x0 + w, y0, y0 + h);
        // Media de los cuatro lados, pero penalizando que uno falte: con el mínimo, un
        // rectángulo que solo coincide con un borde fuerte de la ilustración puntúa poco.
        const lados = [arriba / w, abajo / w, izq / h, der / h];
        const puntos = (lados.reduce((a, b) => a + b, 0) / 4) * 0.5 + Math.min(...lados) * 0.5;
        candidatos.push({ x: x0, y: y0, w, h, puntos });
      }
  }
  candidatos.sort((a, b) => b.puntos - a.puntos);
  const elegidos: Encuadre[] = [];
  const solape = (a: Encuadre, b: Encuadre) => {
    const ix = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
    const iy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
    return (ix * iy) / (a.w * a.h + b.w * b.h - ix * iy);
  };
  for (const c of candidatos) {
    if (elegidos.length >= n) break;
    if (elegidos.some((o) => solape(o, c) > 0.6)) continue;
    elegidos.push(c);
  }
  return elegidos.map((c) => ({ x: c.x / k, y: c.y / k, w: c.w / k, h: c.h / k }));
}

/** Reglas de la votación (ver `Votacion`). Ajustadas con `npm run medir:escaner`. */
export interface ReglasVoto {
  /** Lecturas que se recuerdan. */
  ventana: number;
  /** Lecturas con la misma carta primera para darla por buena sin ser "segura". */
  votos: number;
  /** Distancia máxima de una lectura para que cuente como voto. */
  distancia: number;
  /** Margen mínimo con la siguiente carta de otra ilustración para que cuente. */
  margen: number;
}

/**
 * Con 3 de 5, distancia ≤ 0,17 y margen ≥ 0,01, en la simulación se para con la carta
 * buena el 93 % de las veces y ninguna con una carta que no está en el catálogo.
 */
export const REGLAS_VOTO: ReglasVoto = { ventana: 5, votos: 3, distancia: 0.17, margen: 0.01 };

/**
 * Decide cuándo parar la cámara. Una lectura sola puede fallar con la carta moviéndose
 * o con un reflejo; varias que coinciden casi nunca. Se para si:
 *  - la misma carta sale "segura" dos lecturas seguidas, o
 *  - la misma carta sale primera en `votos` de las últimas `ventana` lecturas, cada vez
 *    con distancia y margen razonables. Así se reconocen fotos peores (luz mala, carta
 *    pequeña, algo de perspectiva) sin aceptar una lectura suelta dudosa.
 */
export class Votacion {
  private lecturas: { cardId: string | null; segura: boolean }[] = [];

  constructor(private readonly reglas: ReglasVoto = REGLAS_VOTO) {}

  /** Añade una lectura y devuelve la carta ganadora, si ya hay una. */
  anadir(r: Reconocimiento): string | null {
    const primera = r.candidatas[0];
    const vale =
      !!primera && primera.distancia <= this.reglas.distancia && r.margen >= this.reglas.margen;
    this.lecturas.push({ cardId: vale ? primera.cardId : null, segura: r.segura });
    if (this.lecturas.length > this.reglas.ventana) this.lecturas.shift();
    const n = this.lecturas.length;
    const [a, b] = [this.lecturas[n - 2], this.lecturas[n - 1]];
    if (a && b.segura && a.segura && a.cardId === b.cardId && b.cardId) return b.cardId;
    if (!b.cardId) return null;
    const votos = this.lecturas.filter((l) => l.cardId === b.cardId).length;
    return votos >= this.reglas.votos ? b.cardId : null;
  }

  /** La carta que va ganando (para el "¿Es X?" mientras se busca). */
  provisional(): string | null {
    const ultima = this.lecturas[this.lecturas.length - 1];
    return ultima?.cardId ?? null;
  }

  reiniciar(): void {
    this.lecturas = [];
  }
}
