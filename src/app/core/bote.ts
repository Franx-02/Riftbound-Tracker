/**
 * Bote: presupuesto mensual para el juego. Cada mes, desde el de inicio hasta el actual
 * (ambos incluidos), entra la aportación de forma automática: no se guarda nada, se calcula.
 * Los movimientos (gastos, ventas y ajustes) sí se guardan. Todo lo de aquí son funciones
 * puras sin Angular ni Firestore, para poder probarlas sueltas.
 *
 * Los importes van en euros con dos decimales; las sumas se hacen en céntimos para que
 * 0.1 + 0.2 no acabe en 0.30000000000000004.
 */

export const TIPOS = ['gasto', 'venta', 'ajuste'] as const;
export type TipoMovimiento = (typeof TIPOS)[number];

export const CATEGORIAS = ['cartas', 'sellado', 'torneo', 'envio', 'otro'] as const;
export type Categoria = (typeof CATEGORIAS)[number];

export const NOMBRE_TIPO: Record<TipoMovimiento, string> = {
  gasto: 'Gasto',
  venta: 'Venta',
  ajuste: 'Ajuste',
};

export const NOMBRE_CATEGORIA: Record<Categoria, string> = {
  cartas: 'Cartas',
  sellado: 'Sellado',
  torneo: 'Torneos',
  envio: 'Envíos',
  otro: 'Otro',
};

/** Los mismos límites que firestore.rules. */
export const MAX_MOVIMIENTOS = 2000;
export const MAX_CONCEPTO = 120;
export const MAX_IMPORTE = 100_000;
export const MAX_APORTACION = 100_000;
export const APORTACION_POR_DEFECTO = 100;

export interface Movimiento {
  id: string;
  /** YYYY-MM-DD. */
  fecha: string;
  tipo: TipoMovimiento;
  categoria: Categoria;
  concepto: string;
  /** Siempre positivo salvo en los ajustes, que pueden ser negativos. El tipo decide el signo. */
  importe: number;
}

export interface Bote {
  /** Lo que entra cada mes, en euros. */
  aportacion: number;
  /** Primer mes que aporta, YYYY-MM. */
  inicio: string;
  movimientos: Movimiento[];
}

export interface ResumenBote {
  saldo: number;
  aportado: number;
  gastado: number;
  vendido: number;
  ajustado: number;
  gastadoEsteMes: number;
  /** Meses que cuentan en el total aportado. */
  mesesAportados: number;
  /** Gasto acumulado por categoría (solo los gastos). */
  porCategoria: Record<Categoria, number>;
  /** Con saldo negativo, cuántas aportaciones hacen falta para volver a 0 o más. null si nunca. */
  mesesParaPositivo: number | null;
}

/** Bote recién creado: 100 € al mes desde el mes actual, sin movimientos. */
export function boteVacio(hoy: Date = new Date()): Bote {
  return { aportacion: APORTACION_POR_DEFECTO, inicio: mesDe(hoy), movimientos: [] };
}

