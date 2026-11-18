import { CatalogCard } from './catalog.service';
import { importarMazo } from './importar-mazo';

function carta(parcial: Partial<CatalogCard> & { cardId: string }): CatalogCard {
  return {
    riftboundId: parcial.cardId.toLowerCase(),
    name: parcial.cardId,
    num: 1,
    set: 'OGN',
    setName: 'Origins',
    type: 'Unit',
    supertype: null,
    rarity: 'Common',
    domains: ['Fury'],
    energy: 2,
    might: 2,
    power: null,
    text: '',
    flavour: null,
    tags: [],
    artist: null,
    imgUrl: '',
    orientation: 'portrait',
    alt: false,
    signature: false,
    overnumbered: false,
    ...parcial,
  };
}

const CATALOGO = [
  carta({ cardId: 'OGN-001', name: 'Jinx, Loose Cannon', type: 'Legend', tags: ['Jinx'] }),
  carta({ cardId: 'OGN-002', name: 'Jinx, Rebel', supertype: 'Champion', tags: ['Jinx'] }),
  carta({
    cardId: 'OGN-002A',
    name: 'Jinx, Rebel',
    supertype: 'Champion',
    tags: ['Jinx'],
    alt: true,
  }),
  carta({ cardId: 'OGN-003', name: 'Brawl', type: 'Spell' }),
  carta({ cardId: 'OGN-004', name: 'Fury Rune', type: 'Rune' }),
  carta({ cardId: 'OGN-005', name: 'Zaun Warrens', type: 'Battlefield' }),
  carta({ cardId: 'OGN-006', name: "Kai'Sa, Survivor", type: 'Unit' }),
  // Promos que repiten nombre: en el catálogo real van ANTES que los sets normales.
  carta({ cardId: 'JDG-007', name: 'Heimerdinger, Inventor', set: 'JDG', setName: 'Judge Promos' }),
  carta({ cardId: 'OGN-007', name: 'Heimerdinger, Inventor' }),
  carta({ cardId: 'PR-007A', name: 'Heimerdinger, Inventor', set: 'PR', setName: 'Promotional Cards' }),
  carta({ cardId: 'SFD-R01', name: 'Fury Rune', type: 'Rune', set: 'SFD', setName: 'Spiritforged' }),
].sort((a, b) => a.cardId.localeCompare(b.cardId));

describe('importarMazo', () => {
  it('lee el formato que exporta la app, con secciones y códigos', () => {
    const texto = `# Jinx aggro

Legend:
1 Jinx, Loose Cannon (OGN-001)

Champion:
1 Jinx, Rebel (OGN-002A)

Main Deck:
2 Jinx, Rebel (OGN-002)
3 Brawl (OGN-003)

Runes:
12 Fury Rune (OGN-004)

Battlefields:
1 Zaun Warrens (OGN-005)

Sideboard:
2 Brawl (OGN-003)`;
    const r = importarMazo(texto, CATALOGO, 'x');
    expect(r.noEncontradas).toEqual([]);
    expect(r.mazo.nombre).toBe('Jinx aggro');
    expect(r.mazo.leyenda).toBe('OGN-001');
    expect(r.mazo.campeon).toBe('OGN-002A');
    expect(r.mazo.principal).toEqual({ 'OGN-002': 2, 'OGN-003': 3 });
    expect(r.mazo.runas).toEqual({ 'OGN-004': 12 });
    expect(r.mazo.campos).toEqual(['OGN-005']);
    expect(r.mazo.banquillo).toEqual({ 'OGN-003': 2 });
  });

  it('sin secciones reparte por tipo, elige el Campeón y prefiere la impresión normal', () => {
    const texto = `1 Jinx, Loose Cannon
3x Jinx, Rebel
Brawl x2
kai'sa, survivor
12 Fury Rune
Zaun Warrens
2 Carta Inventada`;
    const r = importarMazo(texto, CATALOGO, 'x');
    expect(r.mazo.leyenda).toBe('OGN-001');
    expect(r.mazo.campeon).toBe('OGN-002');
    expect(r.mazo.principal).toEqual({ 'OGN-002': 2, 'OGN-003': 2, 'OGN-006': 1 });
    expect(r.mazo.runas).toEqual({ 'OGN-004': 12 });
    expect(r.mazo.campos).toEqual(['OGN-005']);
    expect(r.noEncontradas).toEqual(['2 Carta Inventada']);
  });

  it('por nombre elige la impresión del set normal, no la promo que va antes en el catálogo', () => {
    const r = importarMazo(`3 Heimerdinger, Inventor
12 Fury Rune`, CATALOGO, 'x');
    expect(r.mazo.principal).toEqual({ 'OGN-007': 3 });
    expect(r.mazo.runas).toEqual({ 'OGN-004': 12 });
  });

  it('lee el formato de Riftmana: "3xOGN-003" sin espacio ni nombre', () => {
    const r = importarMazo(`1xOGN-001
3xOGN-003
2xOGN-002
12xOGN-004
1xOGN-005`, CATALOGO, 'x');
    expect(r.noEncontradas).toEqual([]);
    expect(r.mazo.leyenda).toBe('OGN-001');
    expect(r.mazo.campeon).toBe('OGN-002');
    expect(r.mazo.principal).toEqual({ 'OGN-002': 1, 'OGN-003': 3 });
    expect(r.mazo.runas).toEqual({ 'OGN-004': 12 });
    expect(r.mazo.campos).toEqual(['OGN-005']);
  });

  it('admite cabecera y carta en la misma línea, códigos con corchetes o número de colección', () => {
    const texto = `Legend: 1 Jinx, Loose Cannon
Champion: Jinx, Rebel [OGN-002A]
Main Deck: 3 Brawl (OGN-003/298)
Battlefields: OGN-005 Zaun Warrens
Sideboard: 2 Brawl (Alternate Art)`;
    const r = importarMazo(texto, CATALOGO, 'x');
    expect(r.noEncontradas).toEqual([]);
    expect(r.mazo.leyenda).toBe('OGN-001');
    expect(r.mazo.campeon).toBe('OGN-002A');
    expect(r.mazo.principal).toEqual({ 'OGN-003': 3 });
    expect(r.mazo.campos).toEqual(['OGN-005']);
    expect(r.mazo.banquillo).toEqual({ 'OGN-003': 2 });
  });

  it('no toma por carta una "x" inicial del nombre', () => {
    const cat = [...CATALOGO, carta({ cardId: 'OGN-099', name: 'Xerath, Magus' })];
    expect(importarMazo('3 Xerath, Magus', cat, 'x').mazo.principal).toEqual({ 'OGN-099': 3 });
  });

  it('entiende cabeceras en español y con recuento', () => {
    const r = importarMazo('Banquillo (8):\n3 Brawl\nMazo principal 40\n1 Brawl', CATALOGO, 'x');
    expect(r.mazo.banquillo).toEqual({ 'OGN-003': 3 });
    expect(r.mazo.principal).toEqual({ 'OGN-003': 1 });
  });
});
