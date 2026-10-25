/**
 * Compara el catálogo y el mapeo recién generados con los de git (HEAD), sin contar las
 * fechas de generación, y dice qué ha cambiado de verdad. Lo usa la actualización
 * automática (.github/workflows/actualizar-catalogo.yml) para no hacer commits vacíos y
 * para regenerar huellas y vectores solo si hay cartas nuevas o cambiadas.
 *
 *   npx tsx tools/cambios-catalogo.mts   ->  escribe "cartas=true|false" y "mapeo=true|false"
 *                                            (formato de $GITHUB_OUTPUT) y un resumen
 */
import { execSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';

interface Carta {
  cardId: string;
  imgUrl: string;
  [k: string]: unknown;
}

const actual = (ruta: string) => JSON.parse(readFileSync(ruta, 'utf8'));
const enGit = (ruta: string) => {
  try {
    return JSON.parse(execSync(`git show HEAD:${ruta}`, { encoding: 'utf8', maxBuffer: 1 << 28 }));
  } catch {
    return null;
  }
};
const sinFechas = (o: Record<string, unknown> | null) => {
  if (!o) return '';
  const { generado: _g, cardmarketCreatedAt: _c, ...resto } = o;
  return JSON.stringify(resto);
};

const catNuevo = actual('public/data/catalog.json');
const catViejo = enGit('public/data/catalog.json');
const porId = (c: { cards: Carta[] } | null) => new Map((c?.cards ?? []).map((x) => [x.cardId, x]));
const nuevas = porId(catNuevo);
const viejas = porId(catViejo);
const anadidas = [...nuevas.keys()].filter((id) => !viejas.has(id));
const quitadas = [...viejas.keys()].filter((id) => !nuevas.has(id));
// Una carta con otra imagen también necesita huella y vector nuevos.
const otraImagen = [...nuevas.values()].filter(
  (c) => viejas.has(c.cardId) && viejas.get(c.cardId)!.imgUrl !== c.imgUrl,
);
const cartas = sinFechas(catNuevo) !== sinFechas(catViejo);
const imagenes = anadidas.length + quitadas.length + otraImagen.length > 0;
const mapeo = sinFechas(actual('public/data/mapping.json')) !== sinFechas(enGit('public/data/mapping.json'));

const resumen = [
  `Cartas nuevas: ${anadidas.length}${anadidas.length ? ` (${anadidas.slice(0, 20).join(', ')}${anadidas.length > 20 ? '…' : ''})` : ''}`,
  `Cartas quitadas: ${quitadas.length}`,
  `Cartas con otra imagen: ${otraImagen.length}`,
  `Otros cambios en el catálogo: ${cartas ? 'sí' : 'no'}`,
  `Cambios en el mapeo de precios: ${mapeo ? 'sí' : 'no'}`,
].join('\n');
console.log(resumen);

const salida = process.env.GITHUB_OUTPUT;
if (salida) {
  appendFileSync(salida, `catalogo=${cartas}\nimagenes=${imagenes}\nmapeo=${mapeo}\n`);
  appendFileSync(salida, `nuevas=${anadidas.length}\n`);
}
