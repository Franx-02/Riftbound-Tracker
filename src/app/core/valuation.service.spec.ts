import { computed } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AuthService } from './auth.service';
import { CatalogService } from './catalog.service';
import { MappingOverridesService } from './mapping-overrides.service';
import { PricesService } from './prices.service';
import { ValuationService } from './valuation.service';

/** Tres cartas: una con precio, una sin precio normal y un token sin producto. */
const CATALOGO = {
  generado: '2026-10-24',
  fuente: 'test',
  sets: [{ id: 'RAD', name: 'Radiance', count: 3, released: '2026-10-23' }],
  cards: [
    {
      cardId: 'RAD-001',
      name: 'Con Precio',
      set: 'RAD',
      rarity: 'Common',
      type: 'Unit',
      domains: [],
    },
    {
      cardId: 'RAD-002',
      name: 'Sin Normal',
      set: 'RAD',
      rarity: 'Rare',
      type: 'Unit',
      domains: [],
    },
    { cardId: 'RAD-T01', name: 'Token', set: 'RAD', rarity: 'Common', type: 'Unit', domains: [] },
  ],
};

const MAPEO = {
  generado: '2026-10-24',
  cardmarketCreatedAt: '2026-10-24',
  mapping: {
    'RAD-001': { idProduct: 1, confianza: 'alta', motivo: '', candidatos: [1, 9] },
    'RAD-002': { idProduct: 2, confianza: 'baja', motivo: '', candidatos: [2] },
    'RAD-T01': { idProduct: null, confianza: 'sin-mapear', motivo: '', candidatos: [] },
  },
  productos: { 1: 6659, 2: 6659, 9: 6921 },
  expansiones: { 6659: 'RAD', 6921: null },
};

const PRECIOS = {
  updatedAt: '2026-10-24',
  prices: {
    1: { trend: 2, low: 1, avg7: 2, trendFoil: 10, lowFoil: 8 },
    2: { trend: null, low: null, avg7: null, trendFoil: 5, lowFoil: 4 },
    9: { trend: 50, low: 40, avg7: 50, trendFoil: 100, lowFoil: 90 },
  },
};

function simularFetch(): void {
  const respuestas: Record<string, unknown> = {
    '/data/catalog.json': CATALOGO,
    '/data/mapping.json': MAPEO,
    '/api/prices': PRECIOS,
  };
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => ({
      ok: url in respuestas,
      status: 200,
      json: async () => respuestas[url],
    })),
  );
}

describe('CatalogService', () => {
  beforeEach(() => {
    simularFetch();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
  });
  afterEach(() => vi.unstubAllGlobals());

  // Regresión: filter() y card() leían campos normales y un computed creado antes de
  // la carga se quedaba vacío para siempre (el catálogo enseñaba "0 cartas").
  it('un computed creado antes de cargar se actualiza cuando llegan los datos', async () => {
    const catalog = TestBed.inject(CatalogService);
    const filtradas = computed(() => catalog.filter({}).length);
    const carta = computed(() => catalog.card('rad-001')?.name);
    expect(filtradas()).toBe(0);
    expect(carta()).toBeUndefined();

    await catalog.load();

    expect(filtradas()).toBe(3);
    expect(carta()).toBe('Con Precio');
  });

  it('etiqueta los candidatos con su set, o promos si la expansión no es de ninguno', async () => {
    const catalog = TestBed.inject(CatalogService);
    await catalog.load();
    expect(catalog.candidates('RAD-001')).toEqual([
      { idProduct: 1, idExpansion: 6659, set: 'RAD' },
      { idProduct: 9, idExpansion: 6921, set: null },
    ]);
    expect(catalog.setName(null)).toBe('Promos y extras');
  });
});

describe('ValuationService', () => {
  let valuation: ValuationService;

  beforeEach(async () => {
    simularFetch();
    localStorage.clear();
    sessionStorage.clear();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    await TestBed.inject(AuthService).signIn();
    await TestBed.inject(CatalogService).load();
    await TestBed.inject(PricesService).load();
    await TestBed.inject(MappingOverridesService).load();
    valuation = TestBed.inject(ValuationService);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('suma solo lo que tiene precio y aparta lo demás sin contarlo como 0 €', () => {
    const v = valuation.value(
      new Map([
        ['RAD-001', { normal: 2, foil: 1 }], // 2·2 + 1·10 = 14
        ['RAD-002', { normal: 3, foil: 1 }], // normal sin precio; foil 5
        ['RAD-T01', { normal: 4, foil: 0 }], // sin producto
        ['OGS-004-P', { normal: 1, foil: 0 }], // no está en el catálogo
      ]),
    );
    expect(v.total).toBe(19);
    expect(v.copiasValoradas).toBe(4);
    expect(v.sinPrecio).toEqual([
      { cardId: 'RAD-002', finish: 'normal', copias: 3 },
      { cardId: 'RAD-T01', finish: 'normal', copias: 4 },
    ]);
    expect(v.copiasSinPrecio).toBe(7);
    expect(v.fueraDeCatalogo).toEqual(['OGS-004-P']);
  });

  it('una corrección manual manda sobre el mapeo y cuenta como fiable', async () => {
    expect(valuation.pricing('RAD-001').normal).toBe(2);

    await TestBed.inject(MappingOverridesService).set('rad-001', 9);

    const p = valuation.pricing('RAD-001');
    expect(p.idProduct).toBe(9);
    expect(p.normal).toBe(50);
    expect(p.corregido).toBe(true);
    expect(p.confianza).toBe('alta');
    expect(p.motivo).toBe('Corregido a mano por Fran (demo)');

    await TestBed.inject(MappingOverridesService).clear('RAD-001');
    expect(valuation.pricing('RAD-001').idProduct).toBe(1);
  });
});
