/**
 * Sonidos del simulador sintetizados con Web Audio (sin ficheros): un roce de carta al
 * robar, un golpe seco al jugar, un chasquido al mover y un impacto en los combates.
 * El contexto se crea con el primer gesto del usuario; si el navegador no deja, callan.
 */
export type Sonido = 'robar' | 'jugar' | 'mover' | 'combate' | 'punto' | 'error';

const CLAVE = 'riftbound-sim-sonido';
let ctx: AudioContext | null = null;

export function sonidoActivo(): boolean {
  try {
    return localStorage.getItem(CLAVE) !== 'no';
  } catch {
    return true;
  }
}

export function fijarSonido(activo: boolean): void {
  try {
    localStorage.setItem(CLAVE, activo ? 'si' : 'no');
  } catch {
    /* sin almacenamiento: no pasa nada */
  }
}

function contexto(): AudioContext | null {
  if (typeof window === 'undefined' || !('AudioContext' in window)) return null;
  ctx ??= new AudioContext();
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

/** Ráfaga de ruido filtrado: el roce de una carta. */
function roce(
  c: AudioContext,
  t: number,
  dur: number,
  desde: number,
  hasta: number,
  vol: number,
): void {
  const n = Math.floor(c.sampleRate * dur);
  const buffer = c.createBuffer(1, n, c.sampleRate);
  const datos = buffer.getChannelData(0);
  for (let i = 0; i < n; i++) datos[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const fuente = c.createBufferSource();
  fuente.buffer = buffer;
  const filtro = c.createBiquadFilter();
  filtro.type = 'bandpass';
  filtro.Q.value = 0.9;
  filtro.frequency.setValueAtTime(desde, t);
  filtro.frequency.exponentialRampToValueAtTime(hasta, t + dur);
  const gan = c.createGain();
  gan.gain.setValueAtTime(vol, t);
  gan.gain.exponentialRampToValueAtTime(0.001, t + dur);
  fuente.connect(filtro).connect(gan).connect(c.destination);
  fuente.start(t);
}

/** Tono corto con caída: golpes y campanillas. */
function tono(
  c: AudioContext,
  t: number,
  dur: number,
  desde: number,
  hasta: number,
  vol: number,
  tipo: OscillatorType = 'sine',
): void {
  const osc = c.createOscillator();
  osc.type = tipo;
  osc.frequency.setValueAtTime(desde, t);
  osc.frequency.exponentialRampToValueAtTime(Math.max(20, hasta), t + dur);
  const gan = c.createGain();
  gan.gain.setValueAtTime(vol, t);
  gan.gain.exponentialRampToValueAtTime(0.001, t + dur);
  osc.connect(gan).connect(c.destination);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

export function sonar(s: Sonido): void {
  if (!sonidoActivo()) return;
  const c = contexto();
  if (!c) return;
  const t = c.currentTime;
  switch (s) {
    case 'robar':
      roce(c, t, 0.18, 1800, 600, 0.35);
      break;
    case 'jugar':
      roce(c, t, 0.08, 900, 300, 0.25);
      tono(c, t + 0.02, 0.12, 180, 90, 0.35, 'triangle');
      break;
    case 'mover':
      roce(c, t, 0.12, 1200, 500, 0.22);
      break;
    case 'combate':
      tono(c, t, 0.25, 120, 40, 0.5, 'sawtooth');
      roce(c, t, 0.3, 500, 120, 0.4);
      break;
    case 'punto':
      tono(c, t, 0.18, 880, 880, 0.25);
      tono(c, t + 0.12, 0.3, 1320, 1320, 0.25);
      break;
    case 'error':
      tono(c, t, 0.15, 220, 160, 0.2, 'square');
      break;
  }
}
