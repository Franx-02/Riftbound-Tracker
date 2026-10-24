/**
 * Flujo de traducción al español (F4). El glosario está en docs/glosario.md.
 *
 *   npm run traducir -- pendientes [--set OGN] [--max 50]
 *       Escribe tools/traduccion/pendientes.json con los textos sin traducir.
 *   npm run traducir -- aplicar
 *       Valida los lotes de tools/traduccion/lotes/*.json y los fusiona en
 *       public/data/catalog_es.json. Una traducción que pierde un símbolo, una
 *       keyword o un número no entra: se informa y se corrige el lote.
 *
 * Un lote es un JSON con [{ "clave": "...", "es": "..." }]. Los lotes son la fuente
 * de verdad (se revisan en git); catalog_es.json se regenera a partir de ellos.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { claveTexto, validarTraduccion } from '../src/app/core/traduccion.ts';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = join(RAIZ, 'tools', 'traduccion');
const LOTES = join(DIR, 'lotes');
const SALIDA = join(RAIZ, 'public', 'data', 'catalog_es.json');

/** Decisión 1 del glosario. Si se cambia, hay que revisar los lotes ya hechos. */
const KEYWORDS_EN_INGLES = true;

interface Carta {
  cardId: string;
  set: string;
  text: string;
  flavour: string | null;
}

type Tipo = 'reglas' | 'ambientacion';
interface Texto {
  clave: string;
  tipo: Tipo;
  en: string;
  cartas: string[];
}

function textos(): Map<string, Texto> {
  const { cards } = JSON.parse(readFileSync(join(RAIZ, 'public/data/catalog.json'), 'utf8')) as {
    cards: Carta[];
  };
  const porClave = new Map<string, Texto>();
  const anotar = (en: string | null, tipo: Tipo, carta: Carta) => {
    if (!en?.trim()) return;
    const clave = claveTexto(en);
    const t = porClave.get(clave) ?? { clave, tipo, en, cartas: [] };
    t.cartas.push(carta.cardId);
    porClave.set(clave, t);
  };
  for (const c of cards) {
    anotar(c.text, 'reglas', c);
    anotar(c.flavour, 'ambientacion', c);
  }
  return porClave;
}

function leerLotes(): { clave: string; es: string; lote: string }[] {
  if (!existsSync(LOTES)) return [];
  return readdirSync(LOTES)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .flatMap((f) =>
      (JSON.parse(readFileSync(join(LOTES, f), 'utf8')) as { clave: string; es: string }[]).map(
        (t) => ({ ...t, lote: f }),
      ),
    );
}

function argumento(nombre: string): string | undefined {
  const i = process.argv.indexOf(`--${nombre}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function pendientes(): void {
  const todos = textos();
  const hechas = new Set(leerLotes().map((t) => t.clave));
  const set = argumento('set')?.toUpperCase();
  const max = Number(argumento('max') ?? Infinity);
  const tipo = argumento('tipo') as Tipo | undefined;
  // --coleccion: primero los textos de las cartas de tools/collection1.csv, que son las que
  // más se miran. Dentro de cada grupo se mantiene el orden del catálogo.
  const deLaColeccion = process.argv.includes('--coleccion') ? idsDeLaColeccion() : null;
  const prioridad = (t: Texto) => (deLaColeccion && t.cartas.some((id) => deLaColeccion.has(id)) ? 0 : 1);
  const lista = [...todos.values()]
    .filter((t) => !hechas.has(t.clave))
    .filter((t) => !tipo || t.tipo === tipo)
    .filter((t) => !set || t.cartas.some((id) => id.startsWith(`${set}-`)))
    .filter((t) => !deLaColeccion || process.argv.includes('--y-resto') || prioridad(t) === 0)
    .sort((a, b) => prioridad(a) - prioridad(b))
    .slice(0, max)
    .map((t) => ({ ...t, cartas: t.cartas.slice(0, 3) }));
  mkdirSync(DIR, { recursive: true });
  writeFileSync(join(DIR, 'pendientes.json'), JSON.stringify(lista, null, 2) + '\n');
  const quedan = [...todos.values()].filter((t) => !hechas.has(t.clave)).length;
  console.log(
    `${lista.length} textos en tools/traduccion/pendientes.json (${quedan} sin traducir en total)`,
  );
}

function idsDeLaColeccion(): Set<string> {
  const ruta = join(RAIZ, 'tools', 'collection1.csv');
  if (!existsSync(ruta)) return new Set();
  return new Set(
    readFileSync(ruta, 'utf8')
      .split(/\r?\n/)
      .slice(1)
      .map((l) => l.split(',')[0].replaceAll('"', '').trim().toUpperCase())
      .filter(Boolean),
  );
}

function aplicar(): void {
  const todos = textos();
  const traducciones: Record<string, string> = {};
  const errores: string[] = [];
  let obsoletas = 0;
  for (const { clave, es, lote } of leerLotes()) {
    const original = todos.get(clave);
    // Texto que ya no está en el catálogo (errata o carta retirada): se ignora sin error.
    if (!original) {
      obsoletas++;
      continue;
    }
    const problemas = validarTraduccion(original.en, es, { keywordsEnIngles: KEYWORDS_EN_INGLES });
    if (problemas.length) {
      errores.push(`${lote} · ${original.cartas[0]} (${clave}):\n    ${problemas.join('\n    ')}`);
      continue;
    }
    traducciones[clave] = es;
  }
  writeFileSync(SALIDA, JSON.stringify({ generado: new Date().toISOString(), traducciones }));
  const total = (tipo: Tipo) => [...todos.values()].filter((t) => t.tipo === tipo);
  const hechas = (tipo: Tipo) => total(tipo).filter((t) => traducciones[t.clave]).length;
  console.log(
    `catalog_es.json: reglas ${hechas('reglas')}/${total('reglas').length}, ` +
      `ambientación ${hechas('ambientacion')}/${total('ambientacion').length}` +
      (obsoletas ? ` · ${obsoletas} de textos que ya no existen` : ''),
  );
  if (errores.length) {
    console.log(`\n${errores.length} traducciones rechazadas:\n  ${errores.join('\n  ')}`);
    process.exit(1);
  }
}

const orden = process.argv[2];
if (orden === 'pendientes') pendientes();
else if (orden === 'aplicar') aplicar();
else {
  console.log(
    'Uso: npm run traducir -- pendientes [--set OGN] [--max 50] [--tipo reglas|ambientacion]',
  );
  console.log('     npm run traducir -- aplicar');
  process.exit(1);
}
