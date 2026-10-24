import { Injectable, computed, inject, signal } from '@angular/core';
import { collection, deleteDoc, doc, getDocs, setDoc } from 'firebase/firestore';
import { AuthService } from './auth.service';
import { CardQty, CollectionMap } from './collection.service';
import { DEMO, escribirDemo, leerDemo } from './demo';
import { db } from './firebase';

/** Una carta que quieres. `users/{uid}/wishlist/{cardId}`. */
export interface WishEntry {
  /** Copias que quieres tener en total (normales o foil, da igual). */
  qty: number;
  nota?: string;
}

export type WishlistMap = ReadonlyMap<string, WishEntry>;

/** Los mismos límites que firestore.rules. */
export const MAX_DESEO = 99;
export const MAX_NOTA = 200;

interface WishlistStore {
  read(uid: string): Promise<Map<string, WishEntry>>;
  /** `entry` a null borra el documento. */
  write(uid: string, cardId: string, entry: WishEntry | null): Promise<void>;
}

/** Solo los campos que admiten las reglas: `nota` únicamente si tiene texto. */
function documento(entry: WishEntry) {
  return entry.nota ? { qty: entry.qty, nota: entry.nota } : { qty: entry.qty };
}

class FirestoreStore implements WishlistStore {
  async read(uid: string): Promise<Map<string, WishEntry>> {
    const snap = await getDocs(collection(db, 'users', uid, 'wishlist'));
    const salida = new Map<string, WishEntry>();
    for (const d of snap.docs) {
      const entry = normalizar(d.data());
      if (entry) salida.set(d.id, entry);
    }
    return salida;
  }

  async write(uid: string, cardId: string, entry: WishEntry | null): Promise<void> {
    const ref = doc(db, 'users', uid, 'wishlist', cardId);
    await (entry ? setDoc(ref, documento(entry)) : deleteDoc(ref));
  }
}

class DemoStore implements WishlistStore {
  async read(uid: string): Promise<Map<string, WishEntry>> {
    const guardado = leerDemo<Record<string, unknown>>(`wishlist-${uid}`, {});
    const salida = new Map<string, WishEntry>();
    for (const [id, datos] of Object.entries(guardado)) {
      const entry = normalizar(datos);
      if (entry) salida.set(id, entry);
    }
    return salida;
  }

  async write(uid: string, cardId: string, entry: WishEntry | null): Promise<void> {
    const guardado = leerDemo<Record<string, WishEntry>>(`wishlist-${uid}`, {});
    if (entry) guardado[cardId] = documento(entry);
    else delete guardado[cardId];
    escribirDemo(`wishlist-${uid}`, guardado);
  }
}

/**
 * Lista de deseos propia. Mismo patrón que CollectionService: se lee una vez por
 * sesión, los cambios se pintan antes de guardarse y se deshacen si fallan.
 */
@Injectable({ providedIn: 'root' })
export class WishlistService {
  private readonly auth = inject(AuthService);
  private readonly store: WishlistStore = DEMO ? new DemoStore() : new FirestoreStore();

  readonly entries = signal<WishlistMap>(new Map());
  readonly uid = signal<string | null>(null);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly editable = computed(() => !!this.uid() && this.uid() === this.auth.user()?.uid);

  private cola = new Map<string, Promise<unknown>>();
  private carga: Promise<void> | null = null;
  private sesion: string | null = null;

  /** Al cambiar de usuario se tira lo leído, igual que en CollectionService. */
  private comprobarSesion(): void {
    const uid = this.auth.user()?.uid ?? null;
    if (uid === this.sesion) return;
    this.sesion = uid;
    this.cola.clear();
    this.carga = null;
    this.entries.set(new Map());
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
    if (!uid) {
      this.error.set('No hay sesión');
      this.carga = null;
      return;
    }
    this.loading.set(true);
    try {
      const datos = await this.store.read(uid);
      if (this.sesion !== uid) return;
      this.entries.set(datos);
      this.uid.set(uid);
      this.error.set(null);
    } catch (e) {
      this.carga = null;
      this.error.set(e instanceof Error ? e.message : String(e));
    } finally {
      this.loading.set(false);
    }
  }

  get(cardId: string): WishEntry | undefined {
    return this.entries().get(cardId.toUpperCase());
  }

