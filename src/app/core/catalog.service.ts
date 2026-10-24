import { Injectable, computed, signal } from '@angular/core';

/**
 * Catálogo estático: /data/catalog.json y /data/mapping.json, los dos generados
 * por tools/build-catalog.mts. Si cambian esas estructuras, hay que tocar las dos partes.
 */

export type Confianza = 'alta' | 'media' | 'baja' | 'sin-mapear';

export interface CatalogCard {
  /** Clave de todo: en mayúsculas, p. ej. `SFD-110A`. Coincide con el CardId de DotGG. */
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

export interface CatalogSet {
  id: string;
  name: string;
  count: number;
  released: string;
}

export interface CardMapping {
  /** Producto de Cardmarket. null = esta carta no se vende suelta o no se ha podido mapear. */
  idProduct: number | null;
  confianza: Confianza;
  motivo: string;
  /** Todos los productos con ese nombre, para el botón de corregir de la ficha. */
  candidatos: number[];
}

interface CatalogFile {
  generado: string;
  fuente: string;
  sets: CatalogSet[];
  cards: CatalogCard[];
}

interface MappingFile {
  generado: string;
  cardmarketCreatedAt: string;
  mapping: Record<string, CardMapping>;
  /** idProduct → idExpansion, para cada candidato. */
  productos: Record<string, number>;
  /** idExpansion → set del catálogo que vive en ella, o null si es de promos. */
  expansiones: Record<string, string | null>;
}

/** Un producto de Cardmarket que podría ser esta carta, para el botón de corregir. */
export interface Candidate {
  idProduct: number;
  idExpansion: number;
  /** Set del catálogo al que pertenece la expansión. null = expansión de promos. */
  set: string | null;
}

/** Filtros de la pantalla de catálogo. Un array vacío significa "no filtrar por esto". */
export interface CatalogFilters {
  texto?: string;
  sets?: string[];
  rarities?: string[];
  domains?: string[];
  types?: string[];
}

const SIN_MAPEAR: CardMapping = {
  idProduct: null,
  confianza: 'sin-mapear',
  motivo: 'Carta desconocida',
  candidatos: [],
};

@Injectable({ providedIn: 'root' })
export class CatalogService {
  readonly cards = signal<readonly CatalogCard[]>([]);
  readonly sets = signal<readonly CatalogSet[]>([]);
  readonly generado = signal<string | null>(null);
  readonly error = signal<string | null>(null);
  readonly loaded = computed(() => this.cards().length > 0);

  /** Valores presentes en el catálogo, para montar los filtros sin listas codificadas. */
  readonly rarities = computed(() => unicos(this.cards().map((c) => c.rarity)));
  readonly types = computed(() => unicos(this.cards().map((c) => c.type)));
  readonly domains = computed(() => unicos(this.cards().flatMap((c) => c.domains)));

  private readonly mapeo = signal<MappingFile | null>(null);

  // Todo lo derivado es computed y no un campo normal: así, quien lea card(), mapping()
  // o filter() dentro de un computed o una plantilla se recalcula cuando llegan los datos.
  private readonly porCardId = computed(() => new Map(this.cards().map((c) => [c.cardId, c])));
  /** Nombre y código normalizados por carta, para no recalcularlos en cada búsqueda. */
  private readonly indice = computed(() =>
    this.cards().map((card) => ({
      card,
      nombre: normalizar(card.name),
      codigo: normalizar(card.cardId),
    })),
  );
  private carga: Promise<void> | null = null;

  /** Carga los dos JSON una sola vez, aunque la llamen varias pantallas a la vez. */
  load(): Promise<void> {
    this.carga ??= this.cargar();
    return this.carga;
  }

