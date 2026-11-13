import { TestBed } from '@angular/core/testing';
import { AuthService } from './auth.service';
import { BoteService } from './bote.service';
import { DEMO } from './demo';

/** Sobre el almacén del modo demo, como los demás servicios con datos del usuario. */
describe('BoteService (modo demo)', () => {
  let auth: AuthService;
  let bote: BoteService;

  beforeEach(async () => {
    localStorage.clear();
    sessionStorage.clear();
    TestBed.configureTestingModule({});
    auth = TestBed.inject(AuthService);
    bote = TestBed.inject(BoteService);
    await auth.signIn();
    await bote.load();
  });

  it('el modo demo está activo (si no, estos tests no prueban nada)', () => {
    expect(DEMO).toBe(true);
  });

  it('empieza con 100 € al mes desde el mes actual y sin movimientos', () => {
    expect(bote.listo()).toBe(true);
    expect(bote.bote().aportacion).toBe(100);
    expect(bote.bote().inicio).toMatch(/^\d{4}-\d{2}$/);
    expect(bote.bote().movimientos).toEqual([]);
  });

  it('guarda de verdad: otra instancia lee la configuración y los movimientos', async () => {
    bote.configurar(50, '2026-12');
    bote.guardarMovimiento({
      id: 'a',
      fecha: '2026-12-10',
      tipo: 'gasto',
      categoria: 'sellado',
      concepto: 'Sobres',
      importe: 7,
    });
    await bote.flush();

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    const auth2 = TestBed.inject(AuthService);
    const bote2 = TestBed.inject(BoteService);
    await auth2.signIn();
    await bote2.load();
    expect(bote2.bote().aportacion).toBe(50);
    expect(bote2.bote().inicio).toBe('2026-12');
    expect(bote2.bote().movimientos).toHaveLength(1);
    expect(bote2.bote().movimientos[0].concepto).toBe('Sobres');
  });

  it('edita y borra por id', async () => {
    const m = {
      id: 'a',
      fecha: '2026-12-10',
      tipo: 'gasto' as const,
      categoria: 'cartas' as const,
      concepto: 'Carta',
      importe: 7,
    };
    bote.guardarMovimiento(m);
    bote.guardarMovimiento({ ...m, importe: 9 });
    await bote.flush();
    expect(bote.bote().movimientos).toHaveLength(1);
    expect(bote.bote().movimientos[0].importe).toBe(9);
    bote.borrarMovimiento('a');
    await bote.flush();
    expect(bote.bote().movimientos).toEqual([]);
  });

  it('ignora basura guardada sin romper', async () => {
    localStorage.setItem(
      'riftbound-demo-bote-demo',
      JSON.stringify({
        aportacion: 'mucho',
        inicio: '2026-13',
        movimientos: [{ id: 'x', fecha: '2026-02-30', tipo: 'gasto', importe: 1 }, 5, null],
      }),
    );
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    const auth2 = TestBed.inject(AuthService);
    const bote2 = TestBed.inject(BoteService);
    await auth2.signIn();
    await bote2.load();
    expect(bote2.bote().aportacion).toBe(100);
    expect(bote2.bote().movimientos).toEqual([]);
  });
});
