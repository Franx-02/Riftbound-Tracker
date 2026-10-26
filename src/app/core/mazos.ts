import { CatalogCard } from './catalog.service';

/**
 * Mazos de Riftbound y sus reglas de construcción (Core Rules, regla 103):
 * - Una Leyenda de campeón, que fija la identidad de dominio del mazo.
 * - Mazo principal de al menos 40 cartas contando el Campeón elegido, que tiene que ser una
 *   unidad de campeón con la etiqueta de la Leyenda. Solo unidades, equipo y hechizos.
 * - Hasta 3 copias de cada nombre (el Campeón elegido cuenta). Los nombres con subtítulo
 *   distinto son cartas distintas; las variantes de arte (Alternate Art, Signature…) no.
 * - Como mucho 3 cartas Signature en total, todas con la etiqueta de la Leyenda.
 * - Mazo de runas de exactamente 12, del dominio de la Leyenda.
 * - 3 campos de batalla, sin repetir nombre.
 * - Todo respeta la identidad de dominio: una carta de varios dominios necesita que la
 *   Leyenda los tenga todos; las incoloras valen en cualquier mazo.
 * - Banquillo para torneo al mejor de tres: 0 u 8 cartas (guía de riftbound.gg; algunas
 *   fuentes dicen 10). Se avisa, pero no se trata como regla del juego.
 */
export interface Mazo {
  id: string;
  nombre: string;
  leyenda: string | null;
  campeon: string | null;
  /** cardId → copias, sin contar el Campeón elegido. */
  principal: Record<string, number>;
  runas: Record<string, number>;
  campos: string[];
  banquillo: Record<string, number>;
  /** ISO 8601. */
  actualizado: string;
}

export type Zona = 'principal' | 'runas' | 'banquillo';

export const TAMANO_PRINCIPAL = 40;
export const TAMANO_RUNAS = 12;
export const NUM_CAMPOS = 3;
export const MAX_COPIAS = 3;
export const MAX_SIGNATURE = 3;
export const TAMANO_BANQUILLO = 8;

export function mazoVacio(id: string, nombre: string): Mazo {
  return {
    id,
    nombre,
    leyenda: null,
    campeon: null,
    principal: {},
    runas: {},
    campos: [],
    banquillo: {},
    actualizado: new Date().toISOString(),
  };
}

/** "Jinx, Loose Cannon (Alternate Art)" → "Jinx, Loose Cannon". */
export function nombreBase(nombre: string): string {
  return nombre.replace(/\s*\([^)]*\)\s*$/, '');
}

/** Dominios que cuentan para la identidad: las incoloras no tienen. */
function dominiosDe(card: CatalogCard): string[] {
  return card.domains.filter((d) => d !== 'Colorless');
}

export function esLeyenda(card: CatalogCard): boolean {
  return card.type === 'Legend';
}

/** Lo que admite el mazo principal: unidades, equipo y hechizos, sin fichas. */
export function esDelPrincipal(card: CatalogCard): boolean {
  return ['Unit', 'Gear', 'Spell'].includes(card.type) && card.supertype !== 'Token';
}

export function esRuna(card: CatalogCard): boolean {
  return card.type === 'Rune';
}

export function esCampo(card: CatalogCard): boolean {
  return card.type === 'Battlefield' && card.supertype !== 'Token';
}

export function esSignature(card: CatalogCard): boolean {
  return card.supertype === 'Signature';
}

/** Una unidad de campeón con la etiqueta de la Leyenda. */
export function esCampeonDe(card: CatalogCard, leyenda: CatalogCard): boolean {
  return (
    card.type === 'Unit' &&
    card.supertype === 'Champion' &&
    card.tags.some((t) => leyenda.tags.includes(t))
  );
}

/** ¿Cabe en la identidad de dominio de esta Leyenda? */
export function encajaEnDominio(card: CatalogCard, leyenda: CatalogCard | undefined): boolean {
  if (!leyenda) return true;
  const propios = dominiosDe(leyenda);
  return dominiosDe(card).every((d) => propios.includes(d));
}

export function contar(zona: Record<string, number>): number {
  return Object.values(zona).reduce((a, b) => a + b, 0);
}

/** Cartas del mazo principal contando el Campeón elegido. */
export function tamanoPrincipal(mazo: Mazo): number {
  return contar(mazo.principal) + (mazo.campeon ? 1 : 0);
}

export interface Comprobacion {
  ok: boolean;
  texto: string;
  /** Solo informativa: no impide que el mazo sea legal. */
  aviso?: boolean;
}

