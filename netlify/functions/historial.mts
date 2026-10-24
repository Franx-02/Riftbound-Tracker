import type { Config } from '@netlify/functions';
import { TROZOS, leerTrozo } from '../lib/historial.mts';

/** `/api/historial?id=845712` → `{ puntos: [[fecha, normal, foil], …] }` de ese producto. */
export default async (req: Request) => {
  const id = Number(new URL(req.url).searchParams.get('id'));
  if (!Number.isInteger(id) || id <= 0) {
    return Response.json({ error: 'Falta un id de producto válido' }, { status: 400 });
  }
  const trozo = await leerTrozo(id % TROZOS);
  return Response.json(
    { puntos: trozo.productos[id] ?? [] },
    {
      headers: {
        // Cambia una vez al día: con una hora de caché sobra.
        'Cache-Control': 'public, max-age=3600',
        'Netlify-CDN-Cache-Control': 'public, durable, max-age=3600, stale-while-revalidate=86400',
      },
    },
  );
};

export const config: Config = { path: '/api/historial' };
