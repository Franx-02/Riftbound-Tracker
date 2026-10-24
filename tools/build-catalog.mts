/**
 * Genera public/data/catalog.json y public/data/mapping.json.
 *
 *   npm run build:catalog            -> descarga y escribe los dos ficheros
 *   npm run build:catalog -- --check -> ademas valida el mapeo con tools/collection1.csv
 *
 * Fuentes (ver docs/HANDOFF.md, seccion 5):
 *  - Catalogo: RiftHunt (api.rifthunt.com), espejo de Riftcodex que si trae los sets recientes.
 *  - Precios y productos: JSON publicos de Cardmarket, juego 22.
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const SALIDA = join(RAIZ, 'public', 'data');

const URL_CARTAS = 'https://api.rifthunt.com/bulk/cards';
const URL_PRODUCTOS =
  'https://downloads.s3.cardmarket.com/productCatalog/productList/products_singles_22.json';
const URL_PRECIOS =
  'https://downloads.s3.cardmarket.com/productCatalog/priceGuide/price_guide_22.json';

// ---------------------------------------------------------------- tipos

interface CartaFuente {
  riftboundId: string;
  name: string;
  num: number;
  energy: number | null;
  might: number | null;
  power: number | null;
  type: string;
  supertype: string | null;
  rarity: string;
  domains: string[];
  text: string;
  flavour: string | null;
  set: string;
  setName: string;
  tags: string[];
  artist: string | null;
  imgUrl: string;
  orientation: string;
  alt: boolean;
  sig: boolean;
  over: boolean;
}

interface SetFuente {
  id: string;
  name: string;
  count: number;
  released: string;
}

interface Producto {
  idProduct: number;
  name: string;
  idExpansion: number;
  idMetacard: number;
}

interface GuiaPrecio {
  idProduct: number;
  trend?: number;
  'trend-foil'?: number;
}

export type Confianza = 'alta' | 'media' | 'baja' | 'sin-mapear';

export interface Carta {
  cardId: string;
  riftboundId: string;
  name: string;
  num: number;
  set: string;
  setName: string;
  type: string;
  supertype: string | null;
  rarity: string;
  domains: string[];
  energy: number | null;
  might: number | null;
  power: number | null;
  text: string;
  flavour: string | null;
  tags: string[];
  artist: string | null;
  imgUrl: string;
  orientation: string;
  alt: boolean;
  signature: boolean;
  overnumbered: boolean;
}

export interface Mapeo {
  idProduct: number | null;
  confianza: Confianza;
  motivo: string;
  /** Todos los productos de Cardmarket con ese nombre, para el boton de corregir. */
  candidatos: number[];
}

// ------------------------------------------------------- utilidades

async function bajarJson<T>(url: string): Promise<T> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(url + ' respondio ' + r.status);
  return (await r.json()) as T;
}

/** Normaliza un nombre para comparar entre fuentes: DotGG usa " - " donde Cardmarket usa ", ". */
function normalizar(nombre: string): string {
  let s = nombre.toLowerCase().split(' - ').join(', ');
  s = s.replace(/\(.*?\)/g, '');
  s = s.split(', starter').join('').split(' starter').join('');
  return s
    .replace(/[^a-z0-9,/]+/g, ' ')
    .trim()
    .replace(/^,|,$/g, '')
    .trim();
}

/** rad-114-167 -> RAD-114; ogn-089a-298 -> OGN-089A; ven-r03 -> VEN-R03. */
export function aCardId(riftboundId: string): string {
  const partes = riftboundId.split('-');
  const ultima = partes[partes.length - 1];
  const sinTotal =
    partes.length >= 3 && /^\d+$/.test(ultima) ? partes.slice(0, -1).join('-') : riftboundId;
  return sinTotal.toUpperCase();
}

/** Sufijo de variante: OGN-089A -> A, OGS-004-P -> -P, SFD-R01 -> cadena vacia. */
function sufijo(cardId: string): string {
  const m = /^[A-Z]+-[A-Z]*\d+(.*)$/.exec(cardId);
  return m ? m[1] : '';
}

// ------------------------------------------------------- precios