/** Comprueba el mazo contra las reglas de construcción. */
export function validar(
  mazo: Mazo,
  carta: (cardId: string) => CatalogCard | undefined,
): Comprobacion[] {
  const salida: Comprobacion[] = [];
  const leyenda = mazo.leyenda ? carta(mazo.leyenda) : undefined;
  const campeon = mazo.campeon ? carta(mazo.campeon) : undefined;

  salida.push({ ok: !!leyenda, texto: 'Una Leyenda de campeón' });
  salida.push({
    ok: !!campeon && !!leyenda && esCampeonDe(campeon, leyenda),
    texto: 'Campeón elegido: una unidad de campeón de la Leyenda',
  });

  const tam = tamanoPrincipal(mazo);
  salida.push({
    ok: tam >= TAMANO_PRINCIPAL,
    texto: `Mazo principal de al menos ${TAMANO_PRINCIPAL} cartas, con el Campeón (${tam})`,
  });

  // Copias por nombre, con el Campeón incluido.
  const porNombre = new Map<string, number>();
  const sumar = (id: string, n: number) => {
    const c = carta(id);
    if (!c) return;
    const nombre = nombreBase(c.name);
    porNombre.set(nombre, (porNombre.get(nombre) ?? 0) + n);
  };
  for (const [id, n] of Object.entries(mazo.principal)) sumar(id, n);
  if (mazo.campeon) sumar(mazo.campeon, 1);
  const pasadas = [...porNombre].filter(([, n]) => n > MAX_COPIAS).map(([nombre]) => nombre);
  salida.push({
    ok: pasadas.length === 0,
    texto:
      `Máximo ${MAX_COPIAS} copias de cada nombre` +
      (pasadas.length ? ` (sobran de ${pasadas.join(', ')})` : ''),
  });

  const principal = Object.entries(mazo.principal).flatMap(([id, n]) => {
    const c = carta(id);
    return c ? [{ c, n }] : [];
  });
  const signatures = principal.filter((x) => esSignature(x.c));
  const nSignature = signatures.reduce((a, x) => a + x.n, 0);
  const signatureAjena = !!leyenda && signatures.some((x) => !esCampeonDeTag(x.c, leyenda));
  salida.push({
    ok: nSignature <= MAX_SIGNATURE && !signatureAjena,
    texto: `Máximo ${MAX_SIGNATURE} cartas Signature, de la Leyenda (${nSignature})`,
  });

  const fueraDeDominio = [
    ...principal.map((x) => x.c),
    ...(campeon ? [campeon] : []),
    ...Object.keys(mazo.runas).flatMap((id) => carta(id) ?? []),
    ...mazo.campos.flatMap((id) => carta(id) ?? []),
    ...Object.keys(mazo.banquillo).flatMap((id) => carta(id) ?? []),
  ].filter((c) => !encajaEnDominio(c, leyenda));
  salida.push({
    ok: fueraDeDominio.length === 0,
    texto:
      'Todo dentro de los dominios de la Leyenda' +
      (fueraDeDominio.length
        ? ` (fuera: ${[...new Set(fueraDeDominio.map((c) => nombreBase(c.name)))].join(', ')})`
        : ''),
  });

  const runas = contar(mazo.runas);
  salida.push({
    ok: runas === TAMANO_RUNAS,
    texto: `Mazo de runas de ${TAMANO_RUNAS} (${runas})`,
  });

  const nombresCampos = new Set(mazo.campos.map((id) => nombreBase(carta(id)?.name ?? id)));
  salida.push({
    ok: mazo.campos.length === NUM_CAMPOS && nombresCampos.size === NUM_CAMPOS,
    texto: `${NUM_CAMPOS} campos de batalla distintos (${mazo.campos.length})`,
  });

  const banquillo = contar(mazo.banquillo);
  salida.push({
    ok: banquillo === 0 || banquillo === TAMANO_BANQUILLO,
    texto: `Banquillo de torneo: 0 u ${TAMANO_BANQUILLO} cartas (${banquillo})`,
    aviso: true,
  });

  return salida;
}

function esCampeonDeTag(card: CatalogCard, leyenda: CatalogCard): boolean {
  return card.tags.some((t) => leyenda.tags.includes(t));
}

export function esLegal(comprobaciones: Comprobacion[]): boolean {
  return comprobaciones.every((c) => c.ok || c.aviso);
}

/** Todas las cartas del mazo (sin banquillo) con sus copias: para comparar con la colección. */
export function cartasDelMazo(mazo: Mazo, conBanquillo = false): Map<string, number> {
  const salida = new Map<string, number>();
  const sumar = (id: string, n: number) => salida.set(id, (salida.get(id) ?? 0) + n);
  if (mazo.leyenda) sumar(mazo.leyenda, 1);
  if (mazo.campeon) sumar(mazo.campeon, 1);
  for (const [id, n] of Object.entries(mazo.principal)) sumar(id, n);
  for (const [id, n] of Object.entries(mazo.runas)) sumar(id, n);
  for (const id of mazo.campos) sumar(id, 1);
  if (conBanquillo) for (const [id, n] of Object.entries(mazo.banquillo)) sumar(id, n);
  return salida;
}
