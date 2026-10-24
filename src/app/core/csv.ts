/**
 * Importar y exportar colecciones en CSV. Funciones puras: no saben nada de Angular
 * ni de Firestore, y así las prueban igual los tests y tools/check-import.mts.
 *
 * Formatos (docs/HANDOFF.md, sección 5, "Formato DotGG"):
 *  - DotGG (Riftbound.gg, Riftatlas): `CardId,Normal,Foil,Name,Set`. Name y Set opcionales.
 *  - Legacy (Riftatlas): `Normal Count,Foil Count,Card ID`.
 * Collectr no está: sin un fichero real de ejemplo no se pueden adivinar sus columnas.
 */

/** Lo mínimo del catálogo que hace falta para importar y exportar. */
export interface CatalogLookup {
  card(cardId: string): { cardId: string; name: string; setName: string } | undefined;
}

export interface ImportedQty {
  normal: number;
  foil: number;
  /** Id original de DotGG cuando la carta se ha enlazado con otra del catálogo. */
  alias?: string;
}

export type CsvFormat = 'dotgg' | 'legacy';

export interface ImportRow {
  /** Número de línea en el fichero, empezando en 1 (la cabecera es la 1). */
  line: number;
  original: string;
}

export interface ImportResult {
  format: CsvFormat | null;
  /** Lo que se va a guardar, por cardId del catálogo (o el de DotGG si no está en él). */
  cards: Map<string, ImportedQty>;
  /** Ids desconocidos enlazados con una carta del catálogo por número y nombre. */
  aliased: (ImportRow & { from: string; to: string })[];
  /** Ids con buena pinta que no están en el catálogo: se guardan igual (tokens, promos raras). */
  outsideCatalog: (ImportRow & { cardId: string })[];
  /** Filas que no se importan, con el motivo. */
  rejected: (ImportRow & { reason: string })[];
  copies: number;
}

/** Un id razonable: `OGN-089`, `SFD-R03A`, `OGS-004-P`, `OGN-299*`. El mismo límite que firestore.rules. */
const ID_VALIDO = /^[A-Z]{2,4}-[A-Z0-9]{1,6}(-P)?\*?$/;
const MAX_COPIAS = 9999;

// ------------------------------------------------------------------ lectura

/** Lee un CSV con comillas, comillas dobladas, BOM, CRLF y separador `,` o `;` (el de Excel en España). */
export function parseCsv(texto: string): string[][] {
  const limpio = texto.replace(/^﻿/, '');
  const primera = limpio.split(/\r?\n/, 1)[0] ?? '';
  const sep = (primera.match(/;/g)?.length ?? 0) > (primera.match(/,/g)?.length ?? 0) ? ';' : ',';

  const filas: string[][] = [];
  let fila: string[] = [];
  let campo = '';
  let comillas = false;
  for (let i = 0; i < limpio.length; i++) {
    const c = limpio[i];
    if (comillas) {
      if (c === '"' && limpio[i + 1] === '"') {
        campo += '"';
        i++;
      } else if (c === '"') {
        comillas = false;
      } else {
        campo += c;
      }
    } else if (c === '"') {
      comillas = true;
    } else if (c === sep) {
      fila.push(campo);
      campo = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && limpio[i + 1] === '\n') i++;
      fila.push(campo);
      filas.push(fila);
      fila = [];
      campo = '';
    } else {
      campo += c;
    }
  }
  if (campo !== '' || fila.length) {
    fila.push(campo);
    filas.push(fila);
  }
  // Fuera las líneas vacías (también las del final del fichero).
  return filas.filter((f) => f.some((v) => v.trim() !== ''));
}

const cabecera = (v: string) =>
  v
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '');

/** Qué columna es cada cosa, según la cabecera. null si no se reconoce el formato. */
function columnas(head: string[]) {
  const h = head.map(cabecera);
  const col = (...nombres: string[]) => h.findIndex((x) => nombres.includes(x));
  if (h.includes('cardid') && h.includes('normal')) {
    return {
      format: 'dotgg' as const,
      id: col('cardid'),
      normal: col('normal'),
      foil: col('foil'),
      name: col('name'),
    };
  }
  if (h.includes('normalcount') && h.includes('cardid')) {
    return {
      format: 'legacy' as const,
      id: col('cardid'),
      normal: col('normalcount'),
      foil: col('foilcount'),
      name: -1,
    };
  }
  return null;
}