function hacerPrecios(guias: GuiaPrecio[]) {
  const porProducto = new Map<number, GuiaPrecio>();
  for (const g of guias) porProducto.set(g.idProduct, g);
  /** Cardmarket usa 0 para "sin datos", nunca 0 euros. */
  const trend = (id: number, foil: boolean): number | null => {
    const g = porProducto.get(id);
    const v = foil ? g?.['trend-foil'] : g?.trend;
    return v ? v : null;
  };
  /** Precio de referencia para ordenar variantes: la base es la mas barata. */
  const referencia = (id: number): number => {
    const n = trend(id, false);
    const f = trend(id, true);
    return n || f ? (n ?? 0) + (f ?? 0) : Number.POSITIVE_INFINITY;
  };
  return { trend, referencia };
}

// --------------------------------------- set del catalogo -> expansiones de Cardmarket

/**
 * Resuelve a que expansiones de Cardmarket pertenece cada set, cruzando nombres.
 * Asi un set nuevo entra solo, sin tabla codificada a mano (docs/HANDOFF.md, seccion 7).
 */
function resolverExpansiones(
  cartas: CartaFuente[],
  productos: Producto[],
  productosPorNombre: Map<string, Producto[]>,
): Map<string, Set<number>> {
  const tamExpansion = new Map<number, number>();
  for (const p of productos)
    tamExpansion.set(p.idExpansion, (tamExpansion.get(p.idExpansion) ?? 0) + 1);

  const cartasPorSet = new Map<string, number>();
  const votos = new Map<string, Map<number, number>>();
  for (const c of cartas) {
    cartasPorSet.set(c.set, (cartasPorSet.get(c.set) ?? 0) + 1);
    const cands = productosPorNombre.get(normalizar(c.name));
    if (!cands) continue;
    let m = votos.get(c.set);
    if (!m) {
      m = new Map<number, number>();
      votos.set(c.set, m);
    }
    for (const e of new Set(cands.map((p) => p.idExpansion))) m.set(e, (m.get(e) ?? 0) + 1);
  }

  const salida = new Map<string, Set<number>>();
  for (const [set, m] of votos) {
    const nCartas = cartasPorSet.get(set)!;
    // Solape tipo Jaccard entre el set y la expansion: cuantos nombres comparten
    // sobre el total de los dos. Un set normal da 0,95 o mas con su expansion;
    // coincidencias sueltas (reimpresiones, promos) se quedan en 0,4 o menos.
    const puntuado = [...m.entries()]
      .map(([e, n]) => [e, n / (nCartas + tamExpansion.get(e)! - n)] as const)
      .sort((a, b) => b[1] - a[1]);
    const propias = puntuado.filter(([, j]) => j >= 0.5);
    salida.set(
      set,
      propias.length > 0
        ? new Set(propias.map(([e]) => e))
        : // Los sets de promos no tienen expansion propia: estan repartidos entre
          // varias, asi que valen todas las que tengan un solape apreciable, y si
          // ninguna llega (sets diminutos como JDG), todas las que aparezcan.
          new Set(
            (puntuado.filter(([, j]) => j >= 0.1).length > 0
              ? puntuado.filter(([, j]) => j >= 0.1)
              : puntuado
            ).map(([e]) => e),
          ),
    );
  }
  return salida;
}

// ------------------------------------------------------- mapeo

