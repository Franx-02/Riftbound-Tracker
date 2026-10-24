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
