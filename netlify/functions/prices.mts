import type { Config } from '@netlify/functions';

// Price guide público de Cardmarket para Riftbound (juego 22). Se regenera una vez al día.
const PRICE_GUIDE_URL = 'https://downloads.s3.cardmarket.com/productCatalog/priceGuide/price_guide_22.json';

interface RawPrice {
  idProduct: number;
  trend: number | null;
  low: number | null;
  avg7: number | null;
  'trend-foil': number | null;
  'low-foil': number | null;
}

// Cardmarket usa 0 para "sin datos": se convierte a null para no valorar cartas a 0 €.
const clean = (v: number | null | undefined): number | null => (v ? v : null);

export default async () => {
  const res = await fetch(PRICE_GUIDE_URL);
  if (!res.ok) {
    return Response.json({ error: `Cardmarket respondió ${res.status}` }, { status: 502 });
  }
  const data = (await res.json()) as { createdAt: string; priceGuides: RawPrice[] };

  const prices = Object.fromEntries(
    data.priceGuides.map((p) => [
      p.idProduct,
      {
        trend: clean(p.trend),
        low: clean(p.low),
        avg7: clean(p.avg7),
        trendFoil: clean(p['trend-foil']),
        lowFoil: clean(p['low-foil']),
      },
    ]),
  );

  return Response.json(
    { updatedAt: data.createdAt, prices },
    {
      headers: {
        // El navegador cachea 1 h; la CDN de Netlify 6 h y sirve la copia vieja mientras refresca.
        // Así Cardmarket recibe como mucho unas pocas peticiones al día.
        'Cache-Control': 'public, max-age=3600',
        'Netlify-CDN-Cache-Control': 'public, durable, max-age=21600, stale-while-revalidate=86400',
      },
    },
  );
};

export const config: Config = { path: '/api/prices' };
