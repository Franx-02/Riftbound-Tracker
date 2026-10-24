import type { Config } from '@netlify/functions';
import { TROZOS, almacen, anotar, clave, leerTrozo, type Punto } from '../lib/historial.mts';

// Price guide público de Cardmarket para Riftbound (juego 22). Se regenera una vez al día.
const PRICE_GUIDE_URL =
  'https://downloads.s3.cardmarket.com/productCatalog/priceGuide/price_guide_22.json';

interface RawPrice {
  idProduct: number;
  trend: number | null;
  'trend-foil': number | null;
}

// Cardmarket usa 0 para "sin datos": se guarda como null para no pintar caídas a 0 €.
const limpio = (v: number | null | undefined): number | null => (v ? v : null);

/**
 * Función programada: una vez al día guarda la tendencia de cada producto en el
 * historial (ver netlify/lib/historial.mts). Si se ejecuta dos veces el mismo día,
 * la segunda sustituye a la primera. Solo corre en el despliegue publicado; en local
 * se lanza con `npx netlify functions:invoke guardar-precios` con `netlify dev` en marcha.
 */
export default async () => {
  const res = await fetch(PRICE_GUIDE_URL);
  if (!res.ok) throw new Error(`Cardmarket respondió ${res.status}`);
  const data = (await res.json()) as { createdAt: string; priceGuides: RawPrice[] };
  // createdAt viene con la zona de Cardmarket ("2026-10-24T11:13:41+0200"): el día es el suyo.
  const dia = data.createdAt.slice(0, 10);

  const porTrozo = new Map<number, RawPrice[]>();
  for (const p of data.priceGuides) {
    const t = p.idProduct % TROZOS;
    porTrozo.set(t, [...(porTrozo.get(t) ?? []), p]);
  }

  for (const [t, precios] of porTrozo) {
    const trozo = await leerTrozo(t);
    for (const p of precios) {
      const punto: Punto = [dia, limpio(p.trend), limpio(p['trend-foil'])];
      if (punto[1] === null && punto[2] === null) continue;
      anotar(trozo, p.idProduct, punto);
    }
    await almacen().setJSON(clave(t), trozo);
  }
  console.log(`Historial: ${data.priceGuides.length} productos guardados para ${dia}`);
};

// Cardmarket publica el price guide de madrugada (hora de Madrid); a las 9:00 UTC ya está.
export const config: Config = { schedule: '0 9 * * *' };
