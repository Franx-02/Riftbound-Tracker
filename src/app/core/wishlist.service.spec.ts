import { TestBed } from '@angular/core/testing';
import { AuthService } from './auth.service';
import { CardQty } from './collection.service';
import { DEMO } from './demo';
import { WishlistService, faltan, quienTiene } from './wishlist.service';

/** Sobre el almacén del modo demo, como los de CollectionService. */
describe('WishlistService (modo demo)', () => {
  let auth: AuthService;
  let wish: WishlistService;

  beforeEach(async () => {
    localStorage.clear();
    sessionStorage.clear();
    TestBed.configureTestingModule({});
    auth = TestBed.inject(AuthService);
    wish = TestBed.inject(WishlistService);
    await auth.signIn();
    await wish.load();
  });

  it('el modo demo está activo (si no, estos tests no prueban nada)', () => {
    expect(DEMO).toBe(true);
  });

  it('añadir pone 1 copia y no pisa una entrada que ya existe', async () => {
    wish.add('ogn-001');
    wish.adjust('OGN-001', 2);
    wish.add('OGN-001');
    await wish.flush();
    expect(wish.get('OGN-001')).toEqual({ qty: 3 });
  });

  it('bajar a 0 la quita de la lista', async () => {
    wish.add('OGN-001');
    wish.adjust('OGN-001', -1);
    await wish.flush();
    expect(wish.entries().size).toBe(0);
  });

  it('la nota se recorta y vacía se borra', async () => {
    wish.add('OGN-001');
    wish.setNota('OGN-001', '  en foil  ');
    await wish.flush();
    expect(wish.get('OGN-001')).toEqual({ qty: 1, nota: 'en foil' });
    wish.setNota('OGN-001', '   ');
    await wish.flush();
    expect(wish.get('OGN-001')).toEqual({ qty: 1 });
  });

  it('guarda de verdad: otra instancia lo lee', async () => {
    wish.add('SFD-198');
    wish.adjust('SFD-198', 1);
    await wish.flush();

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    const auth2 = TestBed.inject(AuthService);
    const wish2 = TestBed.inject(WishlistService);
    await auth2.signIn();
    await wish2.load();
    expect(wish2.get('SFD-198')).toEqual({ qty: 2 });
  });
});

describe('faltan y quienTiene', () => {
  it('resta lo que ya tienes, normales y foil, sin bajar de 0', () => {
    expect(faltan({ qty: 3 }, undefined)).toBe(3);
    expect(faltan({ qty: 3 }, { normal: 1, foil: 1 })).toBe(1);
    expect(faltan({ qty: 1 }, { normal: 2, foil: 0 })).toBe(0);
  });

  it('lista quién tiene cada carta, de más a menos copias, y omite a quien no tiene', () => {
    const c = (datos: Record<string, CardQty>) => new Map(Object.entries(datos));
    const res = quienTiene(
      ['OGN-001', 'OGN-002'],
      [
        { uid: 'a', nombre: 'Ana', cards: c({ 'OGN-001': { normal: 1, foil: 0 } }) },
        { uid: 'b', nombre: 'Bea', cards: c({ 'OGN-001': { normal: 2, foil: 1 } }) },
        { uid: 'c', nombre: 'Carlos', cards: c({ 'OGN-001': { normal: 0, foil: 0 } }) },
      ],
    );
    expect(res.get('OGN-001')!.map((p) => p.nombre)).toEqual(['Bea', 'Ana']);
    expect(res.get('OGN-002')).toEqual([]);
  });
});