function mapear(
  carta: Carta,
  productosPorNombre: Map<string, Producto[]>,
  expansiones: Map<string, Set<number>>,
  precios: ReturnType<typeof hacerPrecios>,
): Mapeo {
  const cands = productosPorNombre.get(normalizar(carta.name)) ?? [];
  const candidatos = cands.map((p) => p.idProduct);
  const sinMapear = (motivo: string): Mapeo => ({
    idProduct: null,
    confianza: 'sin-mapear',
    motivo,
    candidatos,
  });

  if (cands.length === 0) {
    return sinMapear('No existe como single en Cardmarket (token o carta no vendida suelta)');
  }

  const delSet = expansiones.get(carta.set) ?? new Set<number>();
  const principal = cands
    .filter((p) => delSet.has(p.idExpansion))
    .map((p) => p.idProduct)
    .sort((a, b) => precios.referencia(a) - precios.referencia(b));

  const suf = sufijo(carta.cardId).toUpperCase();

  if (suf === '-P' || /promo/i.test(carta.name)) {
    if (principal.length === 1) {
      return {
        idProduct: principal[0],
        confianza: 'media',
        motivo: 'Promo: unico candidato en su expansion',
        candidatos,
      };
    }
    if (principal.length > 1) {
      return {
        idProduct: principal[0],
        confianza: 'baja',
        motivo: 'Promo con ' + principal.length + ' candidatos: la mas barata',
        candidatos,
      };
    }
    return sinMapear('Promo sin candidato en las expansiones del set');
  }

  if (suf === 'A' || suf === 'B' || carta.alt) {
    if (principal.length >= 2) {
      return {
        idProduct: principal[1],
        confianza: 'media',
        motivo: 'Variante: segunda mas barata del set (alt art)',
        candidatos,
      };
    }
    return sinMapear('Variante sin un segundo producto en el set');
  }

  if (suf === '') {
    if (principal.length === 1) {
      return {
        idProduct: principal[0],
        confianza: 'alta',
        motivo: 'Unico producto con ese nombre en el set',
        candidatos,
      };
    }
    if (principal.length > 1) {
      const a = precios.referencia(principal[0]);
      const b = precios.referencia(principal[1]);
      return {
        idProduct: principal[0],
        confianza: b >= 3 * a ? 'alta' : 'baja',
        motivo: principal.length + ' variantes en el set: la mas barata es la base',
        candidatos,
      };
    }
    if (cands.length === 1) {
      return {
        idProduct: cands[0].idProduct,
        confianza: 'media',
        motivo: 'Unico producto, pero en otra expansion',
        candidatos,
      };
    }
    return sinMapear('Sin producto en las expansiones del set');
  }

  return sinMapear('Sufijo desconocido: ' + suf);
}

// ------------------------------------------------------- validacion

function validar(
  cartasPorId: Map<string, Carta>,
  mapeos: Map<string, Mapeo>,
  precios: ReturnType<typeof hacerPrecios>,
): void {
  const ruta = join(RAIZ, 'tools', 'collection1.csv');
  if (!existsSync(ruta)) {
    console.log('\n--check: no esta tools/collection1.csv, me salto la validacion.');
    return;
  }
  const filas = readFileSync(ruta, 'utf8').trim().split(/\r?\n/).slice(1);
  const cuenta: Record<string, number> = {
    alta: 0,
    media: 0,
    baja: 0,
    'sin-mapear': 0,
    desconocida: 0,
  };
  const desconocidas: string[] = [];
  let valor = 0;
  let copiasSinPrecio = 0;

  for (const fila of filas) {
    const campos = fila.split(',').map((c) => c.replace(/^"|"$/g, ''));
    const cardId = campos[0].toUpperCase();
    const normal = Number(campos[1]);
    const foil = Number(campos[2]);
    const carta = cartasPorId.get(cardId);
    if (!carta) {
      cuenta['desconocida']++;
      desconocidas.push(cardId + '  ' + campos[3]);
      continue;
    }
    const m = mapeos.get(cardId)!;
    cuenta[m.confianza]++;
    if (m.idProduct) {
      const pn = precios.trend(m.idProduct, false);
      const pf = precios.trend(m.idProduct, true);
      valor += normal * (pn ?? 0) + foil * (pf ?? 0);
      if ((normal && pn === null) || (foil && pf === null)) copiasSinPrecio++;
    }
  }

  console.log('\n--- validacion con collection1.csv ---');
  console.log('filas: ' + filas.length);
  console.log(
    'alta ' +
      cuenta['alta'] +
      ' | media ' +
      cuenta['media'] +
      ' | baja ' +
      cuenta['baja'] +
      ' | sin mapear ' +
      cuenta['sin-mapear'] +
      ' | fuera del catalogo ' +
      cuenta['desconocida'],
  );
  console.log('valor estimado: ' + valor.toFixed(2) + ' EUR');
  console.log('cartas con copias sin precio en Cardmarket: ' + copiasSinPrecio);
  if (desconocidas.length) console.log('fuera del catalogo:\n  ' + desconocidas.join('\n  '));
}

