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
  /** El mismo texto en HTML: conserva saltos de línea y listas que `text` pierde. */
  rich: string | null;
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
const ENTIDADES: Record<string, string> = {
  '&gt;': '>',
  '&lt;': '<',
  '&amp;': '&',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
  '&nbsp;': ' ',
};

/** El origen trae entidades HTML sin decodificar (`[&gt;]`, `&quot;`) también en `text`. */
function decodificar(texto: string): string {
  return texto.replace(/&(gt|lt|amp|quot|#39|apos|nbsp);/g, (e) => ENTIDADES[e] ?? e);
}

/**
 * Texto de reglas legible a partir de `rich`. El campo `text` del origen se come los
 * saltos de línea (815 cartas los tienen en `rich` y solo 158 en `text`), y sin ellos
 * quedan cosas como "...an additional time.When I hold...". Las listas de opciones
 * ("choose one —") salen con viñetas.
 */
export function textoDeReglas(
  rich: string | null | undefined,
  text: string | null | undefined,
): string {
  if (!rich) return decodificar(text ?? '').trim();
  return decodificar(
    rich
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>\s*<p[^>]*>/gi, '\n')
      .replace(/<li[^>]*>/gi, '\n• ')
      .replace(/<[^>]+>/g, ''),
  )
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

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

/**
 * Que version de la carta es, de la mas barata a la mas cara: normal, alt art,
 * Showcase y Signature. Ordenar por numero de coleccion **no vale**: las cartas
 * especiales llevan su propia numeracion y empiezan otra vez por 1 (en Radiance,
 * `RAD-SP2` es la Showcase de Akali y `RAD-015` la Rare normal, mucho mas barata).
 * La Signature es la mas cara con diferencia: la Kai'Sa de Origins vale 0,32 EUR
 * de unidad, 95 EUR de leyenda y 1.100 EUR firmada.
 */
function ordenVariante(carta: Carta): number {
  const suf = sufijo(carta.cardId).toUpperCase();
  if (suf === '*' || carta.signature) return 3;
  if (carta.rarity === 'Showcase') return 2;
  if (/^[A-Z]$/.test(suf) || carta.alt) return 1;
  return 0;
}

/**
 * Mapea todas las cartas que comparten nombre dentro de un set de una vez.
 *
 * No se puede decidir carta a carta: en un set puede haber **varias cartas distintas
 * con el mismo nombre** (en Origins, Kai'Sa es la unidad 247, la leyenda 299 y la
 * leyenda firmada 299*), y Cardmarket tiene un producto por cada una, todos con el
 * mismo nombre exacto. La unica senal es el precio, asi que se ordenan las cartas del
 * grupo por numero y variante, se ordenan los productos por precio, y se emparejan en
 * ese orden. Si las dos listas miden lo mismo, el emparejamiento es de fiar.
 */
function mapearGrupo(
  grupo: Carta[],
  cands: Producto[],
  expansiones: Map<string, Set<number>>,
  precios: ReturnType<typeof hacerPrecios>,
): Map<string, Mapeo> {
  const salida = new Map<string, Mapeo>();
  const candidatos = cands.map((p) => p.idProduct);
  const asignar = (
    cardId: string,
    idProduct: number | null,
    confianza: Confianza,
    motivo: string,
  ) => salida.set(cardId, { idProduct, confianza, motivo, candidatos });

  if (cands.length === 0) {
    for (const c of grupo) {
      asignar(
        c.cardId,
        null,
        'sin-mapear',
        'No existe como single en Cardmarket (token o carta no vendida suelta)',
      );
    }
    return salida;
  }

  const delSet = expansiones.get(grupo[0].set) ?? new Set<number>();
  const productos = cands
    .filter((p) => delSet.has(p.idExpansion))
    .map((p) => p.idProduct)
    .sort((a, b) => precios.referencia(a) - precios.referencia(b));

  // Las promos de un set normal (la `SFD-R03B` de Nexus Night, por ejemplo) no se
  // venden en la expansion del set, sino en las de promos, y no forman parte de la
  // serie de variantes. En los sets que son de promos enteros (OPP, PR, JDG) no hay
  // nada que separar: ahi la promo es la carta normal y se empareja como las demas.
  const esPromo = (c: Carta) =>
    sufijo(c.cardId).toUpperCase() === '-P' || /promo/i.test(c.name) || c.rarity === 'Promo';
  let promos = grupo.filter(esPromo);
  let resto = grupo.filter((c) => !esPromo(c));
  if (resto.length === 0) {
    resto = promos;
    promos = [];
  }

  const fuera = cands
    .filter((p) => !delSet.has(p.idExpansion))
    .map((p) => p.idProduct)
    .sort((a, b) => precios.referencia(a) - precios.referencia(b));
  for (const c of promos) {
    if (fuera.length === 1) {
      asignar(c.cardId, fuera[0], 'media', 'Promo: unico candidato fuera de la expansion del set');
    } else if (fuera.length > 1) {
      asignar(
        c.cardId,
        fuera[0],
        'baja',
        'Promo con ' + fuera.length + ' candidatos: la mas barata',
      );
    } else {
      asignar(c.cardId, null, 'sin-mapear', 'Promo sin candidato en las expansiones de promos');
    }
  }

  const cartas = resto.sort(
    (a, b) =>
      ordenVariante(a) - ordenVariante(b) || a.num - b.num || a.cardId.localeCompare(b.cardId),
  );
  if (cartas.length === 0) return salida;

  if (productos.length === 0) {
    if (cartas.length === 1 && cands.length === 1) {
      asignar(
        cartas[0].cardId,
        cands[0].idProduct,
        'media',
        'Unico producto, pero en otra expansion',
      );
    } else {
      for (const c of cartas) {
        asignar(c.cardId, null, 'sin-mapear', 'Sin producto en las expansiones del set');
      }
    }
    return salida;
  }

  if (cartas.length === productos.length) {
    // Separadas = cada escalon de precio multiplica por 3 o mas al anterior. Con esa
    // distancia, un error de emparejamiento no pasaria desapercibido.
    const separadas = productos.every((id, i) => {
      if (i === 0) return true;
      const previo = precios.referencia(productos[i - 1]);
      const actual = precios.referencia(id);
      return Number.isFinite(previo) && Number.isFinite(actual) && actual >= 3 * previo;
    });
    const unica = cartas.length === 1;
    const confianza: Confianza = unica || separadas ? 'alta' : 'media';
    const motivo = unica
      ? 'Unico producto con ese nombre en el set'
      : cartas.length +
        ' cartas con ese nombre y ' +
        productos.length +
        ' productos: emparejadas por precio' +
        (separadas ? ' (precios bien separados)' : ' (precios parecidos)');
    cartas.forEach((c, i) => asignar(c.cardId, productos[i], confianza, motivo));
    return salida;
  }

  // Las listas no cuadran: empareja lo que se puede y deja el resto sin mapear.
  const motivo =
    cartas.length + ' cartas con ese nombre pero ' + productos.length + ' productos en el set';
  cartas.forEach((c, i) =>
    i < productos.length
      ? asignar(c.cardId, productos[i], 'baja', motivo)
      : asignar(c.cardId, null, 'sin-mapear', motivo),
  );
  return salida;
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
      text: textoDeReglas(c.rich, c.text),
      flavour: c.flavour ? decodificar(c.flavour).trim() : null,
      tags: c.tags ?? [],
      artist: c.artist,
      imgUrl: c.imgUrl,
      orientation: c.orientation,
      alt: !!c.alt,
      signature: !!c.sig,
      overnumbered: !!c.over,
    });
  }

  // Agrupa por set y nombre normalizado: ese grupo se mapea en bloque (ver mapearGrupo).
  const grupos = new Map<string, Carta[]>();
  for (const carta of cartasPorId.values()) {
    const clave = carta.set + '|' + normalizar(carta.name);
    let g = grupos.get(clave);
    if (!g) {
      g = [];
      grupos.set(clave, g);
    }
    g.push(carta);
  }

  const mapeos = new Map<string, Mapeo>();
  for (const grupo of grupos.values()) {
    const cands = productosPorNombre.get(normalizar(grupo[0].name)) ?? [];
    for (const [cardId, m] of mapearGrupo(grupo, cands, expansiones, precios)) {
      mapeos.set(cardId, m);
    }
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
  // Para el boton de corregir de la ficha: de cada candidato, su expansion, y de cada
  // expansion, que sets del catalogo viven en ella. Sin esto el usuario solo veria
  // numeros de producto, y "Mind Rune" tiene 17 candidatos repartidos por 10 sets.
  const expansionDe = new Map(singles.products.map((p) => [p.idProduct, p.idExpansion]));
  const productos: Record<number, number> = {};
  for (const m of mapeos.values()) {
    for (const id of m.candidatos) productos[id] = expansionDe.get(id)!;
  }
  // El set "propio" de una expansion es el que vive solo en ella. Los de promos estan
  // repartidos entre varias y no son propios de ninguna: esas quedan a null.
  const setsDeExpansion: Record<number, string | null> = {};
  for (const id of Object.values(productos)) setsDeExpansion[id] ??= null;
  for (const [set, exps] of expansiones) {
    if (exps.size === 1) setsDeExpansion[[...exps][0]] = set;
  }
  writeFileSync(
    join(SALIDA, 'mapping.json'),
    JSON.stringify({
      generado: new Date().toISOString(),
      cardmarketCreatedAt: singles.createdAt,
      mapping: Object.fromEntries([...mapeos].sort((a, b) => a[0].localeCompare(b[0]))),
      productos,
      expansiones: setsDeExpansion,
    }),
  );
  console.log('escritos public/data/catalog.json (' + cartas.length + ') y mapping.json');

  if (process.argv.includes('--check')) validar(cartasPorId, mapeos, precios);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
