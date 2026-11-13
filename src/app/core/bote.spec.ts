import {
  Bote,
  Movimiento,
  aportado,
  conMovimiento,
  crearMovimiento,
  leerImporte,
  mesesAportados,
  ordenar,
  resumen,
  saldo,
  sinMovimiento,
  validarConfiguracion,
  validarMovimiento,
} from './bote';

let n = 0;
function mov(parcial: Partial<Movimiento> & Pick<Movimiento, 'fecha' | 'tipo' | 'importe'>): Movimiento {
  return { id: `m${++n}`, categoria: 'cartas', concepto: 'Prueba', ...parcial };
}

/** Aportación de 100 € desde diciembre de 2026, con los movimientos dados. */
const bote = (movimientos: Movimiento[], aportacion = 100): Bote => ({
  aportacion,
  inicio: '2026-12',
  movimientos,
});

describe('bote: aportaciones', () => {
  it('cuenta los meses desde el inicio hasta el actual, ambos incluidos', () => {
    expect(mesesAportados('2026-12', new Date(2026, 11, 1))).toBe(1);
    expect(mesesAportados('2026-12', new Date(2027, 0, 31))).toBe(2);
    expect(mesesAportados('2026-12', '2027-11')).toBe(12);
    expect(mesesAportados('2025-01', '2027-03')).toBe(27);
  });

  it('antes del mes de inicio no ha entrado nada', () => {
    expect(mesesAportados('2026-12', new Date(2026, 10, 30))).toBe(0);
    expect(aportado({ aportacion: 100, inicio: '2026-12' }, '2026-11')).toBe(0);
  });

  it('con un mes de inicio inválido no aporta', () => {
    expect(mesesAportados('2026-13', '2027-01')).toBe(0);
    expect(mesesAportados('hola', '2027-01')).toBe(0);
  });
});

describe('bote: saldo', () => {
  it('100 €/mes desde 2026-12, gasto 7 € en diciembre, gasto 125 € y venta 120 € en enero → 188 € a 31 de enero', () => {
    const b = bote([
      mov({ fecha: '2026-12-10', tipo: 'gasto', importe: 7, categoria: 'sellado' }),
      mov({ fecha: '2027-01-05', tipo: 'gasto', importe: 125, categoria: 'cartas' }),
      mov({ fecha: '2027-01-20', tipo: 'venta', importe: 120 }),
    ]);
    const r = resumen(b, new Date(2027, 0, 31));
    expect(r.saldo).toBe(188);
    expect(r.aportado).toBe(200);
    expect(r.gastado).toBe(132);
    expect(r.vendido).toBe(120);
    expect(r.mesesParaPositivo).toBeNull();
    expect(r.porCategoria.sellado).toBe(7);
    expect(r.porCategoria.cartas).toBe(125);
    expect(r.gastadoEsteMes).toBe(125);
  });

  it('100 €/mes desde 2026-12, gasto de 400 € en diciembre → −300 € a 15 de diciembre y 3 meses para volver a positivo', () => {
    const b = bote([mov({ fecha: '2026-12-03', tipo: 'gasto', importe: 400, categoria: 'sellado' })]);
    const r = resumen(b, new Date(2026, 11, 15));
    expect(r.saldo).toBe(-300);
    expect(r.mesesParaPositivo).toBe(3);
    expect(r.gastadoEsteMes).toBe(400);
  });

  it('los meses para volver a positivo redondean hacia arriba', () => {
    const b = bote([mov({ fecha: '2026-12-03', tipo: 'gasto', importe: 350.5 })]);
    expect(resumen(b, new Date(2026, 11, 15)).mesesParaPositivo).toBe(3);
  });

  it('sin aportación, un saldo negativo nunca vuelve a positivo', () => {
    const b = bote([mov({ fecha: '2026-12-03', tipo: 'gasto', importe: 10 })], 0);
    expect(resumen(b, new Date(2026, 11, 15)).mesesParaPositivo).toBeNull();
  });

  it('los ajustes suman o restan según su signo y no cuentan como gasto', () => {
    const b = bote([
      mov({ fecha: '2026-12-03', tipo: 'ajuste', importe: -30 }),
      mov({ fecha: '2026-12-04', tipo: 'ajuste', importe: 5.5 }),
    ]);
    const r = resumen(b, new Date(2026, 11, 15));
    expect(r.saldo).toBe(75.5);
    expect(r.ajustado).toBe(-24.5);
    expect(r.gastado).toBe(0);
  });

  it('los movimientos posteriores a la fecha del resumen no cuentan', () => {
    const b = bote([mov({ fecha: '2027-01-05', tipo: 'gasto', importe: 50 })]);
    expect(saldo(b, new Date(2026, 11, 31))).toBe(100);
    expect(saldo(b, new Date(2027, 0, 5))).toBe(150);
  });

  it('suma en céntimos sin arrastre decimal', () => {
    const b = bote([
      mov({ fecha: '2026-12-01', tipo: 'gasto', importe: 0.1 }),
      mov({ fecha: '2026-12-01', tipo: 'gasto', importe: 0.2 }),
    ]);
    expect(resumen(b, new Date(2026, 11, 15)).gastado).toBe(0.3);
    expect(saldo(b, new Date(2026, 11, 15))).toBe(99.7);
  });
});

