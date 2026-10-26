/**
 * Colores de los dominios de Riftbound. Toda la app se tiñe con ellos: cartas, filtros,
 * barras de progreso y fichas. Los valores viven en styles.scss (`--fury`, `--calm`…);
 * aquí solo se traduce el nombre del catálogo a su variable CSS.
 */
export const DOMINIOS = ['Fury', 'Calm', 'Mind', 'Body', 'Chaos', 'Order'] as const;

/** `var(--fury)` para "Fury"; las incoloras y desconocidas, gris. */
export function colorDominio(dominio: string | undefined): string {
  const d = dominio?.toLowerCase();
  return d && (DOMINIOS as readonly string[]).some((x) => x.toLowerCase() === d)
    ? `var(--${d})`
    : 'var(--colorless)';
}

/**
 * Variables `--dom-a` y `--dom-b` para pintar una carta: las de un dominio repiten color y
 * las de dos hacen degradado entre ambos.
 */
export function estiloDominios(dominios: readonly string[]): Record<string, string> {
  const a = colorDominio(dominios[0]);
  return { '--dom-a': a, '--dom-b': dominios[1] ? colorDominio(dominios[1]) : a };
}