// ------------------------------------------------------- principal

async function main(): Promise<void> {
  console.log('Descargando catalogo y Cardmarket...');
  const [bulk, singles, guia] = await Promise.all([
    bajarJson<{ fetched: string; sets: SetFuente[]; cards: CartaFuente[] }>(URL_CARTAS),
    bajarJson<{ createdAt: string; products: Producto[] }>(URL_PRODUCTOS),
    bajarJson<{ createdAt: string; priceGuides: GuiaPrecio[] }>(URL_PRECIOS),
  ]);
  console.log(
    'catalogo: ' +
      bulk.cards.length +
      ' impresiones (' +
      bulk.fetched +
      ') | Cardmarket: ' +
      singles.products.length +
      ' productos (' +
      singles.createdAt +
      ')',
  );

  const productosPorNombre = new Map<string, Producto[]>();
  for (const p of singles.products) {
    const k = normalizar(p.name);
    let lista = productosPorNombre.get(k);
    if (!lista) {
      lista = [];
      productosPorNombre.set(k, lista);
    }
    lista.push(p);
  }

  const precios = hacerPrecios(guia.priceGuides);
  const expansiones = resolverExpansiones(bulk.cards, singles.products, productosPorNombre);
  for (const set of [...expansiones.keys()].sort()) {
    console.log('  ' + set + ' -> Cardmarket ' + [...expansiones.get(set)!].join(', '));
  }

  // El bulk repite algunas impresiones de promos: nos quedamos con la primera.
  const cartasPorId = new Map<string, Carta>();
  for (const c of bulk.cards) {
    const cardId = aCardId(c.riftboundId);
    if (cartasPorId.has(cardId)) continue;
    cartasPorId.set(cardId, {
      cardId,
      riftboundId: c.riftboundId,
      name: c.name,
      num: c.num,
      set: c.set,
      setName: c.setName,
      type: c.type,
      supertype: c.supertype,
      rarity: c.rarity,
      domains: c.domains ?? [],
      energy: c.energy,
      might: c.might,
      power: c.power,
      text: c.text ?? '',
      flavour: c.flavour,
      tags: c.tags ?? [],
      artist: c.artist,
      imgUrl: c.imgUrl,
      orientation: c.orientation,
      alt: !!c.alt,
      signature: !!c.sig,
      overnumbered: !!c.over,
    });
  }

  const mapeos = new Map<string, Mapeo>();
  for (const carta of cartasPorId.values()) {
    mapeos.set(carta.cardId, mapear(carta, productosPorNombre, expansiones, precios));
  }

  const resumen: Record<string, number> = {};
  for (const m of mapeos.values()) resumen[m.confianza] = (resumen[m.confianza] ?? 0) + 1;
  console.log('\nmapeo de todo el catalogo: ' + JSON.stringify(resumen));

  mkdirSync(SALIDA, { recursive: true });
  const cartas = [...cartasPorId.values()].sort((a, b) =>
    a.set === b.set ? a.cardId.localeCompare(b.cardId) : a.set.localeCompare(b.set),
  );
  writeFileSync(
    join(SALIDA, 'catalog.json'),
    JSON.stringify({
      generado: new Date().toISOString(),
      fuente: 'api.rifthunt.com/bulk/cards',
      sets: bulk.sets.map((s) => ({
        id: s.id,
        name: s.name,
        count: s.count,
        released: s.released,
      })),
      cards: cartas,
    }),
  );
  writeFileSync(
    join(SALIDA, 'mapping.json'),
    JSON.stringify({
      generado: new Date().toISOString(),
      cardmarketCreatedAt: singles.createdAt,
      mapping: Object.fromEntries([...mapeos].sort((a, b) => a[0].localeCompare(b[0]))),
    }),
  );
  console.log('escritos public/data/catalog.json (' + cartas.length + ') y mapping.json');

  if (process.argv.includes('--check')) validar(cartasPorId, mapeos, precios);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
