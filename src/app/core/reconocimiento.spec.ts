import { PROPORCION_CARTA } from './huella';
import { Reconocimiento, Votacion, localizarCarta } from './reconocimiento';

const lectura = (cardId: string, d: number, margen = 0.05, segura = false): Reconocimiento => ({
  candidatas: [{ cardId, distancia: d }],
  segura,
  margen,
});

describe('Votacion', () => {
  it('se para cuando la misma carta sale 3 veces en las últimas 5', () => {
    const v = new Votacion();
    expect(v.anadir(lectura('A', 0.12))).toBeNull();
    expect(v.anadir(lectura('B', 0.15))).toBeNull();
    expect(v.anadir(lectura('A', 0.13))).toBeNull();
    expect(v.anadir(lectura('A', 0.11))).toBe('A');
  });

  it('dos lecturas seguras seguidas bastan', () => {
    const v = new Votacion();
    expect(v.anadir(lectura('A', 0.08, 0.1, true))).toBeNull();
    expect(v.anadir(lectura('A', 0.09, 0.1, true))).toBe('A');
  });

  it('no cuenta lecturas lejanas ni sin margen', () => {
    const v = new Votacion();
    for (let i = 0; i < 5; i++) expect(v.anadir(lectura('A', 0.25))).toBeNull();
    v.reiniciar();
    for (let i = 0; i < 5; i++) expect(v.anadir(lectura('A', 0.12, 0.001))).toBeNull();
  });
});

describe('localizarCarta', () => {
  it('encuentra un rectángulo con forma de carta sobre un fondo liso', () => {
    const W = 300;
    const H = 400;
    const data = new Uint8ClampedArray(W * H * 4).fill(200);
    // "Carta" oscura de 120 px de ancho, algo desplazada del centro.
    const cw = 120;
    const ch = Math.round(cw / PROPORCION_CARTA);
    const x0 = 100;
    const y0 = 120;
    for (let y = y0; y < y0 + ch; y++)
      for (let x = x0; x < x0 + cw; x++) {
        const i = (y * W + x) * 4;
        data[i] = data[i + 1] = data[i + 2] = 40;
      }
    for (let i = 3; i < data.length; i += 4) data[i] = 255;
    const guia = { x: 50, y: 60, w: 200, h: 200 / PROPORCION_CARTA };
    const [mejor] = localizarCarta({ data, width: W, height: H }, guia, 3);
    expect(Math.abs(mejor.x - x0)).toBeLessThan(6);
    expect(Math.abs(mejor.y - y0)).toBeLessThan(6);
    expect(Math.abs(mejor.w - cw)).toBeLessThan(8);
  });
});
