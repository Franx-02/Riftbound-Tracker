import { Injectable, computed, inject, signal } from '@angular/core';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { AuthService } from './auth.service';
import { DEMO, escribirDemo, leerDemo } from './demo';
import { db } from './firebase';

/** El mismo límite que firestore.rules. */
export const MAX_INTERCAMBIABLES = 3000;

/**
 * Cartas que el usuario ha marcado "para cambiar", aunque solo tenga una copia. Salen
 * siempre en Intercambios a los demás. Como las leen otros, van en un documento público:
 * `users/{uid}/publico/intercambiables = { cardIds: [...] }` (una lectura por persona).
 */
@Injectable({ providedIn: 'root' })
export class IntercambiablesService {
  private readonly auth = inject(AuthService);

  /** Las propias. */
  readonly ids = signal<ReadonlySet<string>>(new Set());
  readonly error = signal<string | null>(null);
  private readonly uid = signal<string | null>(null);
  readonly lista = computed(() => this.uid() !== null);

  /** Las de otros usuarios ya leídas, por uid. */
  private readonly ajenas = signal<ReadonlyMap<string, ReadonlySet<string>>>(new Map());

  private carga: Promise<void> | null = null;
  private sesion: string | null = null;
  private cola: Promise<unknown> = Promise.resolve();

  private comprobarSesion(): void {
    const uid = this.auth.user()?.uid ?? null;
    if (uid === this.sesion) return;
    this.sesion = uid;
    this.carga = null;
    this.ids.set(new Set());
    this.uid.set(null);
    this.ajenas.set(new Map());
    this.error.set(null);
  }

  load(): Promise<void> {
    this.comprobarSesion();
    this.carga ??= (async () => {
      const uid = this.auth.user()?.uid;
      if (!uid) return;
      try {
        const ids = await leer(uid);
        if (this.sesion !== uid) return;
        this.ids.set(ids);
        this.uid.set(uid);
        this.error.set(null);
      } catch (e) {
        this.carga = null;
        this.error.set(`No se pudieron cargar tus cartas para cambiar: ${mensaje(e)}`);
      }
    })();
    return this.carga;
  }

  /** Lee las cartas para cambiar de otra persona (una vez por sesión). */
  async loadDe(uid: string): Promise<void> {
    this.comprobarSesion();
    if (this.ajenas().has(uid)) return;
    try {
      const ids = await leer(uid);
      this.ajenas.set(new Map(this.ajenas()).set(uid, ids));
    } catch (e) {
      this.error.set(`No se pudieron leer sus cartas para cambiar: ${mensaje(e)}`);
    }
  }

  de(uid: string): ReadonlySet<string> {
    return uid === this.uid() ? this.ids() : (this.ajenas().get(uid) ?? new Set());
  }

  tiene(cardId: string): boolean {
    return this.ids().has(cardId.toUpperCase());
  }

  /** Marca o desmarca una carta. Optimista: se deshace si el guardado falla. */
  alternar(cardId: string): void {
    this.comprobarSesion();
    const uid = this.uid();
    if (!uid) {
      this.error.set('Tus cartas para cambiar aún no se han cargado');
      return;
    }
    const id = cardId.toUpperCase();
    const anterior = this.ids();
    const nuevo = new Set(anterior);
    if (nuevo.has(id)) nuevo.delete(id);
    else if (nuevo.size < MAX_INTERCAMBIABLES) nuevo.add(id);
    this.ids.set(nuevo);
    const cardIds = [...nuevo].sort();
    this.cola = this.cola
      .catch(() => {})
      .then(async () => {
        if (DEMO) escribirDemo(`intercambiables-${uid}`, cardIds);
        else await setDoc(referencia(uid), { cardIds });
      })
      .then(() => this.error.set(null))
      .catch((e: unknown) => {
        if (this.uid() === uid) this.ids.set(anterior);
        this.error.set(`No se pudo guardar: ${mensaje(e)}`);
      });
  }

  flush(): Promise<unknown> {
    return this.cola.catch(() => {});
  }
}

async function leer(uid: string): Promise<Set<string>> {
  const ids = DEMO
    ? leerDemo<string[]>(`intercambiables-${uid}`, [])
    : (((await getDoc(referencia(uid))).data()?.['cardIds'] as unknown) ?? []);
  return new Set(Array.isArray(ids) ? ids.filter((x) => typeof x === 'string') : []);
}

const referencia = (uid: string) => doc(db, 'users', uid, 'publico', 'intercambiables');
const mensaje = (e: unknown) => (e instanceof Error ? e.message : String(e));
