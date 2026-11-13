import { Injectable, computed, inject, signal } from '@angular/core';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { AuthService } from './auth.service';
import {
  Bote,
  CATEGORIAS,
  Categoria,
  MAX_APORTACION,
  MAX_CONCEPTO,
  MAX_MOVIMIENTOS,
  Movimiento,
  TIPOS,
  TipoMovimiento,
  boteVacio,
  conMovimiento,
  esFechaValida,
  esMesValido,
  ordenar,
  redondear,
  sinMovimiento,
} from './bote';
import { DEMO, escribirDemo, leerDemo } from './demo';
import { db } from './firebase';

/**
 * Bote del usuario: su presupuesto mensual y sus movimientos. Es un dato privado, así que
 * va en un solo documento (`users/{uid}/bote/datos`) que solo lee y escribe el dueño:
 * una lectura al entrar y una escritura por cambio. Las aportaciones no se guardan: se
 * calculan a partir de la configuración (core/bote.ts).
 */
@Injectable({ providedIn: 'root' })
export class BoteService {
  private readonly auth = inject(AuthService);

  readonly bote = signal<Bote>(boteVacio());
  readonly error = signal<string | null>(null);
  private readonly uid = signal<string | null>(null);
  readonly listo = computed(() => this.uid() !== null);
  readonly cargando = computed(() => this.uid() === null && this.error() === null);

  private carga: Promise<void> | null = null;
  private sesion: string | null = null;
  /** Guardados en cadena: el último cambio siempre llega el último. */
  private cola: Promise<unknown> = Promise.resolve();

  private comprobarSesion(): void {
    const uid = this.auth.user()?.uid ?? null;
    if (uid === this.sesion) return;
    this.sesion = uid;
    this.carga = null;
    this.bote.set(boteVacio());
    this.uid.set(null);
    this.error.set(null);
  }

  load(): Promise<void> {
    this.comprobarSesion();
    this.carga ??= this.cargar();
    return this.carga;
  }

  private async cargar(): Promise<void> {
    const uid = this.auth.user()?.uid;
    if (!uid) return;
    try {
      const bruto = DEMO
        ? leerDemo<unknown>(`bote-${uid}`, null)
        : ((await getDoc(referencia(uid))).data() ?? null);
      if (this.sesion !== uid) return;
      this.bote.set(normalizar(bruto));
      this.uid.set(uid);
      this.error.set(null);
    } catch (e) {
      this.carga = null;
      this.error.set(`No se pudo cargar el bote: ${mensaje(e)}`);
    }
  }

  /** Cambia la aportación mensual y el mes de inicio. */
  configurar(aportacion: number, inicio: string): void {
    this.aplicar((b) => ({ ...b, aportacion: redondear(aportacion), inicio }));
  }

  /** Añade un movimiento nuevo o sustituye el que tenga el mismo id. */
  guardarMovimiento(m: Movimiento): void {
    this.aplicar((b) => {
      if (!b.movimientos.some((x) => x.id === m.id) && b.movimientos.length >= MAX_MOVIMIENTOS) {
        throw new Error(`El bote no admite más de ${MAX_MOVIMIENTOS} movimientos`);
      }
      return conMovimiento(b, m);
    });
  }

  borrarMovimiento(id: string): void {
    this.aplicar((b) => sinMovimiento(b, id));
  }

  /** Cambio optimista: se deshace si el guardado falla. */
  private aplicar(cambio: (b: Bote) => Bote): void {
    this.comprobarSesion();
    const uid = this.uid();
    if (!uid) {
      this.error.set('El bote aún no se ha cargado');
      return;
    }
    const anterior = this.bote();
    let nuevo: Bote;
    try {
      nuevo = cambio(anterior);
    } catch (e) {
      this.error.set(mensaje(e));
      return;
    }
    this.bote.set(nuevo);
    const datos = { ...nuevo, actualizado: new Date().toISOString() };
    this.cola = this.cola
      .catch(() => {})
      .then(async () => {
        if (DEMO) escribirDemo(`bote-${uid}`, datos);
        else await setDoc(referencia(uid), datos);
      })
      .then(() => this.error.set(null))
      .catch((e: unknown) => {
        if (this.uid() === uid) this.bote.set(anterior);
        this.error.set(`No se pudo guardar el bote: ${mensaje(e)}`);
      });
  }

  /** Para los tests: espera a que acaben los guardados. */
  flush(): Promise<unknown> {
    return this.cola.catch(() => {});
  }
}

/** Lo que haya en el documento, saneado: lo que no encaje se ignora en vez de romper. */
function normalizar(bruto: unknown): Bote {
  const base = boteVacio();
  if (!bruto || typeof bruto !== 'object') return base;
  const o = bruto as Record<string, unknown>;
  const aportacion =
    typeof o['aportacion'] === 'number' && o['aportacion'] >= 0 && o['aportacion'] <= MAX_APORTACION
      ? redondear(o['aportacion'])
      : base.aportacion;
  const inicio = typeof o['inicio'] === 'string' && esMesValido(o['inicio']) ? o['inicio'] : base.inicio;
  const movimientos: Movimiento[] = [];
  if (Array.isArray(o['movimientos'])) {
    for (const x of o['movimientos'] as unknown[]) {
      const m = movimiento(x);
      if (m) movimientos.push(m);
    }
  }
  return { aportacion, inicio, movimientos: ordenar(movimientos.slice(0, MAX_MOVIMIENTOS)) };
}

function movimiento(x: unknown): Movimiento | null {
  if (!x || typeof x !== 'object') return null;
  const o = x as Record<string, unknown>;
  const { id, fecha, tipo, categoria, concepto, importe } = o;
  if (typeof id !== 'string' || !id) return null;
  if (typeof fecha !== 'string' || !esFechaValida(fecha)) return null;
  if (!TIPOS.includes(tipo as TipoMovimiento)) return null;
  if (typeof importe !== 'number' || !Number.isFinite(importe)) return null;
  return {
    id,
    fecha,
    tipo: tipo as TipoMovimiento,
    categoria: CATEGORIAS.includes(categoria as Categoria) ? (categoria as Categoria) : 'otro',
    concepto: typeof concepto === 'string' ? concepto.slice(0, MAX_CONCEPTO) : '',
    importe: redondear(importe),
  };
}

const referencia = (uid: string) => doc(db, 'users', uid, 'bote', 'datos');
const mensaje = (e: unknown) => (e instanceof Error ? e.message : String(e));
