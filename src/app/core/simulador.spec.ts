import { mazoVacio } from './mazos';
import {
  alternarAgotada,
  canalizar,
  mover,
  mulligan,
  nuevaPartida,
  siguienteTurno,
} from './simulador';

function mazo() {
  const m = mazoVacio('x', 'Prueba');
  m.campeon = 'C';
  m.principal = { A: 3, B: 3, D: 3, E: 3, F: 3, G: 3, H: 3, I: 3, J: 3, K: 3, L: 3, M: 3, N: 3 };
  m.runas = { R: 12 };
  return m;
}

describe('simulador', () => {
  it('empieza con 4 en mano y el campeón aparte', () => {
    const p = nuevaPartida(mazo());
    expect(p.mano.length).toBe(4);
    expect(p.mazo.length).toBe(35);
    expect(p.campeon.map((c) => c.id)).toEqual(['C']);
    expect(p.inicio).toBe(true);
  });

  it('el mulligan devuelve hasta 2 al fondo y roba otras tantas', () => {
    const p = nuevaPartida(mazo());
    const fuera = p.mano.slice(0, 3).map((c) => c.uid);
    const s = mulligan(p, fuera);
    expect(s.mano.length).toBe(4);
    expect(s.mazo.length).toBe(35);
    expect(s.mazo.slice(-2).map((c) => c.uid)).toEqual(fuera.slice(0, 2));
    expect(s.inicio).toBe(false);
    expect(mulligan(s, [s.mano[0].uid])).toBe(s);
  });

  it('cada turno prepara, roba 1 y canaliza 2', () => {
    let p = nuevaPartida(mazo());
    p = canalizar(p);
    p = alternarAgotada(p, p.runas[0].uid);
    expect(p.runas[0].agotada).toBe(true);
    p = siguienteTurno(p);
    expect(p.turno).toBe(1);
    expect(p.mano.length).toBe(5);
    expect(p.runas.length).toBe(4);
    expect(p.runas.every((r) => !r.agotada)).toBe(true);
  });

  it('mueve cartas entre zonas', () => {
    let p = nuevaPartida(mazo());
    const uid = p.mano[0].uid;
    p = mover(p, uid, 'base');
    expect(p.base.map((c) => c.uid)).toEqual([uid]);
    p = mover(p, uid, 'cementerio');
    expect(p.base).toEqual([]);
    expect(p.cementerio.length).toBe(1);
    expect(p.mano.length).toBe(3);
  });
});
