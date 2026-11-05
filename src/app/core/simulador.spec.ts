import { CatalogCard } from './catalog.service';
import { mazoVacio } from './mazos';
import {
  PUNTOS_PARA_GANAR,
  anadirEnergia,
  fijarPuntos,
  jugar,
  mover,
  mulligan,
  nuevaPartida,
  ocultar,
  palabrasClave,
  porQueNoJugar,
  porQueNoMover,
  resolverEnfrentamiento,
  resolverVision,
  rivalCrear,
  rivalMover,
  terminarTurno,
  terminarTurnoRival,
  validarMazo,
} from './simulador';

/** Catálogo de mentira: unidades de 2 de fuerza, algunas con palabras clave. */
const CARTAS: Record<string, Partial<CatalogCard>> = {
  L: { name: 'Leyenda', type: 'Legend', domains: ['Fury'], tags: ['Jinx'] },
  C: {
    name: 'Jinx',
    type: 'Unit',
    supertype: 'Champion',
    domains: ['Fury'],
    tags: ['Jinx'],
    energy: 2,
    power: 1,
    might: 3,
  },
  A: { name: 'Soldado', type: 'Unit', domains: ['Fury'], energy: 1, power: 0, might: 2 },
  B: {
    name: 'Gancho',
    type: 'Unit',
    domains: ['Fury'],
    energy: 2,
    power: 1,
    might: 2,
    text: '[Ganking]',
  },
  T: {
    name: 'Muro',
    type: 'Unit',
    domains: ['Fury'],
    energy: 1,
    power: 0,
    might: 1,
    text: '[Tank]',
  },
  V: {
    name: 'Vidente',
    type: 'Unit',
    domains: ['Fury'],
    energy: 1,
    power: 0,
    might: 1,
    text: '[Vision]',
  },
  X: {
    name: 'Rápida',
    type: 'Unit',
    domains: ['Fury'],
    energy: 1,
    power: 0,
    might: 2,
    text: '[Accelerate] [Assault 2]',
  },
  H: {
    name: 'Trampa',
    type: 'Spell',
    domains: ['Fury'],
    energy: 3,
    power: 0,
    text: '[Hidden] [Action] Deal 2.',
  },
  S: { name: 'Chispa', type: 'Spell', domains: ['Fury'], energy: 1, power: 0, text: 'Deal 1.' },
  R: { name: 'Fury Rune', type: 'Rune', domains: ['Fury'] },
  F1: { name: 'Campo A', type: 'Battlefield' },
  F2: { name: 'Campo B', type: 'Battlefield' },
  F3: { name: 'Campo C', type: 'Battlefield' },
};
const carta = (id: string) =>
  CARTAS[id]
    ? ({ cardId: id, domains: [], tags: [], text: '', ...CARTAS[id] } as CatalogCard)
    : undefined;

function mazo() {
  const m = mazoVacio('x', 'Prueba');
  m.leyenda = 'L';
  m.campeon = 'C';
  m.principal = { A: 3, B: 3, T: 3, V: 3, X: 3, H: 3, S: 3, C: 2 };
  // Relleno hasta 40 con más soldados (el motor no limita copias; validarMazo avisa).
  m.principal['A'] = 3 + (40 - 1 - 23);
  m.runas = { R: 12 };
  m.campos = ['F1', 'F2', 'F3'];
  return m;
}

/** Partida en mi fase principal del turno 1, con la mano que toque y 2 runas. */
function enJuego(empiezoYo = true) {
  return mulligan(
    nuevaPartida(mazo(), carta, { empiezoYo, campoRival: 'F3' }, () => 0.5),
    [],
  );
}

/** Pone una copia concreta en la mano para probar (sin pasar por el mazo). */
function conEnMano(p: ReturnType<typeof enJuego>, id: string) {
  const c = p.mazo.find((x) => x.id === id) ?? p.mano.find((x) => x.id === id)!;
  return {
    ...p,
    mazo: p.mazo.filter((x) => x.uid !== c.uid),
    mano: p.mano.some((x) => x.uid === c.uid) ? p.mano : [...p.mano, c],
  };
}

