import { Injectable, inject, signal } from '@angular/core';
import { collection, deleteDoc, doc, getDocs, setDoc } from 'firebase/firestore';
import { AuthService } from './auth.service';
import { DEMO, escribirDemo, leerDemo } from './demo';
import { db } from './firebase';
import { Mazo, mazoVacio } from './mazos';

/** Los mismos límites que firestore.rules. */
export const MAX_NOMBRE_MAZO = 80;
const MAX_CARTAS_ZONA = 100;

interface MazosStore {
  read(uid: string): Promise<Mazo[]>;
  write(uid: string, mazo: Mazo): Promise<void>;
  remove(uid: string, id: string): Promise<void>;
}

/** Lo que se guarda: todo menos el id, que es el del documento. */
function documento(m: Mazo) {
  return {
    nombre: m.nombre,
    leyenda: m.leyenda,
    campeon: m.campeon,
    principal: m.principal,
    runas: m.runas,
    campos: m.campos,
    banquillo: m.banquillo,
    actualizado: m.actualizado,
  };
}

/** Acepta solo documentos con buena forma; lo raro se descarta en vez de romper la página. */
function normalizar(id: string, d: Record<string, unknown>): Mazo {
  const mapa = (v: unknown): Record<string, number> =>
    v && typeof v === 'object'
      ? Object.fromEntries(
          Object.entries(v as Record<string, unknown>).filter(
            (e): e is [string, number] => typeof e[1] === 'number' && e[1] > 0,
          ),
        )
      : {};
  const texto = (v: unknown) => (typeof v === 'string' && v ? v : null);
  return {
    id,
    nombre: texto(d['nombre']) ?? 'Mazo sin nombre',
    leyenda: texto(d['leyenda']),
    campeon: texto(d['campeon']),
    principal: mapa(d['principal']),
    runas: mapa(d['runas']),
    campos: Array.isArray(d['campos'])
      ? (d['campos'] as unknown[]).filter((x): x is string => typeof x === 'string')
      : [],
    banquillo: mapa(d['banquillo']),
    actualizado: texto(d['actualizado']) ?? new Date(0).toISOString(),
  };
}

class FirestoreStore implements MazosStore {
  async read(uid: string): Promise<Mazo[]> {
    const snap = await getDocs(collection(db, 'users', uid, 'decks'));
    return snap.docs.map((d) => normalizar(d.id, d.data()));
  }
  async write(uid: string, mazo: Mazo): Promise<void> {
    await setDoc(doc(db, 'users', uid, 'decks', mazo.id), documento(mazo));
  }
  async remove(uid: string, id: string): Promise<void> {
    await deleteDoc(doc(db, 'users', uid, 'decks', id));
  }
}

class DemoStore implements MazosStore {
  async read(uid: string): Promise<Mazo[]> {
    const todos = leerDemo<Record<string, Record<string, unknown>>>(`mazos-${uid}`, {});
    return Object.entries(todos).map(([id, d]) => normalizar(id, d));
  }
  async write(uid: string, mazo: Mazo): Promise<void> {
    const todos = leerDemo<Record<string, unknown>>(`mazos-${uid}`, {});
    todos[mazo.id] = documento(mazo);
    escribirDemo(`mazos-${uid}`, todos);
  }
  async remove(uid: string, id: string): Promise<void> {
    const todos = leerDemo<Record<string, unknown>>(`mazos-${uid}`, {});
    delete todos[id];
    escribirDemo(`mazos-${uid}`, todos);
  }
}

/**
 * Mazos del usuario: `users/{uid}/decks/{id}`, un documento por mazo. Los guardados son
 * optimistas y en cola, como la colección: la pantalla no espera a la red.
 */
@Injectable({ providedIn: 'root' })
export class MazosService {
  private readonly auth = inject(AuthService);
  private readonly store: MazosStore = DEMO ? new DemoStore() : new FirestoreStore();

  readonly mazos = signal<readonly Mazo[]>([]);
  readonly cargado = signal(false);
  readonly error = signal<string | null>(null);

  private carga: Promise<void> | null = null;
  private sesion: string | null = null;
  private cola: Promise<unknown> = Promise.resolve();

  private comprobarSesion(): void {
    const uid = this.auth.user()?.uid ?? null;
    if (uid === this.sesion) return;
    this.sesion = uid;
    this.carga = null;
    this.mazos.set([]);
    this.cargado.set(false);
    this.error.set(null);
  }

  load(): Promise<void> {
    this.comprobarSesion();
    this.carga ??= (async () => {
      const uid = this.auth.user()?.uid;
      if (!uid) return;
      try {
        const mazos = await this.store.read(uid);
        if (this.sesion !== uid) return;
        this.mazos.set(ordenar(mazos));
        this.cargado.set(true);
        this.error.set(null);
      } catch (e) {
        this.carga = null;
        this.error.set(`No se pudieron cargar tus mazos: ${mensaje(e)}`);
      }
    })();
    return this.carga;
  }

  mazo(id: string): Mazo | undefined {
    return this.mazos().find((m) => m.id === id);
  }

  /** Crea un mazo vacío y devuelve su id. */
  crear(nombre = 'Mazo nuevo'): string {
    const id = crypto.randomUUID().replace(/-/g, '').slice(0, 20);
    this.guardar(mazoVacio(id, nombre));
    return id;
  }

  guardar(mazo: Mazo): void {
    const uid = this.auth.user()?.uid;
    if (!uid) return;
    const limpio: Mazo = {
      ...mazo,
      nombre: mazo.nombre.trim().slice(0, MAX_NOMBRE_MAZO) || 'Mazo sin nombre',
      actualizado: new Date().toISOString(),
    };
    if (
      Object.keys(limpio.principal).length > MAX_CARTAS_ZONA ||
      Object.keys(limpio.banquillo).length > MAX_CARTAS_ZONA
    ) {
      this.error.set('Demasiadas cartas distintas en el mazo');
      return;
    }
    const anterior = this.mazos();
    this.mazos.set(ordenar([...anterior.filter((m) => m.id !== limpio.id), limpio]));
    this.encolar(
      () => this.store.write(uid, limpio),
      () => this.mazos.set(anterior),
    );
  }

  borrar(id: string): void {
    const uid = this.auth.user()?.uid;
    if (!uid) return;
    const anterior = this.mazos();
    this.mazos.set(anterior.filter((m) => m.id !== id));
    this.encolar(
      () => this.store.remove(uid, id),
      () => this.mazos.set(anterior),
    );
  }

  flush(): Promise<unknown> {
    return this.cola.catch(() => {});
  }

  private encolar(tarea: () => Promise<void>, deshacer: () => void): void {
    const sesion = this.sesion;
    this.cola = this.cola
      .catch(() => {})
      .then(tarea)
      .then(() => this.error.set(null))
      .catch((e: unknown) => {
        if (this.sesion === sesion) deshacer();
        this.error.set(`No se pudo guardar el mazo: ${mensaje(e)}`);
      });
  }
}

function ordenar(mazos: Mazo[]): Mazo[] {
  return [...mazos].sort((a, b) => b.actualizado.localeCompare(a.actualizado));
}

const mensaje = (e: unknown) => (e instanceof Error ? e.message : String(e));
