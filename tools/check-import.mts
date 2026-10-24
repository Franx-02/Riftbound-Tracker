/**
 * Criterio de salida de F3: importar tools/collection1.csv y volver a exportarlo
 * tiene que dar el mismo contenido (código, normales y foils de cada fila).
 *
 *   npm run check:import
 *
 * Usa el catálogo real de public/data y el mismo código que la app (src/app/core/csv.ts).
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type CatalogLookup, exportDotgg, importCsv, parseCsv } from '../src/app/core/csv.ts';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');

interface CartaCatalogo {
  cardId: string;
  name: string;
  setName: string;
}
const catalogo = JSON.parse(readFileSync(join(RAIZ, 'public/data/catalog.json'), 'utf8')) as {
  cards: CartaCatalogo[];
};
const porId = new Map(catalogo.cards.map((c) => [c.cardId, c]));
const lookup: CatalogLookup = { card: (id) => porId.get(id.toUpperCase()) };

const original = readFileSync(join(RAIZ, 'tools/collection1.csv'), 'utf8');
const importado = importCsv(original, lookup);

console.log(`formato: ${importado.format}`);
console.log(`cartas a guardar: ${importado.cards.size} · copias: ${importado.copies}`);
console.log(
  `enlazadas: ${importado.aliased.map((a) => `${a.from} → ${a.to}`).join(', ') || 'ninguna'}`,
);
console.log(
  `fuera del catálogo: ${importado.outsideCatalog.map((o) => o.cardId).join(', ') || 'ninguna'}`,
);
console.log(`rechazadas: ${importado.rejected.length}`);
for (const r of importado.rejected) console.log(`  línea ${r.line}: ${r.reason}`);

// Ida y vuelta: cada fila del original tiene que salir igual en el exportado.
const exportado = exportDotgg(importado.cards, lookup);
const filas = (csv: string) =>
  new Map(
    parseCsv(csv)
      .slice(1)
      .map((f) => [f[0].trim().toUpperCase(), `${Number(f[1])}/${Number(f[2])}`] as const),
  );
const antes = filas(original);
const despues = filas(exportado);

const diferencias: string[] = [];
for (const [id, q] of antes)
  if (despues.get(id) !== q) diferencias.push(`${id}: ${q} → ${despues.get(id) ?? 'falta'}`);
for (const id of despues.keys())
  if (!antes.has(id)) diferencias.push(`${id}: sobra en el exportado`);

console.log(`\nida y vuelta: ${antes.size} filas antes, ${despues.size} después`);
if (diferencias.length) {
  console.log(`DIFERENCIAS (${diferencias.length}):\n  ${diferencias.join('\n  ')}`);
  process.exit(1);
}
console.log('OK: mismo contenido (código sin distinguir mayúsculas, normales y foils).');
