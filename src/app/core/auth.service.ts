import { Injectable, computed, signal } from '@angular/core';
import { GoogleAuthProvider, User, onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from './firebase';

export type AccessState = 'loading' | 'signed-out' | 'not-invited' | 'allowed';

@Injectable({ providedIn: 'root' })
export class AuthService {
  readonly user = signal<User | null>(null);
  readonly access = signal<AccessState>('loading');
  readonly displayName = computed(() => this.user()?.displayName ?? this.user()?.email ?? '');

  /** Se resuelve cuando Firebase ha determinado el estado inicial de la sesión. */
  readonly ready: Promise<void>;

  constructor() {
    this.ready = new Promise((resolve) => {
      onAuthStateChanged(auth, async (user) => {
        this.user.set(user);
        this.access.set(await this.resolveAccess(user));
        resolve();
      });
    });
  }

  /** Abre el popup de Google y devuelve si la cuenta está invitada. */
  async signIn(): Promise<AccessState> {
    const { user } = await signInWithPopup(auth, new GoogleAuthProvider());
    const access = await this.resolveAccess(user);
    this.user.set(user);
    this.access.set(access);
    return access;
  }

  async signOut(): Promise<void> {
    await signOut(auth);
  }

  /** Un usuario entra solo si existe un documento allowed/{email}. Las reglas de Firestore aplican lo mismo en servidor. */
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
