import { CatalogLookup, exportDotgg, importCsv, parseCsv } from './csv';

const CARTAS = [
  { cardId: 'OGN-001', name: 'Blazing Scorcher', setName: 'Origins' },
  { cardId: 'OGN-089', name: 'Mind Rune', setName: 'Origins' },
  { cardId: 'OGN-089A', name: 'Mind Rune (Alternate Art)', setName: 'Origins' },
  { cardId: 'OGS-004', name: 'Master Yi, Meditative', setName: 'Origins: Proving Grounds' },
  {
    cardId: 'OPP-004',
    name: 'Master Yi, Meditative',
    setName: 'Riftbound Organized Play Promotional Cards',
  },
  { cardId: 'OPP-089B', name: 'Mind Rune', setName: 'Riftbound Organized Play Promotional Cards' },
];
const porId = new Map(CARTAS.map((c) => [c.cardId, c]));
const catalogo: CatalogLookup = { card: (id) => porId.get(id.toUpperCase()) };

describe('parseCsv', () => {
  it('entiende comillas, comillas dobladas, comas dentro de campos, CRLF y BOM', () => {
    const texto = '﻿a,b,c\r\n"x, y","dice ""hola""",3\r\n\r\n';
    expect(parseCsv(texto)).toEqual([
      ['a', 'b', 'c'],
      ['x, y', 'dice "hola"', '3'],
    ]);
  });

  it('acepta punto y coma, que es lo que guarda Excel en España', () => {
    expect(parseCsv('CardId;Normal;Foil\nOGN-001;2;0')).toEqual([
      ['CardId', 'Normal', 'Foil'],
      ['OGN-001', '2', '0'],
    ]);
  });
});

describe('importCsv (DotGG)', () => {
  it('importa, normaliza mayúsculas y suma las filas repetidas', () => {
    const r = importCsv(
      'CardId,Normal,Foil,Name,Set\n"OGN-001",1,0,"Blazing Scorcher","Origins"\nogn-089a,0,1\nOGN-001,2,1',
      catalogo,
    );
    expect(r.format).toBe('dotgg');
    expect(r.cards.get('OGN-001')).toEqual({ normal: 3, foil: 1 });
    expect(r.cards.get('OGN-089A')).toEqual({ normal: 0, foil: 1 });
    expect(r.copies).toBe(5);
    expect(r.rejected).toEqual([]);
  });

  it('enlaza las promos de Nexus Night con su carta del set de promos y recuerda el id original', () => {
    const r = importCsv(
      'CardId,Normal,Foil,Name\n' +
        'OGN-089b,1,0,"Mind Rune (Origins Nexus Night Promo)"\n' +
        'OGS-004-P,2,0,"Master Yi - Meditative (Spiritforged Nexus Night Promo)"',
      catalogo,
    );
    expect(r.cards.get('OPP-089B')).toEqual({ normal: 1, foil: 0, alias: 'OGN-089B' });
    expect(r.cards.get('OPP-004')).toEqual({ normal: 2, foil: 0, alias: 'OGS-004-P' });
    expect(r.aliased.map((a) => `${a.from}→${a.to}`)).toEqual([
      'OGN-089B→OPP-089B',
      'OGS-004-P→OPP-004',
    ]);
  });

  it('no enlaza si el nombre no coincide: dos cartas distintas no se mezclan', () => {
    const r = importCsv('CardId,Normal,Foil,Name\nOGS-004-P,1,0,"Otra Carta (Promo)"', catalogo);
    expect(r.cards.get('OGS-004-P')).toEqual({ normal: 1, foil: 0 });
    expect(r.aliased).toEqual([]);
    expect(r.outsideCatalog.map((o) => o.cardId)).toEqual(['OGS-004-P']);
  });

  it('guarda igual las cartas que no están en el catálogo (tokens) y lo avisa', () => {
    const r = importCsv('CardId,Normal,Foil,Name\nSFD-T01,2,0,"Mech // Buff"', catalogo);
    expect(r.cards.get('SFD-T01')).toEqual({ normal: 2, foil: 0 });
    expect(r.outsideCatalog).toEqual([
      { line: 2, original: 'SFD-T01,2,0,Mech // Buff', cardId: 'SFD-T01' },
    ]);
  });

  it('rechaza códigos y cantidades no válidos, con línea y motivo, y se salta las filas a cero', () => {
    const r = importCsv(
      'CardId,Normal,Foil\nOGN-001,dos,0\n<script>,1,0\n,1,0\nOGN-089,0,0\nOGN-089,-1,0\nOGN-089,99999,0',
      catalogo,
    );
    expect(r.cards.size).toBe(0);
    expect(r.rejected.map((x) => [x.line, x.reason.split(':')[0].split(' (')[0]])).toEqual([
      [2, 'Cantidad no válida'],
      [3, 'Código de carta no válido'],
      [4, 'Sin código de carta'],
      [6, 'Cantidad no válida'],
      [7, 'Cantidad no válida'],
    ]);
  });

  it('avisa de una cabecera que no es de ningún formato conocido', () => {
    const r = importCsv('Nombre,Cantidad\nJinx,2', catalogo);
    expect(r.format).toBeNull();
    expect(r.rejected[0].reason).toContain('Cabecera no reconocida');
  });
});

describe('importCsv (Legacy)', () => {
  it('lee Normal Count, Foil Count, Card ID', () => {
    const r = importCsv('Normal Count,Foil Count,Card ID\n2,1,OGN-001', catalogo);
    expect(r.format).toBe('legacy');
    expect(r.cards.get('OGN-001')).toEqual({ normal: 2, foil: 1 });
  });
});

describe('exportDotgg', () => {
  it('escribe el formato DotGG, con el id original de las enlazadas y los nombres a su estilo', () => {
    const csv = exportDotgg(
      new Map([
        ['OPP-004', { normal: 2, foil: 0, alias: 'OGS-004-P' }],
        ['OGN-001', { normal: 1, foil: 1 }],
        ['SFD-T01', { normal: 2, foil: 0 }],
        ['OGN-089', { normal: 0, foil: 0 }], // a cero no sale
      ]),
      catalogo,
    );
    expect(csv.split('\r\n')).toEqual([
      'CardId,Normal,Foil,Name,Set',
      'OGN-001,1,1,Blazing Scorcher,Origins',
      'OGS-004-P,2,0,Master Yi - Meditative,Riftbound Organized Play Promotional Cards',
      'SFD-T01,2,0,,',
      '',
    ]);
  });

  it('ida y vuelta: lo exportado se vuelve a importar igual', () => {
    const original =
      'CardId,Normal,Foil,Name\nOGN-001,1,0,Blazing Scorcher\nOGN-089b,1,0,"Mind Rune (Promo)"\nSFD-T01,2,0,Token';
    const primera = importCsv(original, catalogo);
    const segunda = importCsv(exportDotgg(primera.cards, catalogo), catalogo);
    expect(segunda.cards).toEqual(primera.cards);
  });
});
