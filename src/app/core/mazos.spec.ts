import { TestBed } from '@angular/core/testing';
import { AuthService } from './auth.service';
import { CatalogCard } from './catalog.service';
import { Mazo, cartasDelMazo, esLegal, mazoVacio, nombreBase, validar } from './mazos';
import { MazosService } from './mazos.service';

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

const CARTAS = new Map(
  [
    carta({ cardId: 'LEY', name: 'Jinx, Loose Cannon', type: 'Legend', supertype: 'Champion', domains: ['Fury', 'Chaos'], tags: ['Jinx'] }),
    carta({ cardId: 'CAM', name: 'Jinx, Rebel', supertype: 'Champion', domains: ['Chaos'], tags: ['Jinx'] }),
    carta({ cardId: 'CAM-A', name: 'Jinx, Rebel (Alternate Art)', supertype: 'Champion', domains: ['Chaos'], tags: ['Jinx'] }),
    carta({ cardId: 'OTRO-CAM', name: 'Darius, Trifarian', supertype: 'Champion', domains: ['Fury'], tags: ['Darius'] }),
    carta({ cardId: 'SIG', name: 'Super Mega Death Rocket!', type: 'Spell', supertype: 'Signature', domains: ['Fury', 'Chaos'], tags: ['Jinx'] }),
    carta({ cardId: 'CALMA', name: 'Calm unit', domains: ['Calm'] }),
    carta({ cardId: 'GRIS', name: 'Gear', type: 'Gear', domains: ['Colorless'] }),
    carta({ cardId: 'RUNA-F', name: 'Fury Rune', type: 'Rune', supertype: 'Basic', domains: ['Fury'] }),
    carta({ cardId: 'RUNA-C', name: 'Chaos Rune', type: 'Rune', supertype: 'Basic', domains: ['Chaos'] }),
    ...[1, 2, 3].map((i) => carta({ cardId: `CAMPO-${i}`, name: `Battlefield ${i}`, type: 'Battlefield', domains: ['Colorless'] })),
    ...Array.from({ length: 13 }, (_, i) => carta({ cardId: `F${i}`, name: `Fury ${i}` })),
  ].map((c) => [c.cardId, c]),
);
const buscar = (id: string) => CARTAS.get(id);

/** Un mazo legal: Leyenda, Campeón, 39 en el principal, 12 runas y 3 campos. */
function mazoLegal(): Mazo {
  const principal: Record<string, number> = {};
  for (let i = 0; i < 13; i++) principal[`F${i}`] = 3;
  return {
    ...mazoVacio('m', 'Prueba'),
    leyenda: 'LEY',
    campeon: 'CAM',
    principal,
    runas: { 'RUNA-F': 6, 'RUNA-C': 6 },
    campos: ['CAMPO-1', 'CAMPO-2', 'CAMPO-3'],
  };
}

const fallos = (m: Mazo) =>
  validar(m, buscar)
    .filter((c) => !c.ok && !c.aviso)
    .map((c) => c.texto);

describe('reglas de construcción de mazos', () => {
  it('un mazo completo es legal', () => {
    expect(fallos(mazoLegal())).toEqual([]);
    expect(esLegal(validar(mazoLegal(), buscar))).toBe(true);
  });

  it('el principal necesita 40 cartas contando el Campeón', () => {
    const m = mazoLegal();
    m.principal = { ...m.principal, F0: 2 };
    expect(fallos(m).join()).toContain('al menos 40');
  });

  it('el Campeón tiene que ser de la Leyenda', () => {
    expect(fallos({ ...mazoLegal(), campeon: 'OTRO-CAM' }).join()).toContain('Campeón elegido');
  });

  it('cuenta las variantes de arte y el Campeón para el límite de 3 copias', () => {
    const m = mazoLegal();
    m.principal = { ...m.principal, 'CAM-A': 3 };
    expect(fallos(m).join()).toContain('Jinx, Rebel');
    expect(nombreBase('Jinx, Rebel (Alternate Art)')).toBe('Jinx, Rebel');
  });

  it('no deja cartas de otros dominios; las incoloras sí', () => {
    expect(fallos({ ...mazoLegal(), principal: { ...mazoLegal().principal, CALMA: 1 } }).join()).toContain(
      'dominios',
    );
    expect(fallos({ ...mazoLegal(), principal: { ...mazoLegal().principal, GRIS: 1 } })).toEqual([]);
  });

  it('máximo 3 Signature', () => {
    const m = mazoLegal();
    m.principal = { ...m.principal, SIG: 4 };
    expect(fallos(m).join()).toContain('Signature');
  });

  it('12 runas y 3 campos distintos', () => {
    expect(fallos({ ...mazoLegal(), runas: { 'RUNA-F': 11 } }).join()).toContain('runas');
    expect(fallos({ ...mazoLegal(), campos: ['CAMPO-1', 'CAMPO-1', 'CAMPO-2'] }).join()).toContain(
      'campos',
    );
  });

  it('el banquillo raro solo avisa', () => {
    const m = { ...mazoLegal(), banquillo: { F0: 1 } };
    expect(esLegal(validar(m, buscar))).toBe(true);
  });

  it('cartasDelMazo suma todas las zonas sin el banquillo', () => {
    const total = [...cartasDelMazo({ ...mazoLegal(), banquillo: { GRIS: 2 } }).values()].reduce(
      (a, b) => a + b,
    );
    expect(total).toBe(1 + 1 + 39 + 12 + 3);
  });
});

describe('MazosService (modo demo)', () => {
  beforeEach(async () => {
    localStorage.clear();
    sessionStorage.clear();
    TestBed.configureTestingModule({});
    await TestBed.inject(AuthService).signIn();
  });

  it('crea, guarda, relee y borra', async () => {
    const mazos = TestBed.inject(MazosService);
    await mazos.load();
    const id = mazos.crear('Jinx aggro');
    mazos.guardar({ ...mazos.mazo(id)!, leyenda: 'OGN-251', principal: { 'OGN-001': 2 } });
    await mazos.flush();

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    await TestBed.inject(AuthService).signIn();
    const otra = TestBed.inject(MazosService);
    await otra.load();
    expect(otra.mazo(id)).toMatchObject({ nombre: 'Jinx aggro', leyenda: 'OGN-251', principal: { 'OGN-001': 2 } });

    otra.borrar(id);
    await otra.flush();
    expect(otra.mazos()).toEqual([]);
  });
});
