import { Injectable, computed, inject, signal } from '@angular/core';
import { collection, deleteDoc, doc, getDocs, setDoc } from 'firebase/firestore';
import { AuthService } from './auth.service';
import { DEMO, escribirDemo, leerDemo } from './demo';
import { db } from './firebase';

/** Copias de una carta. `users/{uid}/collection/{cardId}`. */
export interface CardQty {
  normal: number;
  foil: number;
}

export type Finish = 'normal' | 'foil';
export type CollectionMap = ReadonlyMap<string, CardQty>;

const VACIO: CardQty = { normal: 0, foil: 0 };

/**
 * Almacén de colecciones. Dos implementaciones con la misma interfaz: Firestore y,
 * en modo demo, localStorage. Todo lo que hay por encima no sabe cuál está usando.
 */
interface CollectionStore {
  read(uid: string): Promise<Map<string, CardQty>>;
  /** `qty` a null borra el documento: una carta con 0 normales y 0 foils no se guarda. */
  write(uid: string, cardId: string, qty: CardQty | null): Promise<void>;
}

class FirestoreStore implements CollectionStore {
  async read(uid: string): Promise<Map<string, CardQty>> {
    const snap = await getDocs(collection(db, 'users', uid, 'collection'));
    return new Map(snap.docs.map((d) => [d.id, normalizarQty(d.data())]));
  }

  async write(uid: string, cardId: string, qty: CardQty | null): Promise<void> {
    const ref = doc(db, 'users', uid, 'collection', cardId);
    await (qty ? setDoc(ref, { normal: qty.normal, foil: qty.foil }) : deleteDoc(ref));
  }
}

class DemoStore implements CollectionStore {
  async read(uid: string): Promise<Map<string, CardQty>> {
    const guardado = leerDemo<Record<string, CardQty>>(`collection-${uid}`, {});
    return new Map(Object.entries(guardado).map(([id, q]) => [id, normalizarQty(q)]));
  }

  async write(uid: string, cardId: string, qty: CardQty | null): Promise<void> {
    const guardado = leerDemo<Record<string, CardQty>>(`collection-${uid}`, {});
    if (qty) guardado[cardId] = qty;
    else delete guardado[cardId];
    escribirDemo(`collection-${uid}`, guardado);
  }
}

@Injectable({ providedIn: 'root' })
export class CollectionService {
  private readonly auth = inject(AuthService);
  private readonly store: CollectionStore = DEMO ? new DemoStore() : new FirestoreStore();

  /** Colección que se está mostrando. Puede ser la de otro miembro del grupo. */
  readonly cards = signal<CollectionMap>(new Map());
  /** De quién es la colección de `cards`. */
  readonly uid = signal<string | null>(null);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  /** Solo se puede editar la propia. Las reglas de Firestore aplican lo mismo en servidor. */
  readonly editable = computed(() => !!this.uid() && this.uid() === this.auth.user()?.uid);

  readonly totals = computed(() => {
    let normal = 0;
    let foil = 0;
    for (const q of this.cards().values()) {
      normal += q.normal;
      foil += q.foil;
    }
    return { cards: this.cards().size, normal, foil, copies: normal + foil };
  });

  /** Una colección leída por uid: evita releer 400 documentos al cambiar de pestaña. */
  private cache = new Map<string, Map<string, CardQty>>();
  /** Una cadena de escrituras por carta, para que varios clics seguidos no se pisen. */
  private cola = new Map<string, Promise<unknown>>();

  /** Sesión a la que pertenece lo cacheado. Ver `comprobarSesion`. */
  private sesion: string | null = null;

  /**
   * Al cambiar de usuario hay que tirar lo leído: si no, el siguiente que entre en
   * este navegador vería la colección cacheada del anterior. Se comprueba aquí, en
   * los dos puntos de entrada, y no con un `effect`, para no depender del runtime
   * reactivo de Angular por una invalidación de caché.
   */
  private comprobarSesion(): void {
    const uid = this.auth.user()?.uid ?? null;
    if (uid === this.sesion) return;
    this.sesion = uid;
    this.cache.clear();
    this.cola.clear();
    this.cards.set(new Map());
    this.uid.set(null);
    this.error.set(null);
  }

