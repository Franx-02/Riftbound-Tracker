import { Injectable, signal } from '@angular/core';
import { collection, doc, getDoc, getDocs, setDoc } from 'firebase/firestore';
import { AppUser } from './auth.service';
import { DEMO, escribirDemo, leerDemo } from './demo';
import { db } from './firebase';

/** Perfil público mínimo: lo que el resto del grupo ve de ti. `users/{uid}`. */
export interface Profile {
  uid: string;
  displayName: string;
  email: string;
}

const CLAVE_DEMO = 'profiles';

@Injectable({ providedIn: 'root' })
export class UsersService {
  /** Los miembros del grupo, para el selector de "ver colección de…". */
  readonly profiles = signal<readonly Profile[]>([]);
  readonly error = signal<string | null>(null);

  /**
   * Crea `users/{uid}` si no existe y refresca el nombre si ha cambiado en Google.
   * Se llama en cada arranque con sesión válida, no solo la primera vez: es una
   * lectura y, como mucho, una escritura, y así el perfil no se queda obsoleto.
   */
  async ensureProfile(user: AppUser): Promise<void> {
    const perfil: Profile = {
      uid: user.uid,
      displayName: user.displayName ?? user.email ?? 'Sin nombre',
      email: user.email ?? '',
    };
    try {
      if (DEMO) {
        const todos = leerDemo<Record<string, Profile>>(CLAVE_DEMO, {});
        todos[perfil.uid] = perfil;
        escribirDemo(CLAVE_DEMO, todos);
        return;
      }
      const ref = doc(db, 'users', perfil.uid);
      const snap = await getDoc(ref);
      const actual = snap.data() as Omit<Profile, 'uid'> | undefined;
      if (actual?.displayName === perfil.displayName && actual?.email === perfil.email) return;
      await setDoc(ref, { displayName: perfil.displayName, email: perfil.email }, { merge: true });
    } catch (e) {
      // Sin perfil la app funciona: solo significa que los demás no ven tu nombre.
      this.error.set(e instanceof Error ? e.message : String(e));
    }
  }

  /** Lee el grupo entero. Las reglas solo lo permiten a usuarios invitados. */
  async loadProfiles(): Promise<void> {
    try {
      if (DEMO) {
        const todos = leerDemo<Record<string, Profile>>(CLAVE_DEMO, {});
        this.profiles.set(ordenar(Object.values(todos)));
        return;
      }
      const snap = await getDocs(collection(db, 'users'));
      this.profiles.set(
        ordenar(snap.docs.map((d) => ({ uid: d.id, ...(d.data() as Omit<Profile, 'uid'>) }))),
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
