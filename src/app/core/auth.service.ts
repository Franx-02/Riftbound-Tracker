import { Injectable, computed, inject, signal } from '@angular/core';
import {
  GoogleAuthProvider,
  User,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
} from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { DEMO } from './demo';
import { auth, db } from './firebase';
import { UsersService } from './users.service';

export type AccessState = 'loading' | 'signed-out' | 'not-invited' | 'allowed';

export interface AppUser {
  uid: string;
  email: string | null;
  displayName: string | null;
}

const DEMO_KEY = 'riftbound-demo-user';
const DEMO_USER: AppUser = { uid: 'demo', email: 'demo@localhost', displayName: 'Fran (demo)' };

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly users = inject(UsersService);
  readonly user = signal<AppUser | null>(null);
  readonly access = signal<AccessState>('loading');
  readonly displayName = computed(() => this.user()?.displayName ?? this.user()?.email ?? '');
  readonly demo = DEMO;

  /** Se resuelve cuando se conoce el estado inicial de la sesión. */
  readonly ready: Promise<void>;

  constructor() {
    if (DEMO) {
      const signedIn = sessionStorage.getItem(DEMO_KEY) === '1';
      this.aplicar(signedIn ? DEMO_USER : null, signedIn ? 'allowed' : 'signed-out');
      this.ready = Promise.resolve();
      return;
    }
    this.ready = new Promise((resolve) => {
      onAuthStateChanged(auth, async (user) => {
        const appUser = user ? toAppUser(user) : null;
        this.aplicar(appUser, await this.resolveAccess(user));
        resolve();
      });
    });
  }

  /** Abre el popup de Google y devuelve si la cuenta está invitada. */
  async signIn(): Promise<AccessState> {
    if (DEMO) {
      sessionStorage.setItem(DEMO_KEY, '1');
      this.aplicar(DEMO_USER, 'allowed');
      return 'allowed';
    }
    const { user } = await signInWithPopup(auth, new GoogleAuthProvider());
    const access = await this.resolveAccess(user);
    this.aplicar(toAppUser(user), access);
    return access;
  }

  /**
   * Único sitio donde se fija el estado de sesión. En cuanto hay acceso se crea o
   * refresca `users/{uid}`, que es lo que hace que los demás te vean en el grupo.
   * No se espera a que termine: si falla, la app sigue y el error queda en UsersService.
   */
  private aplicar(user: AppUser | null, access: AccessState): void {
    this.user.set(user);
    this.access.set(access);
    if (user && access === 'allowed') void this.users.ensureProfile(user);
  }

  async signOut(): Promise<void> {
    if (DEMO) {
      sessionStorage.removeItem(DEMO_KEY);
      this.user.set(null);
      this.access.set('signed-out');
      return;
    }
    await signOut(auth);
  }

  /** Un usuario entra solo si existe allowed/{email}. Las reglas de Firestore aplican lo mismo en servidor. */
  private async resolveAccess(user: User | null): Promise<AccessState> {
    if (!user?.email) return 'signed-out';
    try {
      const snap = await getDoc(doc(db, 'allowed', user.email.toLowerCase()));
      return snap.exists() ? 'allowed' : 'not-invited';
    } catch {
      // Las reglas deniegan la lectura a quien no está invitado.
      return 'not-invited';
    }
  }
}

function toAppUser(user: User): AppUser {
  return { uid: user.uid, email: user.email, displayName: user.displayName };
}
