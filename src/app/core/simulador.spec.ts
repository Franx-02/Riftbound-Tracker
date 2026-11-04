import { mazoVacio } from './mazos';
import {
  PUNTOS_PARA_GANAR,
  alternarAgotada,
  mover,
  mulligan,
  nuevaPartida,
  pagar,
  resolverCombate,
  rival,
  siguienteTurno,
  terminarTurno,
} from './simulador';

function mazo() {
  const m = mazoVacio('x', 'Prueba');
  m.campeon = 'C';
  m.principal = { A: 3, B: 3, D: 3, E: 3, F: 3, G: 3, H: 3, I: 3, J: 3, K: 3, L: 3, M: 3, N: 3 };
  m.runas = { R: 12 };
  m.campos = ['X', 'Y', 'Z'];
  return m;
}

describe('simulador', () => {
  it('empieza con 4 en mano, el campeón aparte y 2 campos en juego', () => {
    const p = nuevaPartida(mazo());
    expect(p.mano.length).toBe(4);
    expect(p.mazo.length).toBe(35);
    expect(p.campeon.map((c) => c.id)).toEqual(['C']);
    expect(p.campos.map((c) => c.id)).toEqual(['X', 'Y']);
    expect(p.camposReserva).toEqual(['Z']);
    expect(p.fase).toBe('mulligan');
  });

  it('el mulligan devuelve al fondo, roba otras tantas y arranca el turno 1 sin robar', () => {
    const p = nuevaPartida(mazo(), { empiezoYo: true });
    const fuera = p.mano.slice(0, 2).map((c) => c.uid);
    const s = mulligan(p, fuera);
    expect(s.turno).toBe(1);
    expect(s.fase).toBe('accion');
    expect(s.mano.length).toBe(4); // sin robo del turno 1
    expect(s.runas.length).toBe(2);
    expect(s.mazo.slice(-2).map((c) => c.uid)).toEqual(fuera);
  });

  it('si empieza el rival, robas en el turno 1', () => {
    const s = mulligan(nuevaPartida(mazo(), { empiezoYo: false }), []);
    expect(s.mano.length).toBe(5);
  });

  it('jugar desde la mano paga energía agotando runas y poder reciclándolas', () => {
    let p = mulligan(nuevaPartida(mazo()), []);
    p = siguienteTurno(p); // 4 runas
    const uid = p.mano[0].uid;
    p = mover(p, uid, 'base', { name: 'Carta', energy: 2, power: 1 });
    expect(p.base.length).toBe(1);
    expect(p.runas.length).toBe(3);
    expect(p.runas.filter((r) => r.agotada).length).toBe(2);
    expect(p.mazoRunas.length).toBe(12 - 4 + 1);
    // Sin runas suficientes no se juega y avisa.
    const antes = p;
    p = mover(p, p.mano[0].uid, 'base', { name: 'Cara', energy: 5, power: 0 });
    expect(p.base.length).toBe(1);
    expect(p.aviso).toContain('No puedes pagar');
    expect(p.mano.length).toBe(antes.mano.length);
  });

  it('conquistar un campo vacío da 1 punto y Hold puntúa al despertar', () => {
    let p = mulligan(nuevaPartida(mazo(), { pagarCostes: false }), []);
    const uid = p.mano[0].uid;
    p = mover(p, uid, 'campo0');
    expect(p.campos[0].control).toBe('yo');
    expect(p.puntos).toBe(1);
    p = terminarTurno(p);
    expect(p.puntos).toBe(2);
  });

  it('el último punto no puede ser por Hold', () => {
    let p = mulligan(nuevaPartida(mazo(), { pagarCostes: false }), []);
    p = mover(p, p.mano[0].uid, 'campo0');
    p = { ...p, puntos: PUNTOS_PARA_GANAR - 1 };
    p = terminarTurno(p);
    expect(p.puntos).toBe(PUNTOS_PARA_GANAR - 1);
    p = mover(p, p.mano[0].uid, 'campo1');
    expect(p.puntos).toBe(PUNTOS_PARA_GANAR);
  });

  it('con rival en el campo hay combate y lo resuelve el jugador', () => {
    let p = mulligan(nuevaPartida(mazo(), { pagarCostes: false }), []);
    p = rival(p, 1, 2);
    expect(p.campos[1].control).toBe('rival');
    expect(p.puntosRival).toBe(1);
    p = mover(p, p.mano[0].uid, 'campo1');
    expect(p.puntos).toBe(0);
    const perdido = resolverCombate(p, 1, false);
    expect(perdido.cementerio.length).toBe(1);
    const ganado = resolverCombate(p, 1, true);
    expect(ganado.campos[1].rival).toBe(0);
    expect(ganado.campos[1].control).toBe('yo');
    expect(ganado.puntos).toBe(1);
  });

  it('agota y prepara cartas en juego', () => {
    let p = mulligan(nuevaPartida(mazo()), []);
    p = alternarAgotada(p, p.runas[0].uid);
    expect(p.runas[0].agotada).toBe(true);
    expect(pagar(p, 2, 0)).toBeNull();
    p = siguienteTurno(p);
    expect(p.runas.every((r) => !r.agotada)).toBe(true);
  });
});