describe('simulador (Core Rules 1v1)', () => {
  it('empieza con 4 en mano, el campeón en su zona y un campo mío más el del rival', () => {
    const p = nuevaPartida(mazo(), carta, { campoRival: 'F3' });
    expect(p.mano).toHaveLength(4);
    expect(p.campeon[0].id).toBe('C');
    expect(p.campos[0].de).toBe('yo');
    expect(['F1', 'F2', 'F3']).toContain(p.campos[0].id);
    expect(p.campos[1]).toMatchObject({ de: 'rival', id: 'F3' });
    expect(p.mazoRunas).toHaveLength(12);
    expect(p.fase).toBe('mulligan');
  });

  it('el mulligan admite 2 cartas como máximo y recicla al fondo (CR 117)', () => {
    const p = nuevaPartida(mazo(), carta, { campoRival: 'F3' });
    const tres = p.mano.slice(0, 3).map((c) => c.uid);
    expect(mulligan(p, tres).aviso).toContain('hasta 2');
    const dos = p.mano.slice(0, 2);
    const s = mulligan(
      p,
      dos.map((c) => c.uid),
    );
    expect(s.fase).toBe('principal');
    expect(s.mazo.slice(-2).map((c) => c.uid)).toEqual(dos.map((c) => c.uid));
  });

  it('el primer jugador roba en su turno 1 y canaliza 2; el segundo canaliza 3 (CR 315, 485.7)', () => {
    const yo = enJuego(true);
    expect(yo.mano).toHaveLength(5);
    expect(yo.runas).toHaveLength(2);
    let seg = enJuego(false);
    expect(seg.fase).toBe('rival');
    seg = terminarTurnoRival(seg);
    expect(seg.turno).toBe(1);
    expect(seg.runas).toHaveLength(3);
    expect(seg.mano).toHaveLength(5);
  });

  it('las unidades entran agotadas y se pagan con runas; Accelerate cuesta 1 energía y 1 poder y entra preparada', () => {
    let p = conEnMano(enJuego(), 'A');
    const a = p.mano.find((c) => c.id === 'A')!;
    p = jugar(p, a.uid, 'base');
    expect(p.aviso).toBeNull();
    expect(p.base[0]).toMatchObject({ id: 'A', agotada: true });
    expect(p.runas.filter((r) => r.agotada)).toHaveLength(1);
    // Accelerate: 1⚡ + 1✦ extra; solo queda 1 runa preparada, así que no se puede.
    let q = conEnMano(enJuego(), 'X');
    const x = q.mano.find((c) => c.id === 'X')!;
    expect(porQueNoJugar(q, x, 'base', true)).toContain('No puedes pagar');
    q = anadirEnergia(q); // sin efecto en el total, solo mueve al pozo
    q = { ...q, runas: [...q.runas, { ...q.runas[0], uid: 999, agotada: false }] };
    q = jugar(q, x.uid, 'base', true);
    expect(q.aviso).toBeNull();
    expect(q.base[0]).toMatchObject({ id: 'X', agotada: false });
  });

  it('no deja jugar sin recursos ni fuera de la fase principal', () => {
    const p = conEnMano(enJuego(), 'C');
    const c = p.campeon[0];
    expect(porQueNoJugar(p, c, 'base')).toContain('No puedes pagar');
    const rival = terminarTurno(p);
    const a = rival.mano[0];
    expect(porQueNoJugar(rival, a, 'base')).toContain('turno del rival');
  });

  it('mover cuesta agotar, solo entre base y campo (Ganking entre campos), y conquistar da 1 punto', () => {
    let p = conEnMano(enJuego(), 'A');
    const a = p.mano.find((c) => c.id === 'A')!;
    p = jugar(p, a.uid, 'base');
    expect(porQueNoMover(p, [a.uid], 'campo0')).toContain('agotada');
    p = terminarTurnoRival(terminarTurno(p));
    p = mover(p, [a.uid], 'campo0');
    expect(p.enfrentamiento).toMatchObject({ tipo: 'conquista', atacante: 'yo' });
    expect(porQueNoMover(p, [a.uid], 'base')).toContain('enfrentamiento');
    p = resolverEnfrentamiento(p);
    expect(p.campos[0].control).toBe('yo');
    expect(p.puntos).toBe(1);
    expect(p.campos[0].unidades[0].agotada).toBe(true);
    // Sin Ganking no se va de campo a campo.
    p = terminarTurnoRival(terminarTurno(p));
    expect(p.puntos).toBe(2); // Hold al empezar el turno
    expect(porQueNoMover(p, [a.uid], 'campo1')).toContain('Ganking');
  });

  it('el combate reparte el daño por fuerza, Tank primero, y los atacantes vuelven si quedan defensores (CR 465-466)', () => {
    let p = enJuego();
    p = conEnMano(conEnMano(p, 'A'), 'T');
    const a = p.mano.find((c) => c.id === 'A')!;
    const t = p.mano.find((c) => c.id === 'T')!;
    p = jugar(p, a.uid, 'base');
    p = jugar(p, t.uid, 'base');
    p = terminarTurno(p);
    // El rival pone una ficha de 3 en el campo 1 y la mueve: conquista.
    p = rivalCrear(p, 'base', { fuerza: 3 });
    const r = p.rivalBase[0];
    p = rivalMover(p, r.uid, 1);
    p = resolverEnfrentamiento(p);
    expect(p.campos[1].control).toBe('rival');
    expect(p.puntosRival).toBe(1);
    p = terminarTurnoRival(p);
    // Ataco con Soldado (2) y Muro (1, Tank): 3 de daño matan a la ficha de 3; ella pega 3: Tank primero (1) y luego 2 al Soldado.
    p = mover(p, [a.uid, t.uid], 'campo1');
    expect(p.enfrentamiento?.tipo).toBe('combate');
    p = resolverEnfrentamiento(p);
    expect(p.campos[1].rival).toHaveLength(0);
    expect(p.campos[1].unidades).toHaveLength(0);
    expect(p.campos[1].control).toBeNull();
    expect(p.puntos).toBe(0);
  });

  it('el punto final por conquista exige haber puntuado todos los campos ese turno; si no, robas (CR 471.1.b)', () => {
    let p = conEnMano(enJuego(), 'A');
    const a = p.mano.find((c) => c.id === 'A')!;
    p = jugar(p, a.uid, 'base');
    p = terminarTurnoRival(terminarTurno(p));
    p = fijarPuntos(p, 'yo', PUNTOS_PARA_GANAR - 1);
    const mano = p.mano.length;
    p = resolverEnfrentamiento(mover(p, [a.uid], 'campo0'));
    expect(p.puntos).toBe(PUNTOS_PARA_GANAR - 1);
    expect(p.mano).toHaveLength(mano + 1);
    expect(p.ganador).toBeNull();
  });

  it('Hold sí puede dar el punto final y gana la partida', () => {
    let p = conEnMano(enJuego(), 'A');
    const a = p.mano.find((c) => c.id === 'A')!;
    p = jugar(p, a.uid, 'base');
    p = terminarTurnoRival(terminarTurno(p));
    p = resolverEnfrentamiento(mover(p, [a.uid], 'campo0'));
    p = fijarPuntos(p, 'yo', PUNTOS_PARA_GANAR - 1);
    p = terminarTurnoRival(terminarTurno(p));
    expect(p.puntos).toBe(PUNTOS_PARA_GANAR);
    expect(p.ganador).toBe('yo');
  });

  it('Vision deja elegir reciclar la primera carta; Hidden cuesta 1 de poder y se juega gratis al turno siguiente', () => {
    let p = conEnMano(enJuego(), 'V');
    const v = p.mano.find((c) => c.id === 'V')!;
    p = jugar(p, v.uid, 'base');
    expect(p.pendiente?.tipo).toBe('vision');
    const arriba = p.mazo[0];
    p = resolverVision(p, true);
    expect(p.mazo.at(-1)?.uid).toBe(arriba.uid);
    // Hidden: hay que controlar el campo.
    p = conEnMano(p, 'H');
    const h = p.mano.find((c) => c.id === 'H')!;
    expect(ocultar(p, h.uid, 0).aviso).toContain('controles');
    p = terminarTurnoRival(terminarTurno(p));
    p = resolverEnfrentamiento(mover(p, [v.uid], 'campo0'));
    p = ocultar(p, h.uid, 0);
    expect(p.aviso).toBeNull();
    expect(p.campos[0].oculta?.id).toBe('H');
    expect(porQueNoJugar(p, p.campos[0].oculta!, 'base')).toContain('turno siguiente');
    p = terminarTurnoRival(terminarTurno(p));
    const antes = p.runas.filter((r) => !r.agotada).length;
    p = jugar(p, p.campos[0].oculta!.uid, 'base');
    expect(p.aviso).toBeNull();
    expect(p.runas.filter((r) => !r.agotada)).toHaveLength(antes);
    expect(p.cementerio.some((c) => c.id === 'H')).toBe(true);
  });

  it('Burn Out: sin mazo, el cementerio vuelve barajado y el rival gana 1 punto (CR 431)', () => {
    let p = enJuego();
    p = { ...p, cementerio: p.mazo.slice(0, 5), mazo: [] };
    p = terminarTurnoRival(terminarTurno(p));
    expect(p.puntosRival).toBe(1);
    expect(p.mazo).toHaveLength(4);
  });

  it('lee las palabras clave del texto y valida la construcción del mazo', () => {
    const kw = palabrasClave('[Accelerate] (…)\n[Assault 2] [Tank] [Deflect]');
    expect(kw).toMatchObject({
      accelerate: true,
      assault: 2,
      tank: true,
      deflect: 1,
      ganking: false,
    });
    const m = mazo();
    expect(validarMazo(m, carta).some((a) => a.includes('copias'))).toBe(true);
    m.runas = { R: 11 };
    expect(validarMazo(m, carta).some((a) => a.includes('runas'))).toBe(true);
  });
});
