import { CatalogCard } from './catalog.service';
import { otsu } from './ocr.service';
import { cartasDelCodigo, parseCodigos } from './scanner';

const SETS = new Set(['OGN', 'SFD', 'RAD', 'UNL', 'VEN', 'OPP', 'PR']);

describe('parseCodigos', () => {
  it('lee el formato impreso con separador y total', () => {
    expect(parseCodigos('SFD • 198/221', SETS)).toEqual([
      { set: 'SFD', num: 198, total: 221, promo: false },
    ]);
    expect(parseCodigos('ogn·027/298', SETS)).toEqual([
      { set: 'OGN', num: 27, total: 298, promo: false },
    ]);
  });

  it('corrige las confusiones típicas del OCR', () => {
    // O por 0 en el número, 0 por O en el set, | por /
    expect(parseCodigos('0GN - 1O2|298', SETS)).toEqual([
      { set: 'OGN', num: 102, total: 298, promo: false },
    ]);
    expect(parseCodigos('SFD 2I5/221', SETS)).toEqual([
      { set: 'SFD', num: 215, total: 221, promo: false },
    ]);
  });

  it('acepta lo que se escribe a mano', () => {
    expect(parseCodigos('sfd 198', SETS)).toEqual([
      { set: 'SFD', num: 198, total: null, promo: false },
    ]);
    expect(parseCodigos('RAD-020A', SETS)).toEqual([
      { set: 'RAD', num: 20, total: null, promo: false },
    ]);
  });

  it('descarta sets desconocidos y números que no caben en el total', () => {
    expect(parseCodigos('ABC 12/200', SETS)).toEqual([]);
    expect(parseCodigos('SFD 900/221', SETS)).toEqual([]);
    expect(parseCodigos('ruido sin código', SETS)).toEqual([]);
  });

  it('detecta la P de las promos tras el total', () => {
    expect(parseCodigos('RAD • 015/167 • P • EN', SETS)).toEqual([
      { set: 'RAD', num: 15, total: 167, promo: true },
    ]);
  });

  it('encuentra el código en medio de otro texto y no repite', () => {
    const texto = 'ILLUS. ALGUIEN\nSFD • 198/221 EN\nSFD 198/221';
    expect(parseCodigos(texto, SETS)).toEqual([{ set: 'SFD', num: 198, total: 221, promo: false }]);
  });
});

describe('cartasDelCodigo', () => {
  const carta = (cardId: string, set: string, num: number, name = 'X', rarity = 'Rare') =>
    ({ cardId, set, num, name, rarity }) as CatalogCard;

  it('añade las promos con el mismo nombre, delante si se leyó la P', () => {
    const conPromo = [
      carta('RAD-015', 'RAD', 15, 'Akali, Brash'),
      carta('OPP-015', 'OPP', 15, 'Akali, Brash (Champion)', 'Promo'),
      carta('OPP-016', 'OPP', 16, 'Otra', 'Promo'),
    ];
    const ids = (promo: boolean) =>
      cartasDelCodigo(conPromo, { set: 'RAD', num: 15, promo }).map((c) => c.cardId);
    expect(ids(false)).toEqual(['RAD-015', 'OPP-015']);
    expect(ids(true)).toEqual(['OPP-015', 'RAD-015']);
  });
  const cards = [
    carta('SFD-198A', 'SFD', 198),
    carta('SFD-198', 'SFD', 198),
    carta('SFD-199', 'SFD', 199),
    carta('OGN-198', 'OGN', 198),
  ];

  it('devuelve todas las versiones del número, la normal primero', () => {
    expect(cartasDelCodigo(cards, { set: 'SFD', num: 198 }).map((c) => c.cardId)).toEqual([
      'SFD-198',
      'SFD-198A',
    ]);
  });
});

describe('otsu', () => {
  it('separa dos grupos de grises claramente distintos', () => {
    const h = new Array<number>(256).fill(0);
    h[20] = 100;
    h[230] = 100;
    const u = otsu(h, 200);
    expect(u).toBeGreaterThan(20);
    expect(u).toBeLessThanOrEqual(230);
  });
});
