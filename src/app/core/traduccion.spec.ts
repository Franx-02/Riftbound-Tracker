import { claveTexto, validarTraduccion } from './traduccion';

const OPC = { keywordsEnIngles: true };
const EN =
  '[Action] (Play on your turn or in showdowns.)\nDeal 3 to a unit at a battlefield. If this kills it, draw 1.';
const ES =
  '[Action] (Juega en tu turno o en enfrentamientos.)\nInflige 3 a una unidad en un campo de batalla. Si esto la mata, roba 1.';

describe('claveTexto', () => {
  it('es estable y distingue textos que solo cambian en un carácter', () => {
    expect(claveTexto(EN)).toBe(claveTexto(EN));
    expect(claveTexto(EN)).not.toBe(claveTexto(EN.replace('3', '4')));
    // La de la muestra: si cambia el algoritmo, todos los lotes dejarían de casar.
    expect(claveTexto(EN)).toBe('29ly5np2kr9');
  });
});

describe('validarTraduccion', () => {
  it('acepta una traducción que conserva todo', () => {
    expect(validarTraduccion(EN, ES, OPC)).toEqual([]);
  });

  it('detecta un número cambiado', () => {
    expect(validarTraduccion(EN, ES.replace('Inflige 3', 'Inflige 2'), OPC)).toContain(
      'Número «3»: 1 en inglés, 0 en español',
    );
  });

  it('detecta un símbolo perdido o cambiado', () => {
    const en = 'You may pay :rb_energy_1::rb_rune_fury:.';
    expect(validarTraduccion(en, 'Puedes pagar :rb_energy_1:.', OPC)).toContain(
      'Símbolo «:rb_rune_fury:»: 1 en inglés, 0 en español',
    );
  });

  it('con keywords en inglés, una keyword traducida no pasa', () => {
    expect(validarTraduccion(EN, ES.replace('[Action]', '[Acción]'), OPC).length).toBeGreaterThan(
      0,
    );
    expect(
      validarTraduccion(EN, ES.replace('[Action]', '[Acción]'), { keywordsEnIngles: false }),
    ).toEqual([]);
  });

  it('detecta flechas, saltos de línea y viñetas que faltan', () => {
    expect(validarTraduccion('[Level 3][>] Draw 1.', '[Level 3] Roba 1.', OPC)).toContain(
      'Flecha «[>]»: 1 en inglés, 0 en español',
    );
    expect(validarTraduccion(EN, ES.replace('\n', ' '), OPC)).toContain(
      'Líneas: 2 en inglés, 1 en español',
    );
    expect(validarTraduccion('Choose one —\n• Draw 1.', 'Elige una —\nRoba 1.', OPC)).toContain(
      'Viñetas: 1 en inglés, 0 en español',
    );
  });

  it('rechaza una traducción vacía', () => {
    expect(validarTraduccion(EN, '  ', OPC)).toEqual(['La traducción está vacía']);
  });
});
