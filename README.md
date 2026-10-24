# Riftbound Collection

App para gestionar colecciones de Riftbound con precios de Cardmarket. Angular (PWA) en Netlify, login y datos en Firebase. Coste: 0 €.

## Estado: F2 terminada en código, pendiente de desplegar

- Registro y login con Google: entra cualquiera y la primera vez se crea su colección.
- Catálogo de todas las cartas (10 sets, Radiance incluido) con búsqueda y filtros.
- Ficha de carta con precio de Cardmarket, aviso cuando el precio es aproximado y botón para corregir el producto.
- Mi colección: copias normales y foil con +/−, valor total y aviso de las cartas que aún no tienen precio.
- Colección de los demás miembros del grupo, en solo lectura, desde el selector "Ver".

## Puesta en marcha (una sola vez, ~20 min)

### 1. Firebase
1. Crea un proyecto en https://console.firebase.google.com (sin Google Analytics; el plan gratuito Spark basta).
2. **Authentication → Sign-in method → Google**: actívalo.
3. **Firestore Database → Crear base de datos** → modo producción → región `europe-west1`. La región no se puede cambiar después.
4. **Firestore → Reglas**: pega el contenido de `firestore.rules` y publica. **Repite este paso cada vez que cambie ese fichero**: Netlify no publica las reglas.
5. **Configuración del proyecto → Tus apps → Web (`</>`)**: registra una app y copia el objeto `firebaseConfig` en `src/environments/firebase.config.ts`.

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
Abre la URL y entra con Google. Deberías llegar a "Mi colección" con el valor a 0,00 € y la fecha de los precios de Cardmarket debajo; si los precios fallan, sale un aviso rojo arriba. Añade una carta desde el catálogo, recarga y comprueba que sigue ahí: eso confirma que Firestore guarda. En el móvil, "Añadir a pantalla de inicio" instala la PWA.

## Desarrollo local
Mientras `firebase.config.ts` siga con `REEMPLAZAR` y abras la app en localhost, arranca en **modo demo**: el login entra sin cuenta. Fuera de localhost nunca se activa.

```bash
npm install         # necesita Node 22 o superior
npx netlify dev     # Angular + funciones en http://localhost:8888
npm test            # tests
```
`localhost` ya está autorizado en Firebase por defecto.

## Usuarios
El registro es abierto: cualquiera con cuenta de Google entra y se le crea su colección. Los demás usuarios ven su nombre y su colección en solo lectura; el email no se guarda en ningún sitio visible.

## Problemas conocidos
- **iPhone con la app instalada en la pantalla de inicio:** el popup de Google puede no abrirse dentro de la PWA. Si pasa, entra una vez desde Safari normal; la sesión se comparte. Si persiste, se cambia a login por redirección (requiere configurar el dominio de auth).

## Estructura
```
src/app/core/        servicios: auth, catálogo, colección, precios, valoración, correcciones
src/app/pages/       login, marco, mi colección, catálogo, ficha
src/app/ui/          piezas compartidas de interfaz
public/data/         catálogo y mapeo generados (npm run build:catalog)
netlify/functions/   prices.mts
firestore.rules      reglas de seguridad
tools/               generador del catálogo y del mapeo
```
