import type { Config } from '@netlify/functions';
import { TROZOS, leerTrozo, valorPorDia } from '../lib/historial.mts';

/** Lo que manda la app: cada producto con las copias normales y foil que tienes. */
interface Peticion {
  items: { id: number; n: number; f: number }[];
}

const MAX_ITEMS = 3000;

/**
 * `POST /api/historial-coleccion` → `{ puntos: [[fecha, valor, null], …] }`: cuánto
 * habría valido cada día la colección que tienes AHORA, con los precios guardados de cada
 * día (ver guardar-precios). No hace falta guardar nada más: sale del historial de precios.
 * Si un producto no tiene precio un día, cuenta el último que tuvo (así una carta sin
 * datos un día no hunde la gráfica).
 */
export default async (req: Request) => {
  if (req.method !== 'POST') return new Response('Usa POST', { status: 405 });
  let cuerpo: Peticion;
  try {
    cuerpo = (await req.json()) as Peticion;
  } catch {
    return Response.json({ error: 'JSON no válido' }, { status: 400 });
  }
  const items = (Array.isArray(cuerpo?.items) ? cuerpo.items : [])
    .filter((x) => Number.isInteger(x?.id) && x.id > 0)
    .slice(0, MAX_ITEMS)
    .map((x) => ({
      id: x.id,
      n: Math.max(0, Math.trunc(Number(x.n)) || 0),
      f: Math.max(0, Math.trunc(Number(x.f)) || 0),
    }))
    .filter((x) => x.n || x.f);
  if (!items.length) return Response.json({ puntos: [] });

  const trozos = [...new Set(items.map((x) => x.id % TROZOS))];
  const leidos = new Map(
    await Promise.all(trozos.map(async (t) => [t, await leerTrozo(t)] as const)),
  );
  const series = items.map((x) => ({
    ...x,
    puntos: leidos.get(x.id % TROZOS)!.productos[x.id] ?? [],
  }));
  const puntos = valorPorDia(series);
  return Response.json({ puntos }, { headers: { 'Cache-Control': 'private, max-age=600' } });
};

export const config: Config = { path: '/api/historial-coleccion' };
