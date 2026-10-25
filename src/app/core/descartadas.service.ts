import { Injectable, computed, inject, signal } from '@angular/core';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { AuthService } from './auth.service';
import { DEMO, escribirDemo, leerDemo } from './demo';
import { db } from './firebase';

/** El mismo límite que firestore.rules. */
export const MAX_DESCARTADAS = 3000;

/**
 * Cartas que el usuario ha marcado como "No la quiero": no cuentan como que le faltan
 * ni en el porcentaje completado de un set. Es una preferencia propia que nadie más
 * necesita, así que va en un solo documento (`users/{uid}/preferencias/descartadas`,
 * `{ cardIds: [...] }`): una lectura al entrar y una escritura por cambio.
 */
@Injectable({ providedIn: 'root' })
export class DescartadasService {
  private readonly auth = inject(AuthService);

  readonly ids = signal<ReadonlySet<string>>(new Set());
  readonly error = signal<string | null>(null);
  private readonly uid = signal<string | null>(null);
  readonly lista = computed(() => this.uid() !== null);

  private carga: Promise<void> | null = null;
  private sesion: string | null = null;
  /** Guardados en cadena: el último cambio siempre llega el último. */
  private cola: Promise<unknown> = Promise.resolve();

  private comprobarSesion(): void {
    const uid = this.auth.user()?.uid ?? null;
    if (uid === this.sesion) return;
    this.sesion = uid;
    this.carga = null;
    this.ids.set(new Set());
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
      const ids = DEMO
        ? leerDemo<string[]>(`descartadas-${uid}`, [])
        : (((await getDoc(referencia(uid))).data()?.['cardIds'] as unknown) ?? []);
      if (this.sesion !== uid) return;
      this.ids.set(new Set(Array.isArray(ids) ? ids.filter((x) => typeof x === 'string') : []));
      this.uid.set(uid);
      this.error.set(null);
    } catch (e) {
      this.carga = null;
      this.error.set(`No se pudieron cargar las cartas que no quieres: ${mensaje(e)}`);
    }
  }

  tiene(cardId: string): boolean {
    return this.ids().has(cardId.toUpperCase());
  }

  /** Marca o desmarca una carta. Optimista: se deshace si el guardado falla. */
  alternar(cardId: string): void {
    this.comprobarSesion();
    const uid = this.uid();
    if (!uid) {
      this.error.set('Tus preferencias aún no se han cargado');
      return;
    }
    const id = cardId.toUpperCase();
    const anterior = this.ids();
    const nuevo = new Set(anterior);
    if (nuevo.has(id)) nuevo.delete(id);
    else if (nuevo.size < MAX_DESCARTADAS) nuevo.add(id);
    this.ids.set(nuevo);
    const cardIds = [...nuevo].sort();
    this.cola = this.cola
      .catch(() => {})
      .then(async () => {
        if (DEMO) escribirDemo(`descartadas-${uid}`, cardIds);
        else await setDoc(referencia(uid), { cardIds });
      })
      .then(() => this.error.set(null))
      .catch((e: unknown) => {
        if (this.uid() === uid) this.ids.set(anterior);
        this.error.set(`No se pudo guardar: ${mensaje(e)}`);
      });
  }

  /** Para los tests: espera a que acaben los guardados. */
  flush(): Promise<unknown> {
    return this.cola.catch(() => {});
  }
}

const referencia = (uid: string) => doc(db, 'users', uid, 'preferencias', 'descartadas');
const mensaje = (e: unknown) => (e instanceof Error ? e.message : String(e));
