import { codigoATexto, descodificarCodigoMazo, pareceCodigoMazo } from './codigo-mazo';

/** Código de Riftmana de un mazo de Annie, contrastado con su lista en texto. */
const ANNIE =
  'CMAAAAAAAAAQCAABUYAQAAIBAAAQOAAEAMAAADBHXIAQEAYABSDQCAIEAABAEBQABRUQIAQAAACKSAICAMABMGIBAMAZKAIBAQAIAAIEAIAABLABVIBAEAIABIIQCAYA3QAQGBQAAZVKGAIBAECQADYCAEBQBCABAECABBABAIBAAAA5VQAQCAYABYAQCAAK';

/** Código de Riftmana de un mazo de Riven, cuya lista exportada era de la forma "1xRAD-149". */
const RIVEN =
  'CMAAAAAAAAAQCAAAUYAQAAIBAAACUAAEAMAAAOSNY4AQCAYAGAAQKABMAMDAA2LLSYAQEBAAAAWUHKIBVQAQCBAAGUBQGAYAFWIQDTYBAMCABAABSMA5OAIEAYACAK4VAGSQCAACAECQAKABAYAGKBIBAAAC2AIDAAWQEBAAQAAZMAIBAUACMAIGAAUQCBQAFM';

const mapa = (entradas: { cardId: string; copias: number }[]) =>
  Object.fromEntries(entradas.map((e) => [e.cardId, e.copias]));

describe('códigos de mazo', () => {
  it('distingue un código de una lista', () => {
    expect(pareceCodigoMazo(ANNIE)).toBe(true);
    expect(pareceCodigoMazo(` ${RIVEN.toLowerCase()}==\n`)).toBe(true);
    expect(pareceCodigoMazo('1xRAD-149\n3xOGN-003')).toBe(false);
    expect(pareceCodigoMazo('Legend:\n1 Annie, Dark Child')).toBe(false);
    expect(pareceCodigoMazo('ABCDEFG')).toBe(false);
  });

  it('descodifica el mazo de Annie: principal, runas, campos, banquillo y Campeón', () => {
    const d = descodificarCodigoMazo(ANNIE);
    expect(mapa(d.cartas)).toEqual({
      // Leyenda y Campeón van entre las de una copia.
      'OGS-017': 1,
      'OGS-010': 1,
      // Mazo principal.
      'OGN-012': 3,
      'OGN-039': 3,
      'OGN-186': 3,
      'SFD-012': 3,
      'SFD-135': 3,
      'UNL-002': 3,
      'RAD-012': 3,
      'RAD-105': 3,
      'OGN-004': 2,
      'OGN-169': 2,
      'SFD-022': 2,
      'SFD-025': 2,
      'SFD-149A': 2, // Ezreal en arte alternativo: variante 1
      'UNL-128': 2,
      'OGN-172': 1,
      'RAD-006': 1,
      'RAD-106': 1,
      // Campos de batalla.
      'OGN-298': 1,
      'SFD-220': 1,
      'RAD-163': 1,
      // Runas, también en arte alternativo.
      'OGN-166A': 7,
      'OGN-007A': 5,
    });
    expect(mapa(d.banquillo)).toEqual({
      'VEN-015': 3,
      'SFD-136': 2,
      'UNL-132': 2,
      'OGN-029': 1,
      'OGN-172': 1,
      'SFD-014': 1,
    });
    expect(d.campeon).toEqual({ cardId: 'OGS-010', copias: 1, conocida: true });
    expect(d.cartas.every((e) => e.conocida)).toBe(true);
  });

  it('descodifica el mazo de Riven igual que su lista "1xRAD-149"', () => {
    const d = descodificarCodigoMazo(RIVEN);
    expect(mapa(d.cartas)).toEqual({
      'RAD-149': 1,
      'SFD-207': 1,
      'UNL-215': 1,
      'RAD-165': 1,
      'RAD-043': 1,
      'OGN-045': 2,
      'OGN-169': 2,
      'RAD-032': 1,
      'RAD-107': 3,
      'OGN-058': 3,
      'SFD-045': 1,
      'OGN-172': 2,
      'UNL-053': 2,
      'SFD-145': 1,
      'OGN-199': 3,
      'OGN-077': 3,
      'RAD-150': 3,
      'RAD-105': 3,
      'UNL-128': 1,
      'SFD-048': 3,
      'OGN-067': 2,
      'VEN-044': 3,
      'UNL-147': 1,
      'OGN-166': 7,
      'OGN-042': 5,
    });
    // La lista "1x…" de Riftmana no traía el banquillo, pero el código sí (10 cartas).
    expect(mapa(d.banquillo)).toEqual({
      'VEN-040': 2,
      'RAD-101': 2,
      'OGN-045': 1,
      'SFD-045': 1,
      'UNL-128': 1,
      'UNL-150': 1,
      'VEN-038': 1,
      'RAD-041': 1,
    });
    expect(d.campeon?.cardId).toBe('RAD-043');
  });

  it('pasa el código a texto sacando la copia del Campeón del mazo principal', () => {
    const texto = codigoATexto(ANNIE);
    // Solo una vez: la de la sección Champion, no otra suelta en el principal.
    expect(texto.match(/^1 OGS-010$/gm)).toHaveLength(1);
    expect(texto).toMatch(/^Champion:\n1 OGS-010$/m);
    expect(texto).toMatch(/^Sideboard:\n3 VEN-015$/m);
    expect(texto).toMatch(/^7 OGN-166A$/m);
  });

  it('un set desconocido no rompe: la carta sale marcada', () => {
    // Igual que ANNIE pero con el set 2 en un grupo: lo construimos a mano con varints.
    const bytes = Uint8Array.from([0x13, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 2, 0, 5, 0, 0, 0]);
    const a = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    let bits = '';
    for (const b of bytes) bits += b.toString(2).padStart(8, '0');
    let codigo = '';
    for (let i = 0; i + 5 <= bits.length; i += 5) codigo += a[parseInt(bits.slice(i, i + 5), 2)];
    const d = descodificarCodigoMazo(codigo);
    expect(d.cartas).toEqual([{ cardId: 'set 2 #5', copias: 1, conocida: false }]);
    expect(d.campeon).toBeNull();
  });

  it('rechaza lo que no es base32', () => {
    expect(() => descodificarCodigoMazo('CMAA1AAA')).toThrow();
  });
});