describe('bote: validación', () => {
  const hoy = new Date(2027, 0, 15);
  const bien = {
    fecha: '2027-01-10',
    tipo: 'gasto' as const,
    categoria: 'sellado' as const,
    concepto: 'Caja de sobres',
    importe: '129,90',
  };

  it('acepta un borrador correcto, con coma decimal', () => {
    expect(validarMovimiento(bien, hoy)).toEqual([]);
    const m = crearMovimiento(bien, 'x');
    expect(m.importe).toBe(129.9);
    expect(m.concepto).toBe('Caja de sobres');
  });

  it('exige fecha válida y no futura', () => {
    expect(validarMovimiento({ ...bien, fecha: '2027-02-30' }, hoy)).toContain('La fecha no es válida');
    expect(validarMovimiento({ ...bien, fecha: '' }, hoy)).toContain('La fecha no es válida');
    expect(validarMovimiento({ ...bien, fecha: '2027-01-16' }, hoy)).toContain(
      'La fecha no puede ser futura',
    );
    expect(validarMovimiento({ ...bien, fecha: '2027-01-15' }, hoy)).toEqual([]);
  });

  it('exige concepto', () => {
    expect(validarMovimiento({ ...bien, concepto: '   ' }, hoy)).toContain('El concepto es obligatorio');
  });

  it('exige importe positivo salvo en los ajustes', () => {
    expect(validarMovimiento({ ...bien, importe: '0' }, hoy)).toContain(
      'El importe tiene que ser positivo',
    );
    expect(validarMovimiento({ ...bien, importe: '-5' }, hoy)).toContain(
      'El importe tiene que ser positivo',
    );
    expect(validarMovimiento({ ...bien, importe: 'abc' }, hoy)).toContain('El importe no es un número');
    expect(validarMovimiento({ ...bien, tipo: 'ajuste', importe: '-5' }, hoy)).toEqual([]);
    expect(validarMovimiento({ ...bien, tipo: 'ajuste', importe: '0' }, hoy)).toContain(
      'Un ajuste de 0 € no cambia nada',
    );
  });

  it('lee importes con coma, punto y símbolo de euro', () => {
    expect(leerImporte('12,50')).toBe(12.5);
    expect(leerImporte(' 12.50 € ')).toBe(12.5);
    expect(leerImporte('-3')).toBe(-3);
    expect(leerImporte('1.000,50')).toBeNaN();
  });

  it('valida la configuración', () => {
    expect(validarConfiguracion(100, '2026-12')).toEqual([]);
    expect(validarConfiguracion(0, '2026-12')).toEqual([]);
    expect(validarConfiguracion(-1, '2026-12')).toContain('La aportación tiene que ser 0 o más');
    expect(validarConfiguracion(NaN, '2026-12')).toContain('La aportación tiene que ser 0 o más');
    expect(validarConfiguracion(100, '2026-00')).toContain('El mes de inicio no es válido');
  });
});

describe('bote: movimientos', () => {
  it('añade, sustituye por id y borra', () => {
    const a = mov({ id: 'a', fecha: '2026-12-01', tipo: 'gasto', importe: 1 });
    const b = mov({ id: 'b', fecha: '2026-12-05', tipo: 'gasto', importe: 2 });
    let x = conMovimiento(bote([]), a);
    x = conMovimiento(x, b);
    expect(x.movimientos.map((m) => m.id)).toEqual(['b', 'a']);
    x = conMovimiento(x, { ...a, importe: 9 });
    expect(x.movimientos).toHaveLength(2);
    expect(x.movimientos.find((m) => m.id === 'a')?.importe).toBe(9);
    x = sinMovimiento(x, 'b');
    expect(x.movimientos.map((m) => m.id)).toEqual(['a']);
  });

  it('ordena de más reciente a más antiguo', () => {
    const lista = ordenar([
      mov({ id: '1', fecha: '2026-12-01', tipo: 'gasto', importe: 1 }),
      mov({ id: '2', fecha: '2027-01-01', tipo: 'gasto', importe: 1 }),
      mov({ id: '3', fecha: '2026-12-15', tipo: 'gasto', importe: 1 }),
    ]);
    expect(lista.map((m) => m.id)).toEqual(['2', '3', '1']);
  });
});