  /** Carga la colección propia y la deja como la que se está mostrando. */
  async loadMine(): Promise<void> {
    const uid = this.auth.user()?.uid;
    if (!uid) {
      this.error.set('No hay sesión');
      return;
    }
    await this.view(uid);
  }

  /** Carga la colección de `uid`. Si no es la propia, queda en solo lectura. */
  async view(uid: string, recargar = false): Promise<void> {
    this.comprobarSesion();
    this.uid.set(uid);
    const enCache = this.cache.get(uid);
    if (enCache && !recargar) {
      this.cards.set(new Map(enCache));
      return;
    }
    this.loading.set(true);
    try {
      const datos = await this.store.read(uid);
      this.cache.set(uid, datos);
      // Otra pantalla puede haber cambiado de colección mientras se leía esta.
      if (this.uid() === uid) this.cards.set(new Map(datos));
      this.error.set(null);
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : String(e));
    } finally {
      this.loading.set(false);
    }
  }

  qty(cardId: string): CardQty {
    return this.cards().get(cardId.toUpperCase()) ?? VACIO;
  }

  has(cardId: string): boolean {
    const q = this.qty(cardId);
    return q.normal > 0 || q.foil > 0;
  }

  /** +1 / −1 con guardado inmediato y optimista. Nunca baja de 0. */
  adjust(cardId: string, finish: Finish, delta: number): void {
    const actual = this.qty(cardId);
    this.set(cardId, { ...actual, [finish]: Math.max(0, actual[finish] + delta) });
  }

  /**
   * Fija las copias de una carta. Pinta el cambio antes de guardarlo y lo deshace
   * si Firestore lo rechaza, para que la pantalla nunca muestre algo que no se guardó.
   */
  set(cardId: string, qty: CardQty): void {
    this.comprobarSesion();
    const id = cardId.toUpperCase();
    const uid = this.uid();
    if (!uid || !this.editable()) {
      this.error.set('Esta colección es de solo lectura');
      return;
    }
    const limpio: CardQty = { normal: Math.max(0, qty.normal), foil: Math.max(0, qty.foil) };
    const anterior = this.cards().get(id);
    this.aplicar(uid, id, limpio);

    const pendiente = this.cola.get(id) ?? Promise.resolve();
    const tarea = pendiente
      .catch(() => {})
      .then(() => this.store.write(uid, id, limpio.normal || limpio.foil ? limpio : null))
      .then(() => {
        this.error.set(null);
      })
      .catch((e: unknown) => {
        this.aplicar(uid, id, anterior ?? null);
        this.error.set(e instanceof Error ? e.message : String(e));
      });
    this.cola.set(id, tarea);
  }

  /** Espera a que no queden escrituras en vuelo. Para los tests y antes de exportar. */
  async flush(): Promise<void> {
    await Promise.all([...this.cola.values()].map((p) => p.catch(() => {})));
  }

  private aplicar(uid: string, cardId: string, qty: CardQty | null): void {
    const cache = this.cache.get(uid) ?? new Map<string, CardQty>();
    if (qty && (qty.normal || qty.foil)) cache.set(cardId, qty);
    else cache.delete(cardId);
    this.cache.set(uid, cache);
    if (this.uid() === uid) this.cards.set(new Map(cache));
  }
}

/** Un documento escrito a mano o de una versión anterior podría traer basura. */
function normalizarQty(datos: unknown): CardQty {
  const d = (datos ?? {}) as Partial<Record<Finish, unknown>>;
  return { normal: entero(d.normal), foil: entero(d.foil) };
}

function entero(valor: unknown): number {
  const n = Math.trunc(Number(valor));
  return Number.isFinite(n) && n > 0 ? n : 0;
}
