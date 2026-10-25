import { VotacionRed, combinarRedYHuella, puntuarRed, vectorDeSalida } from './red';
import { Reconocimiento } from './reconocimiento';

const huella = (candidatas: [string, number][]): Reconocimiento => ({
  candidatas: candidatas.map(([cardId, distancia]) => ({ cardId, distancia })),
  segura: false,
  margen: 0,
  encuadre: null,
});
const base = (id: string) => id.replace(/[A-Z*]$/, '');

describe('red', () => {
  it('normaliza el vector (token CLS de [1, tokens, dim])', () => {
    const v = vectorDeSalida([3, 4, 9, 9], [1, 2, 2]);
    expect(v[0]).toBeCloseTo(0.6);
    expect(v[1]).toBeCloseTo(0.8);
  });

  it('puntúa con el catálogo cuantizado', () => {
    const p = puntuarRed([Float32Array.from([1, 0])], {
      ids: ['A', 'B'],
      dim: 2,
      datos: Int8Array.from([127, 0, 0, 127]),
    });
    expect(p.get('A')).toBeCloseTo(1);
    expect(p.get('B')).toBeCloseTo(0);
  });

  it('la huella desempata y el margen se mide contra otra carta, no contra una gemela', () => {
    const red = new Map([
      ['OGN-001', 0.7],
      ['OGN-001A', 0.69],
      ['OGN-002', 0.68],
    ]);
    const c = combinarRedYHuella(red, huella([['OGN-001', 0.1]]), base);
    expect(c.candidatas[0].cardId).toBe('OGN-001');
    // 0,7 + 0,15 de la huella frente a 0,68 de OGN-002 (la A es la misma carta).
    expect(c.margen).toBeCloseTo(0.17);
  });

  it('para con una lectura muy clara o con dos seguidas que coinciden', () => {
    const v = new VotacionRed();
    const r = (id: string, margen: number) => ({
      candidatas: [{ cardId: id, distancia: 0.2 }],
      margen,
    });
    expect(v.anadir(r('A', 0.2))).toBe('A');
    v.reiniciar();
    expect(v.anadir(r('A', 0.08))).toBeNull();
    expect(v.anadir(r('A', 0.08))).toBe('A');
    v.reiniciar();
    expect(v.anadir(r('A', 0.08))).toBeNull();
    expect(v.anadir(r('B', 0.08))).toBeNull();
    expect(v.anadir(r('B', 0.02))).toBeNull();
  });
});
