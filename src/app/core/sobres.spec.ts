import { CatalogCard } from './catalog.service';
import {
  MAX_APERTURAS,
  RECARGA_MS,
  abrirSobre,
  albumVacio,
  consumir,
  faltaParaSiguiente,
  guardarEnAlbum,
  progreso,
  recargar,
} from './sobres';

function carta(id: string, rarity: string, extra: Partial<CatalogCard> = {}): CatalogCard {
  return {
    cardId: id,
    riftboundId: id,
    name: id,
    num: 0,
    set: 'OGN',
    setName: 'Origins',
    type: 'Unit',
    supertype: null,
    rarity,
    domains: [],
    energy: 1,
    might: 1,
    power: 0,
    text: '',
    flavour: null,
    tags: [],
    artist: null,
    imgUrl: '',
    orientation: 'portrait',
    alt: false,
    signature: false,
    overnumbered: false,
    ...extra,
  };
}

const CATALOGO: CatalogCard[] = [
  ...Array.from({ length: 10 }, (_, i) => carta(`C${i}`, 'Common')),
  ...Array.from({ length: 5 }, (_, i) => carta(`U${i}`, 'Uncommon')),
  ...Array.from({ length: 5 }, (_, i) => carta(`R${i}`, 'Rare')),
  ...Array.from({ length: 3 }, (_, i) => carta(`E${i}`, 'Epic')),
  ...Array.from({ length: 6 }, (_, i) => carta(`S${i}`, 'Rare', { alt: true })),
  carta('T1', 'Common', { supertype: 'Token' }),
  carta('X1', 'Common', { set: 'SFD' }),
];

/** Azar determinista: devuelve los valores dados en orden y luego 0. */
const secuencia = (valores: number[]) => {
  let i = 0;
  return () => valores[i++] ?? 0;
};

describe('sobres', () => {
  it('un sobre trae 14 cartas: 7 comunes, 3 infrecuentes y 4 raras o mejores, sin fichas ni otros sets', () => {
    const s = abrirSobre('OGN', CATALOGO, () => 0.5)!;
    expect(s.cartas).toHaveLength(14);
    const cuenta = (z: string) => s.cartas.filter((c) => c.rarity === z && !c.alt).length;
    // Con azar 0,5 el hueco foil sale infrecuente: 7 comunes y 3 + 1 infrecuentes.
    expect(cuenta('Common')).toBe(7);
    expect(cuenta('Uncommon')).toBe(4);
    expect(s.cartas.every((c) => c.set === 'OGN' && !c.supertype)).toBe(true);
    expect(
      s.cartas.filter((c) => ['Rare', 'Epic'].includes(c.rarity) || c.alt).length,
    ).toBeGreaterThanOrEqual(3);
    expect(new Set(s.cartas.map((c) => c.cardId)).size).toBe(14);
  });

  it('el sobre dorado trae todo Showcase y el hueco especial puede dar Showcase', () => {
    const dorado = abrirSobre('OGN', CATALOGO, secuencia([0.001]))!;
    expect(dorado.dorado).toBe(true);
    expect(dorado.cartas.every((c) => c.alt)).toBe(true);
    // Primer azar: dorado no (0.9). Luego 7+3 elecciones, 2 raras (0.5 → no épica), especial 0.1 → Showcase.
    const vals = [0.9, ...Array(10).fill(0.3), 0.5, 0.3, 0.5, 0.3, 0.1, 0.3, 0.5, 0.3];
    const s = abrirSobre('OGN', CATALOGO, secuencia(vals))!;
    expect(s.cartas.some((c) => c.alt)).toBe(true);
  });

  it('sin cartas del set no hay sobre', () => {
    expect(abrirSobre('ZZZ', CATALOGO)).toBeNull();
  });

  it('las aperturas se recargan una cada 12 h hasta el máximo', () => {
    const t0 = new Date('2026-01-01T00:00:00Z');
    let a = consumir(albumVacio(t0).aperturas, t0)!;
    expect(a.restantes).toBe(MAX_APERTURAS - 1);
    a = consumir(a, t0)!;
    expect(a.restantes).toBe(0);
    expect(consumir(a, t0)).toBeNull();
    expect(faltaParaSiguiente(a, t0)).toBe(RECARGA_MS);
    const t1 = new Date(t0.getTime() + RECARGA_MS + 1000);
    expect(recargar(a, t1).restantes).toBe(1);
    const t2 = new Date(t0.getTime() + 5 * RECARGA_MS);
    expect(recargar(a, t2).restantes).toBe(MAX_APERTURAS);
    expect(faltaParaSiguiente(a, t2)).toBe(0);
  });

  it('el álbum suma copias y el progreso cuenta cartas distintas por rareza', () => {
    const s = abrirSobre('OGN', CATALOGO, () => 0.5)!;
    let album = guardarEnAlbum(albumVacio(), s);
    album = guardarEnAlbum(album, s);
    expect(album.abiertos).toBe(2);
    expect(Object.values(album.cartas).every((n) => n === 2)).toBe(true);
    const p = progreso('OGN', album, CATALOGO);
    expect(p.total).toBe(29);
    expect(p.tengo).toBe(Object.keys(album.cartas).length);
    expect(p.porRareza.Common.total).toBe(10);
  });
});