/** YYYY-MM-DD en hora local. */
export function fechaDe(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${dia}`;
}

/** YYYY-MM en hora local. */
export function mesDe(d: Date): string {
  return fechaDe(d).slice(0, 7);
}

export function esMesValido(mes: string): boolean {
  if (!/^\d{4}-\d{2}$/.test(mes)) return false;
  const m = Number(mes.slice(5));
  return m >= 1 && m <= 12;
}

export function esFechaValida(fecha: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return false;
  const [a, m, d] = fecha.split('-').map(Number);
  const f = new Date(a, m - 1, d);
  return f.getFullYear() === a && f.getMonth() === m - 1 && f.getDate() === d;
}

/** Redondea a céntimos. */
export function redondear(euros: number): number {
  return Math.round(euros * 100) / 100;
}

const centimos = (euros: number) => Math.round(euros * 100);

/**
 * Meses que aportan entre `inicio` y el mes de `hasta`, ambos incluidos.
 * Si el inicio es posterior, 0: todavía no ha entrado nada.
 */
export function mesesAportados(inicio: string, hasta: Date | string): number {
  const fin = typeof hasta === 'string' ? hasta.slice(0, 7) : mesDe(hasta);
  if (!esMesValido(inicio) || !esMesValido(fin)) return 0;
  const [a0, m0] = inicio.split('-').map(Number);
  const [a1, m1] = fin.split('-').map(Number);
  return Math.max(0, (a1 - a0) * 12 + (m1 - m0) + 1);
}

/** Lo que ha entrado en el bote por aportaciones hasta la fecha dada. */
export function aportado(bote: Pick<Bote, 'aportacion' | 'inicio'>, hasta: Date | string): number {
  return redondear(mesesAportados(bote.inicio, hasta) * bote.aportacion);
}

/** Lo que un movimiento suma (o resta, si es negativo) al saldo. */
export function efecto(m: Pick<Movimiento, 'tipo' | 'importe'>): number {
  return m.tipo === 'gasto' ? -m.importe : m.importe;
}

/**
 * Resumen a una fecha: solo cuentan las aportaciones hasta ese mes y los movimientos
 * hasta ese día. En la pantalla, la fecha es hoy.
 */
export function resumen(bote: Bote, hoy: Date = new Date()): ResumenBote {
  const fechaHoy = fechaDe(hoy);
  const mesHoy = fechaHoy.slice(0, 7);
  const meses = mesesAportados(bote.inicio, hoy);
  const aportadoC = Math.round(meses * centimos(bote.aportacion));
  let gastado = 0;
  let vendido = 0;
  let ajustado = 0;
  let gastadoEsteMes = 0;
  const porCategoria = Object.fromEntries(CATEGORIAS.map((c) => [c, 0])) as Record<
    Categoria,
    number
  >;
  for (const m of bote.movimientos) {
    if (m.fecha > fechaHoy) continue;
    const c = centimos(m.importe);
    if (m.tipo === 'gasto') {
      gastado += c;
      porCategoria[m.categoria] += c;
      if (m.fecha.startsWith(mesHoy)) gastadoEsteMes += c;
    } else if (m.tipo === 'venta') {
      vendido += c;
    } else {
      ajustado += c;
    }
  }
  const saldoC = aportadoC + vendido + ajustado - gastado;
  let mesesParaPositivo: number | null = null;
  if (saldoC < 0) {
    const ap = centimos(bote.aportacion);
    mesesParaPositivo = ap > 0 ? Math.ceil(-saldoC / ap) : null;
  }
  for (const c of CATEGORIAS) porCategoria[c] /= 100;
  return {
    saldo: saldoC / 100,
    aportado: aportadoC / 100,
    gastado: gastado / 100,
    vendido: vendido / 100,
    ajustado: ajustado / 100,
    gastadoEsteMes: gastadoEsteMes / 100,
    mesesAportados: meses,
    porCategoria,
    mesesParaPositivo,
  };
}

/** Saldo a una fecha, sin el resto del resumen. */
export function saldo(bote: Bote, hoy: Date = new Date()): number {
  return resumen(bote, hoy).saldo;
}

/** Lo que el usuario escribe en el formulario, antes de validarlo. */
export interface MovimientoBorrador {
  fecha: string;
  tipo: TipoMovimiento;
  categoria: Categoria;
  concepto: string;
  /** Tal cual lo escribe: puede llevar coma decimal. */
  importe: string | number;
}

/** "12,50" → 12.5. NaN si no es un número. */
export function leerImporte(texto: string | number): number {
  if (typeof texto === 'number') return texto;
  const limpio = texto.trim().replace(/\s|€/g, '').replace(',', '.');
  if (!/^[-+]?\d+(\.\d+)?$/.test(limpio)) return NaN;
  return Number(limpio);
}

/**
 * Comprueba un borrador. Devuelve los errores en el orden de los campos (vacío si vale).
 * Las fechas futuras no se admiten: el bote registra lo que ya ha pasado.
 */
export function validarMovimiento(b: MovimientoBorrador, hoy: Date = new Date()): string[] {
  const errores: string[] = [];
  if (!esFechaValida(b.fecha)) errores.push('La fecha no es válida');
  else if (b.fecha > fechaDe(hoy)) errores.push('La fecha no puede ser futura');
  if (!TIPOS.includes(b.tipo)) errores.push('Elige un tipo');
  if (!CATEGORIAS.includes(b.categoria)) errores.push('Elige una categoría');
  const concepto = b.concepto.trim();
  if (!concepto) errores.push('El concepto es obligatorio');
  else if (concepto.length > MAX_CONCEPTO)
    errores.push(`El concepto no puede pasar de ${MAX_CONCEPTO} caracteres`);
  const importe = leerImporte(b.importe);
  if (Number.isNaN(importe)) errores.push('El importe no es un número');
  else if (b.tipo !== 'ajuste' && importe <= 0) errores.push('El importe tiene que ser positivo');
  else if (b.tipo === 'ajuste' && importe === 0) errores.push('Un ajuste de 0 € no cambia nada');
  else if (Math.abs(importe) > MAX_IMPORTE)
    errores.push(`El importe no puede pasar de ${MAX_IMPORTE} €`);
  return errores;
}

/** Convierte un borrador ya validado en movimiento. */
export function crearMovimiento(b: MovimientoBorrador, id: string): Movimiento {
  return {
    id,
    fecha: b.fecha,
    tipo: b.tipo,
    categoria: b.categoria,
    concepto: b.concepto.trim(),
    importe: redondear(leerImporte(b.importe)),
  };
}

/** El bote con un movimiento añadido o sustituido (por id). */
export function conMovimiento(bote: Bote, m: Movimiento): Bote {
  const resto = bote.movimientos.filter((x) => x.id !== m.id);
  return { ...bote, movimientos: ordenar([...resto, m]) };
}

export function sinMovimiento(bote: Bote, id: string): Bote {
  return { ...bote, movimientos: bote.movimientos.filter((x) => x.id !== id) };
}

/** Más recientes primero; a misma fecha, el último añadido arriba. */
export function ordenar(movimientos: readonly Movimiento[]): Movimiento[] {
  return movimientos
    .map((m, i) => ({ m, i }))
    .sort((a, b) => b.m.fecha.localeCompare(a.m.fecha) || b.i - a.i)
    .map((x) => x.m);
}

export function validarConfiguracion(aportacion: number, inicio: string): string[] {
  const errores: string[] = [];
  if (!Number.isFinite(aportacion) || aportacion < 0)
    errores.push('La aportación tiene que ser 0 o más');
  else if (aportacion > MAX_APORTACION)
    errores.push(`La aportación no puede pasar de ${MAX_APORTACION} €`);
  if (!esMesValido(inicio)) errores.push('El mes de inicio no es válido');
  return errores;
}

/** Identificador corto para un movimiento nuevo. */
export function nuevoId(azar: () => number = Math.random): string {
  return Date.now().toString(36) + Math.floor(azar() * 36 ** 4).toString(36).padStart(4, '0');
}