/** Nombre comparable entre DotGG ("Annie - Fiery (Nexus Night Promo)") y el catálogo ("Annie, Fiery"). */
function nombreBase(nombre: string): string {
  return nombre
    .toLowerCase()
    .replace(/\(.*?\)/g, '')
    .replace(/ - /g, ', ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Un id de DotGG que no está en el catálogo puede ser una promo que el catálogo guarda
 * en el set de promos con el mismo número: `OGN-089b` es `OPP-089B` y `OGS-004-P` es
 * `OPP-004`. Solo se acepta si el nombre coincide, para no enlazar dos cartas distintas.
 */
function buscarAlias(id: string, nombre: string, catalogo: CatalogLookup): string | null {
  const m = /^[A-Z]+-(\d{3})([A-Z]?)(-P)?$/.exec(id);
  if (!m || !nombre) return null;
  const esPromo = !!m[3] || /promo/i.test(nombre) || m[2] === 'B';
  if (!esPromo) return null;
  const candidato = `OPP-${m[1]}${m[2]}`;
  const carta = catalogo.card(candidato);
  return carta && nombreBase(carta.name) === nombreBase(nombre) ? carta.cardId : null;
}

function copias(valor: string | undefined): number | null {
  const v = (valor ?? '').trim();
  if (v === '') return 0;
  if (!/^\d+$/.test(v)) return null;
  const n = Number(v);
  return n <= MAX_COPIAS ? n : null;
}

/** Lee un CSV de DotGG o Legacy y dice qué se puede importar y qué no, y por qué. */
export function importCsv(texto: string, catalogo: CatalogLookup): ImportResult {
  const resultado: ImportResult = {
    format: null,
    cards: new Map(),
    aliased: [],
    outsideCatalog: [],
    rejected: [],
    copies: 0,
  };
  const filas = parseCsv(texto);
  if (filas.length === 0) return resultado;
  const cols = columnas(filas[0]);
  if (!cols) {
    resultado.rejected.push({
      line: 1,
      original: filas[0].join(','),
      reason:
        'Cabecera no reconocida: se esperaba CardId,Normal,Foil (DotGG) o Normal Count,Foil Count,Card ID (Legacy)',
    });
    return resultado;
  }
  resultado.format = cols.format;

  filas.slice(1).forEach((fila, i) => {
    const fichero = { line: i + 2, original: fila.join(',') };
    const id = (fila[cols.id] ?? '').trim().toUpperCase();
    const normal = copias(fila[cols.normal]);
    const foil = cols.foil >= 0 ? copias(fila[cols.foil]) : 0;
    const nombre = cols.name >= 0 ? (fila[cols.name] ?? '').trim() : '';

    if (!id) return resultado.rejected.push({ ...fichero, reason: 'Sin código de carta' });
    if (!ID_VALIDO.test(id) || id.length > 20) {
      return resultado.rejected.push({ ...fichero, reason: `Código de carta no válido: «${id}»` });
    }
    if (normal === null || foil === null) {
      return resultado.rejected.push({
        ...fichero,
        reason: `Cantidad no válida (enteros de 0 a ${MAX_COPIAS})`,
      });
    }
    if (normal === 0 && foil === 0) return; // una fila a cero no aporta nada

    let destino = id;
    let alias: string | undefined;
    if (!catalogo.card(id)) {
      const enlazada = buscarAlias(id, nombre, catalogo);
      if (enlazada) {
        destino = enlazada;
        alias = id;
        resultado.aliased.push({ ...fichero, from: id, to: enlazada });
      } else {
        resultado.outsideCatalog.push({ ...fichero, cardId: id });
      }
    } else {
      destino = catalogo.card(id)!.cardId;
    }

    // El mismo código en dos filas se suma.
    const previo = resultado.cards.get(destino);
    resultado.cards.set(destino, {
      normal: Math.min(MAX_COPIAS, (previo?.normal ?? 0) + normal),
      foil: Math.min(MAX_COPIAS, (previo?.foil ?? 0) + foil),
      ...((alias ?? previo?.alias) ? { alias: alias ?? previo?.alias } : {}),
    });
    resultado.copies += normal + foil;
    return;
  });
  return resultado;
}

// ------------------------------------------------------------------ escritura

function celda(valor: string | number): string {
  const s = String(valor);
  return /[",\n\r]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

/** DotGG escribe "Annie - Fiery" donde el catálogo pone "Annie, Fiery". */
function nombreDotgg(nombre: string): string {
  return nombre.replace(', ', ' - ');
}

/**
 * Exporta en formato DotGG, que importan Riftbound.gg y Riftatlas. Una carta enlazada
 * al importar sale con su id original de DotGG (`alias`), para que el fichero vuelva a
 * entrar sin cambios donde se sacó.
 */
export function exportDotgg(
  cards: ReadonlyMap<string, ImportedQty>,
  catalogo: CatalogLookup,
): string {
  const lineas = ['CardId,Normal,Foil,Name,Set'];
  const ordenadas = [...cards.entries()]
    .filter(([, q]) => q.normal > 0 || q.foil > 0)
    .sort(([a], [b]) => a.localeCompare(b));
  for (const [cardId, q] of ordenadas) {
    const carta = catalogo.card(cardId);
    lineas.push(
      [
        celda(q.alias ?? cardId),
        q.normal,
        q.foil,
        celda(carta ? nombreDotgg(carta.name) : ''),
        celda(carta?.setName ?? ''),
      ].join(','),
    );
  }
  return lineas.join('\r\n') + '\r\n';
}