  /** Añade la carta con 1 copia si no estaba; si ya estaba, no la toca. */
  add(cardId: string): void {
    if (!this.get(cardId)) this.set(cardId, { qty: 1 });
  }

  /** Cambia las copias que quieres. Bajar a 0 la quita de la lista. */
  adjust(cardId: string, delta: number): void {
    const actual = this.get(cardId);
    const qty = (actual?.qty ?? 0) + delta;
    this.set(cardId, qty > 0 ? { ...actual, qty } : null);
  }

  setNota(cardId: string, nota: string): void {
    const actual = this.get(cardId);
    if (!actual) return;
    const limpia = nota.trim().slice(0, MAX_NOTA);
    if ((actual.nota ?? '') === limpia) return;
    this.set(cardId, { qty: actual.qty, ...(limpia ? { nota: limpia } : {}) });
  }

  remove(cardId: string): void {
    this.set(cardId, null);
  }

  /** Fija una entrada (null la borra). Optimista: se deshace si el guardado falla. */
  set(cardId: string, entry: WishEntry | null): void {
    this.comprobarSesion();
    const id = cardId.toUpperCase();
    const uid = this.uid();
    if (!uid || !this.editable()) {
      this.error.set('Tu lista de deseos aún no se ha cargado');
      return;
    }
    const limpio = entry ? { ...entry, qty: Math.min(MAX_DESEO, Math.max(1, entry.qty)) } : null;
    const anterior = this.entries().get(id) ?? null;
    this.aplicar(uid, id, limpio);

    const pendiente = this.cola.get(id) ?? Promise.resolve();
    const tarea = pendiente
      .catch(() => {})
      .then(() => this.store.write(uid, id, limpio))
      .then(() => this.error.set(null))
      .catch((e: unknown) => {
        this.aplicar(uid, id, anterior);
        this.error.set(e instanceof Error ? e.message : String(e));
      });
    this.cola.set(id, tarea);
  }

  async flush(): Promise<void> {
    await Promise.all([...this.cola.values()].map((p) => p.catch(() => {})));
  }

  private aplicar(uid: string, cardId: string, entry: WishEntry | null): void {
    if (this.uid() !== uid) return;
    const copia = new Map(this.entries());
    if (entry) copia.set(cardId, entry);
    else copia.delete(cardId);
    this.entries.set(copia);
  }
}

/** Copias que aún te faltan: lo que quieres menos lo que ya tienes (normales y foil). */
export function faltan(entry: WishEntry, tienes: CardQty | undefined): number {
  return Math.max(0, entry.qty - (tienes?.normal ?? 0) - (tienes?.foil ?? 0));
}

/** Alguien que tiene copias de una carta. */
export interface Poseedor {
  uid: string;
  nombre: string;
  normal: number;
  foil: number;
}

/**
 * Quién tiene copias de cada carta, entre las colecciones dadas. Solo mira las
 * cartas de `cardIds`; quien no tiene ninguna copia no aparece. Ordenado por
 * número de copias, de más a menos.
 */
export function quienTiene(
  cardIds: Iterable<string>,
  colecciones: readonly { uid: string; nombre: string; cards: CollectionMap }[],
): Map<string, Poseedor[]> {
  const salida = new Map<string, Poseedor[]>();
  for (const cardId of cardIds) {
    const lista: Poseedor[] = [];
    for (const c of colecciones) {
      const q = c.cards.get(cardId);
      if (q && q.normal + q.foil > 0)
        lista.push({ uid: c.uid, nombre: c.nombre, normal: q.normal, foil: q.foil });
    }
    lista.sort(
      (a, b) => b.normal + b.foil - (a.normal + a.foil) || a.nombre.localeCompare(b.nombre),
    );
    salida.set(cardId, lista);
  }
  return salida;
}

/** Un documento escrito a mano o de otra versión podría traer basura: se descarta. */
function normalizar(datos: unknown): WishEntry | null {
  const d = (datos ?? {}) as Partial<Record<keyof WishEntry, unknown>>;
  const qty = Math.trunc(Number(d.qty));
  if (!Number.isFinite(qty) || qty < 1) return null;
  const entry: WishEntry = { qty: Math.min(MAX_DESEO, qty) };
  if (typeof d.nota === 'string' && d.nota) entry.nota = d.nota.slice(0, MAX_NOTA);
  return entry;
}
