import { getStore } from '@netlify/blobs';

/**
 * Historial de precios de Cardmarket, guardado en Netlify Blobs (gratis, sin Firestore).
 *
 * Cardmarket solo publica el precio del día, así que el historial se va construyendo:
 * la función programada guardar-precios añade un punto al día. Para leer poco, los
 * productos se reparten en TROZOS blobs según `idProduct % TROZOS`: guardar el día son
 * 64 lecturas y 64 escrituras, y la gráfica de una carta lee un solo blob.
 */
export const TROZOS = 64;

/** Un día: [fecha AAAA-MM-DD, tendencia normal, tendencia foil]. null = sin datos. */
export type Punto = [string, number | null, number | null];

/** Contenido de un trozo: idProduct → puntos ordenados por fecha. */
export interface Trozo {
  v: 1;
  productos: Record<string, Punto[]>;
}

export const almacen = () => getStore('historial-precios');
export const clave = (trozo: number) => `trozo-${trozo}`;

export async function leerTrozo(trozo: number): Promise<Trozo> {
  const datos = (await almacen().get(clave(trozo), { type: 'json' })) as Trozo | null;
  return datos?.v === 1 ? datos : { v: 1, productos: {} };
}

/** Añade (o sustituye, si ya existe ese día) el punto de un producto. */
export function anotar(trozo: Trozo, idProduct: number, punto: Punto): void {
  const lista = (trozo.productos[idProduct] ??= []);
  const i = lista.findIndex((p) => p[0] === punto[0]);
  if (i >= 0) lista[i] = punto;
  else {
    lista.push(punto);
    lista.sort((a, b) => a[0].localeCompare(b[0]));
  }
}

/**
 * Valor de un conjunto de copias cada día: para cada fecha con algún precio guardado,
 * suma copias × precio. Si un producto no tiene precio un día, cuenta el último que tuvo
 * (y hasta su primer precio no cuenta).
 */
export function valorPorDia(
  series: readonly { id: number; n: number; f: number; puntos: readonly Punto[] }[],
): [string, number, null][] {
  const fechas = [...new Set(series.flatMap((s) => s.puntos.map((p) => p[0])))].sort();
  const ultimo = new Map<number, [number | null, number | null]>();
  const indice = new Map<number, number>();
  const salida: [string, number, null][] = [];
  for (const fecha of fechas) {
    let total = 0;
    for (const s of series) {
      let i = indice.get(s.id) ?? 0;
      while (i < s.puntos.length && s.puntos[i][0] <= fecha) {
        const [, normal, foil] = s.puntos[i];
        const previo = ultimo.get(s.id);
        ultimo.set(s.id, [normal ?? previo?.[0] ?? null, foil ?? previo?.[1] ?? null]);
        i++;
      }
      indice.set(s.id, i);
      const u = ultimo.get(s.id);
      if (u) total += s.n * (u[0] ?? 0) + s.f * (u[1] ?? 0);
    }
    salida.push([fecha, Math.round(total * 100) / 100, null]);
  }
  return salida;
}
