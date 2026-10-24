import { Injectable, signal } from '@angular/core';
import { collection, doc, getDoc, getDocs, setDoc } from 'firebase/firestore';
import { AppUser } from './auth.service';
import { DEMO, escribirDemo, leerDemo } from './demo';
import { db } from './firebase';

/**
 * Perfil público: lo que cualquier otro usuario ve de ti. `users/{uid}`.
 * Solo el nombre. Con registro abierto, el email lo leería cualquier desconocido,
 * así que no se guarda (y firestore.rules rechaza cualquier otro campo).
 */
export interface Profile {
  uid: string;
  displayName: string;
}

const CLAVE_DEMO = 'profiles';
/** El mismo límite que firestore.rules. */
const MAX_NOMBRE = 80;

@Injectable({ providedIn: 'root' })
export class UsersService {
  /** Todos los usuarios, para el selector de "ver colección de…". */
  readonly profiles = signal<readonly Profile[]>([]);
  readonly error = signal<string | null>(null);

  /**
   * Crea `users/{uid}` si no existe y refresca el nombre si ha cambiado en Google.
   * Se llama en cada arranque con sesión, no solo la primera vez: es una lectura y,
   * como mucho, una escritura, y así el perfil no se queda obsoleto.
   */
  async ensureProfile(user: AppUser): Promise<void> {
    // Sin nombre en Google no se usa el email como sustituto: sería publicarlo.
    const displayName = (user.displayName?.trim() || 'Sin nombre').slice(0, MAX_NOMBRE);
    try {
      if (DEMO) {
        const todos = leerDemo<Record<string, Profile>>(CLAVE_DEMO, {});
        todos[user.uid] = { uid: user.uid, displayName };
        escribirDemo(CLAVE_DEMO, todos);
        return;
      }
      const ref = doc(db, 'users', user.uid);
      const actual = (await getDoc(ref)).data();
      const alDia =
        actual?.['displayName'] === displayName && Object.keys(actual ?? {}).length === 1;
      if (alDia) return;
      // Sin merge a propósito: sobrescribe el documento entero y así borra cualquier campo
      // de una versión anterior (el email que guardaba cuando el acceso era por invitación).
      await setDoc(ref, { displayName });
    } catch (e) {
      // Sin perfil la app funciona: solo significa que los demás no ven tu nombre.
      this.error.set(e instanceof Error ? e.message : String(e));
    }
  }

  async loadProfiles(): Promise<void> {
    try {
      if (DEMO) {
        const todos = leerDemo<Record<string, Profile>>(CLAVE_DEMO, {});
        this.profiles.set(ordenar(Object.values(todos)));
        return;
      }
      const snap = await getDocs(collection(db, 'users'));
      this.profiles.set(
        ordenar(
          snap.docs.map((d) => ({
            uid: d.id,
            displayName: String(d.data()['displayName'] ?? 'Sin nombre'),
          })),
        ),
      );
      this.error.set(null);
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : String(e));
    }
  }

  profile(uid: string): Profile | undefined {
    return this.profiles().find((p) => p.uid === uid);
  }
}

function ordenar(perfiles: Profile[]): Profile[] {
  return [...perfiles].sort((a, b) => a.displayName.localeCompare(b.displayName));
}
