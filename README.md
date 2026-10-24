# Riftbound Collection

App para gestionar colecciones de Riftbound con precios de Cardmarket. Angular (PWA) en Netlify, login y datos en Firebase. Coste: 0 €.

## Estado: F1 — esqueleto desplegable

- Login con Google, acceso solo por invitación.
- Reglas de Firestore: cada invitado lee las colecciones de todos y escribe solo la suya.
- `/api/prices`: función de Netlify que sirve el price guide de Cardmarket (Riftbound, juego 22) con caché.
- La pantalla principal es de comprobación: confirma que login y precios funcionan en producción.

## Puesta en marcha (una sola vez, ~20 min)

### 1. Firebase
1. Crea un proyecto en https://console.firebase.google.com (sin Google Analytics; el plan gratuito Spark basta).
2. **Authentication → Sign-in method → Google**: actívalo.
3. **Firestore Database → Crear base de datos** → modo producción → región `europe-west`.
4. **Firestore → Reglas**: pega el contenido de `firestore.rules` y publica.
5. **Firestore → Datos**: crea la colección `allowed` con un documento por invitado. El **ID del documento es el email en minúsculas** (p. ej. `tuemail@gmail.com`); el contenido da igual (pon un campo `nombre`). Uno para ti, otro para Sans y otro para Estela.
6. **Configuración del proyecto → Tus apps → Web (`</>`)**: registra una app y copia el objeto `firebaseConfig` en `src/environments/firebase.config.ts`.

### 2. GitHub
```bash
# el repo ya viene inicializado con el primer commit; crea un repo vacío en GitHub y:
git remote add origin git@github.com:<usuario>/riftbound-app.git
git push -u origin main
```

### 3. Netlify
1. **Add new site → Import an existing project → GitHub** → elige el repo. Netlify lee `netlify.toml`; no cambies nada.
2. Cuando termine el despliegue, copia la URL (`https://<nombre>.netlify.app`).
3. En Firebase: **Authentication → Settings → Authorized domains → Add domain** → pega ese dominio (sin `https://`). Sin este paso, el login falla.

### 4. Comprobar
Abre la URL, entra con Google. Deberías ver "Login e invitación: correctos" y el número de productos de Cardmarket. En el móvil, "Añadir a pantalla de inicio" instala la PWA.

## Desarrollo local
Mientras `firebase.config.ts` siga con `REEMPLAZAR` y abras la app en localhost, arranca en **modo demo**: el login entra sin cuenta. Fuera de localhost nunca se activa.

```bash
npm install
npx netlify dev     # Angular + funciones en http://localhost:8888
```
`localhost` ya está autorizado en Firebase por defecto.

## Dar acceso a alguien nuevo
Añade un documento en `allowed` con su email. No hace falta redesplegar.

## Problemas conocidos
- **iPhone con la app instalada en la pantalla de inicio:** el popup de Google puede no abrirse dentro de la PWA. Si pasa, entra una vez desde Safari normal; la sesión se comparte. Si persiste, se cambia a login por redirección (requiere configurar el dominio de auth).

## Estructura
```
src/app/core/        firebase, auth, guards, precios
src/app/pages/       login, inicio
netlify/functions/   prices.mts
firestore.rules      reglas de seguridad
tools/               mapeo Cardmarket (F0): script y resultado
```