  private async cargar(): Promise<void> {
    try {
      const [catalogo, mapeo] = await Promise.all([
        bajar<CatalogFile>('/data/catalog.json'),
        bajar<MappingFile>('/data/mapping.json'),
      ]);
      this.mapeo.set(mapeo);
      const sets = [...catalogo.sets].sort((a, b) => b.released.localeCompare(a.released));
      // El set más reciente primero: es el que se está abriendo ahora.
      const orden = new Map(sets.map((s, i) => [s.id, i]));
      const cartas = [...catalogo.cards].sort(
        (a, b) =>
          (orden.get(a.set) ?? 99) - (orden.get(b.set) ?? 99) || a.cardId.localeCompare(b.cardId),
      );
      this.sets.set(sets);
      this.generado.set(catalogo.generado);
      this.cards.set(cartas);
      this.error.set(null);
    } catch (e) {
      // Que falle la carga deja la app sin catálogo: hay que enseñarlo, no tragárselo.
      this.carga = null;
      this.error.set(e instanceof Error ? e.message : String(e));
    }
  }

  card(cardId: string): CatalogCard | undefined {
    return this.porCardId().get(cardId.toUpperCase());
  }

  mapping(cardId: string): CardMapping {
    return this.mapeo()?.mapping[cardId.toUpperCase()] ?? SIN_MAPEAR;
  }

  candidates(cardId: string): Candidate[] {
    const datos = this.mapeo();
    return this.mapping(cardId).candidatos.map((idProduct) => {
      const idExpansion = datos?.productos?.[idProduct] ?? 0;
      return { idProduct, idExpansion, set: datos?.expansiones?.[idExpansion] ?? null };
    });
  }

  setName(setId: string | null): string {
    if (!setId) return 'Promos y extras';
    return this.sets().find((s) => s.id === setId)?.name ?? setId;
  }

  /**
   * Busca por nombre o por código. Ordena de más a menos exacto: código exacto,
   * nombre exacto, nombre que empieza igual y, por último, el resto.
   */
  search(texto: string, limite = 50): CatalogCard[] {
    const q = normalizar(texto);
    if (!q) return [];
    const palabras = q.split(' ');
    const encontrados: { card: CatalogCard; peso: number }[] = [];
    for (const { card, nombre, codigo } of this.indice()) {
      const peso = this.peso(q, palabras, nombre, codigo);
      if (peso > 0) encontrados.push({ card, peso });
    }
    encontrados.sort((a, b) => b.peso - a.peso || a.card.cardId.localeCompare(b.card.cardId));
    return encontrados.slice(0, limite).map((e) => e.card);
  }

  /** Catálogo filtrado: del set más reciente al más antiguo, y por código dentro de cada set. */
  filter(filtros: CatalogFilters): CatalogCard[] {
    const q = normalizar(filtros.texto ?? '');
    const palabras = q ? q.split(' ') : [];
    return this.indice()
      .filter(({ card, nombre, codigo }) => {
        if (filtros.sets?.length && !filtros.sets.includes(card.set)) return false;
        if (filtros.rarities?.length && !filtros.rarities.includes(card.rarity)) return false;
        if (filtros.types?.length && !filtros.types.includes(card.type)) return false;
        if (filtros.domains?.length && !card.domains.some((d) => filtros.domains!.includes(d)))
          return false;
        return q ? this.peso(q, palabras, nombre, codigo) > 0 : true;
      })
      .map(({ card }) => card);
  }

  private peso(q: string, palabras: string[], nombre: string, codigo: string): number {
    if (codigo === q) return 100;
    if (nombre === q) return 90;
    if (codigo.startsWith(q)) return 80;
    if (nombre.startsWith(q)) return 70;
    // Todas las palabras sueltas, en cualquier orden: "annie fiery" encuentra "Annie, Fiery".
    if (palabras.every((p) => nombre.includes(p))) return 40;
    return 0;
  }
}

async function bajar<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return (await res.json()) as T;
}

/**
 * Minúsculas, sin acentos y sin puntuación. Hace que "Annie - Fiery" (DotGG),
 * "Annie, Fiery" (catálogo) y "annie fiery" (lo que teclea el usuario) coincidan.
 */
function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function unicos(valores: string[]): string[] {
  return [...new Set(valores)].sort((a, b) => a.localeCompare(b));
}
