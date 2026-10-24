# Riftbound Collection — Informe de traspaso

Fecha: 24/10/2026. Estado: **F0 cerrada, F1 con código terminado y sin desplegar.**
Este documento recoge todo lo decidido y descubierto hasta ahora. Las secciones marcadas **[NO VERIFICADO]** son suposiciones que hay que comprobar antes de construir encima.

---

## 1. Qué es

App web y móvil (PWA) para gestionar colecciones de cartas de **Riftbound** (TCG de League of Legends), con precios de Cardmarket.

- **Usuarios:** 3 al inicio (Fran, Sans, Estela). Puede crecer. Acceso **solo por invitación**.
- **Cada usuario tiene su colección**, editable solo por él y **visible en solo lectura para el resto del grupo**.
- **Catálogo:** todas las cartas de todos los sets, en inglés.
- **Por carta:** cantidad normal y foil, precio de Cardmarket, imagen y texto traducido al español.
- **Entrada de cartas:** buscador, importar/exportar CSV (formato DotGG) y escáner con cámara.
- **Extras:** lista de deseos y mazos.
- **Restricciones duras:** uso personal, sin store, sin pagos, **coste 0 €**.

## 2. Stack y despliegue

| Pieza | Tecnología | Motivo |
|---|---|---|
| Front | Angular 22 (standalone, signals, control flow `@if`) + `@angular/pwa` | Stack del autor; una base de código para web y móvil |
| Hosting | Netlify (plan gratuito, créditos) | Gratis; si se agotan los créditos, pausa el sitio, nunca cobra |
| Funciones | Netlify Functions en TypeScript (`netlify/functions/*.mts`) | Proxy de Cardmarket (CORS) y caché |
| Login | Firebase Auth, proveedor Google | Gratis (plan Spark) |
| Datos de usuario | Firestore | Reglas de seguridad por usuario sin backend propio; no se pausa por inactividad |

Descartados y por qué:
- **.NET / SQL Server / SQLite:** Netlify no ejecuta .NET y no tiene disco persistente.
- **Netlify Blobs para los datos de usuario:** no tiene login ni permisos por usuario.
- **Supabase:** pausa el proyecto tras una semana sin uso.
- **Capacitor / store:** no se publica en tiendas; la PWA basta.
- **Netlify Identity:** obsoleto.

## 3. Estado actual del código

```
src/app/core/firebase.ts        initializeApp, auth, db
src/app/core/auth.service.ts    login Google, comprobación de invitación, MODO DEMO
src/app/core/guards.ts          allowedGuard, loginGuard
src/app/core/prices.service.ts  carga /api/prices en un signal
src/app/pages/login.page.ts     pantalla de login
src/app/pages/home.page.ts      pantalla de COMPROBACIÓN (sustituir en F2)
src/environments/firebase.config.ts   config web de Firebase (aún con REEMPLAZAR)
netlify/functions/prices.mts    GET /api/prices
netlify.toml                    build, publish, redirect SPA
firestore.rules                 reglas de seguridad
tools/generar_mapeo.py          prototipo del mapeo (Python, F0)
tools/mapping.json              mapeo de las 390 cartas de Fran
tools/mapeo_revision.csv        mapeo con confianza y motivo, para revisar
```

Verificado:
- `ng build` compila sin errores (≈205 KB transferidos, sobre todo Firebase).
- `prices.mts` probado con el price guide real: 1.862 productos, `0` convertido a `null`.
- Prototipo ejecutado en local con Playwright, escritorio y móvil, sin errores de consola.

**No verificado:** login real con Google, reglas de Firestore y despliegue en Netlify. Necesitan el proyecto de Firebase del usuario.

### Modo demo
`auth.service.ts` activa un modo demo **solo si** `firebaseConfig.apiKey === 'REEMPLAZAR'` **y** el host es `localhost`/`127.0.0.1`. En ese modo el login entra sin cuenta con un usuario `demo`. Fuera de localhost nunca se activa. Mantener esta condición doble al tocar el servicio. **Cuidado:** en modo demo no hay Firestore real, así que F2 necesitará un almacén falso (en memoria o `localStorage`) detrás de la misma interfaz, o el emulador de Firestore.

### Pendiente del usuario para cerrar F1
Lo describe paso a paso el README y la guía PDF: crear proyecto Firebase, activar Google, Firestore en `europe-west1`, publicar `firestore.rules`, crear `allowed/{email}` para los tres, rellenar `firebase.config.ts`, push a GitHub, importar en Netlify y **añadir el dominio de Netlify a los dominios autorizados de Firebase**.

## 4. Modelo de datos

### Firestore
```
allowed/{email-en-minúsculas}          { nombre }                 ← lista de invitados, solo se edita desde la consola
users/{uid}                            { displayName, email }     ← perfil público mínimo (crear al primer login, F2)
users/{uid}/collection/{cardId}        { normal, foil }
users/{uid}/wishlist/{cardId}          { qty, nota }
users/{uid}/decks/{deckId}             { nombre, leyenda, cartas: { [cardId]: qty } }
mappingOverrides/{cardId}              { idProduct, by, at }      ← correcciones de mapeo compartidas
```

Reglas (`firestore.rules`, ya escritas):
- `invited()` = sesión con email verificado y existe `allowed/{email.lower()}`.
- `allowed/{email}`: cada uno lee solo el suyo; nadie escribe desde la app.
- `users/{uid}/**`: leer si `invited()`; escribir si `invited()` y `uid == request.auth.uid`.
- `mappingOverrides/*`: leer y escribir si `invited()`.

Decisiones abiertas del modelo:
- **Un documento por carta** en `collection` es lo correcto para editar (+1/−1 sin reescribir todo), pero leer la colección de otro usuario cuesta 1 lectura por carta. Con 3 usuarios y ~400 cartas, el plan Spark (50.000 lecturas/día) sobra; si el grupo crece mucho, valorar un documento resumen por usuario.
- Añadir más adelante en `collection`: condición e idioma. El usuario no lo pidió; no implementar sin preguntar.

### Datos estáticos del catálogo (a construir en F2)
- `catalog.json`: cartas de todos los sets (de Riftcodex) con texto EN.
- `catalog_es.json`: texto ES por `cardId`.
- `mapping.json`: `cardId → { idProduct, confianza }`.

## 5. Fuentes de datos externas

### Cardmarket (precios y productos)
JSON públicos, sin login ni API key. **Riftbound es el juego 22.**
```
https://downloads.s3.cardmarket.com/productCatalog/productList/products_singles_22.json
https://downloads.s3.cardmarket.com/productCatalog/productList/products_nonsingles_22.json
https://downloads.s3.cardmarket.com/productCatalog/priceGuide/price_guide_22.json
```
- `products_singles`: `{ version, createdAt, products: [{ idProduct, name, idCategory, categoryName, idExpansion, idMetacard, dateAdded }] }`. Unas 1.750 entradas.
- `price_guide`: `{ version, createdAt, priceGuides: [{ idProduct, avg, low, trend, avg1, avg7, avg30, avg-foil, low-foil, trend-foil, avg1-foil, avg7-foil, avg30-foil }] }`.
- Se regenera **una vez al día** (madrugada). No existe precio "en tiempo real".
- **Normal y foil son el mismo `idProduct`**, con campos distintos. Encaja con las columnas Normal/Foil de DotGG.
- **`0` significa "sin datos", no 0 €.** Ya se convierte a `null` en la función. La UI debe mostrar "sin precio" y no sumarlo al total como 0 sin avisar.
- Los nombres usan coma: `Annie, Fiery`. DotGG y Riftcodex usan guion: `Annie - Fiery`.
- **No hay número de colección** en ningún campo. `idMetacard` agrupa todas las variantes de una carta.
- `www.cardmarket.com` bloquea clientes automáticos (Cloudflare). No hacer scraping.

IDs de expansión observados (24/10/2026):

| Set | idExpansion |
|---|---|
| Origins | 6286 |
| Proving Grounds | 6289 |
| Spiritforged | 6399 |
| Unleashed | 6491 |
| Vendetta | 6587 |
| Radiance | 6659 |
| Promos y extras | 6322, 6483, 6567, 6588, 6921, 6480, 6705, 6681 |

No codificar esta tabla a mano en la app: resolverla con Riftcodex (ver abajo).

### Riftcodex (catálogo, texto, imágenes)
API pública, sin auth. Base: `https://api.riftcodex.com`. Docs: https://riftcodex.com/docs
- `GET /cards?set_id=sfd&sort=collector_number&page=1&size=100` (máx. 100 por página)
- `GET /cards/name?exact=...` / `?fuzzy=...`
- `GET /cards/riftbound/{id}` (p. ej. `ogn-179`, parcial e insensible a mayúsculas)
- `GET /cards/search?query=...` (texto completo)
- Sets: búsqueda por set ID, TCGPlayer ID o **Cardmarket ID** **[NO VERIFICADO: ruta exacta y formato]**.
- Campos de carta: `name`, `id`, `riftbound_id` (`ogn-179-298`), `public_code` (`OGN-179/298`), `collector_number`, `attributes {energy, might, power}`, `classification {type, supertype, rarity, domain[]}`, `text {rich, plain}`, `set {set_id, label}`, `media {image_url, artist, accessibility_text}`, `tags`, `orientation`, `metadata {alternate_art, overnumbered, signature}`, `tcgplayer_id`.
- **No tiene ID de Cardmarket ni idioma.**
- **[NO VERIFICADO]** formato de la respuesta paginada (envoltorio, total, siguiente página). Comprobar con una petición real antes de escribir el cliente.
- Descubierto: Riftcodex tiene **1** "Azir - Sovereign" (`sfd-177-221`) y Cardmarket tiene **2** productos con ese nombre en Spiritforged. Las fuentes no coinciden en el número de variantes.
- Es un proyecto de fans: guardar el catálogo generado en el repo para no depender de que la API siga viva.

### Formato DotGG (Riftatlas y Riftbound.gg)
Importador de Riftatlas confirmado; acepta tres formatos:
1. DotGG: `CardId,Normal,Foil,Name,Set` (Set opcional). Ej.: `OGN-001,1,0,"Blazing Scorcher","Origins"`.
2. Collectr: `Portfolio Name, Category, Set, Product Name, Card Number ('001/298'), Rarity, Variance (Normal/Foil), ..., Quantity`.
3. Legacy: `Normal Count, Foil Count, Card ID`.

**Exportar en formato DotGG.** El CSV real de Fran (`collection1.csv`, 390 filas, 6 sets) usa estas convenciones de ID, **incoherentes entre sí**:

| Patrón | Ejemplo | Significado |
|---|---|---|
| base | `OGN-042`, `SFD-R01` (runa), `SFD-T01` (token) | carta normal |
| sufijo minúscula | `OGN-089a`, `OGN-089b`, `SFD-R03a` | variante; `b` puede ser promo |
| sufijo mayúscula | `RAD-114A`, `SFD-110A` | variante (¿alt art?) |
| `-P` | `OGS-004-P`, `VEN-037-P` | promo Nexus Night |

La promo de Nexus Night de Origins es `OGN-089b` (con "Promo" en el nombre), y las de Spiritforged/Vendetta usan `-P`. **[NO VERIFICADO]** si `a` y `A` significan lo mismo.

## 6. Mapeo cardId → idProduct (el núcleo del proyecto)

No existe una fuente que una el número de colección con el producto de Cardmarket. El mapeo es heurístico.

Algoritmo actual (`tools/generar_mapeo.py`, portar a TypeScript):
1. Normalizar nombre: minúsculas, `' - '` → `', '`, quitar `(…)` y `Starter`, quitar puntuación excepto `,` y `/`.
2. Candidatos = productos con el mismo nombre normalizado.
3. Sin candidatos → sin mapear (son tokens, que no se venden sueltos).
4. Sufijo `-P` o "Promo" en el nombre → candidato único en expansiones de promos, si no, sin mapear.
5. Sufijo `a`/`A` → la **segunda** variante más barata del set principal.
6. Sin sufijo:
   - 1 producto en el set principal → confianza alta.
   - varios → **el más barato** (normal + foil) es la base. Confianza alta si el siguiente cuesta ≥ 3×; si no, baja.
   - 0 en el set principal y 1 en total → confianza media.

**Clave descubierta:** las variantes tienen **el mismo nombre exacto** y el orden de `idProduct` **no es fiable** (en las runas de Spiritforged está invertido respecto a Origins). La única señal útil es el precio: la base es la más barata. Ojo: Radiance y sets recién salidos tienen la versión normal sin `trend`; ordenar por normal + foil, no solo por normal.

Resultado con las 390 cartas de Fran: **371 alta, 8 media, 6 baja, 5 sin mapear** (4 tokens + `OGN-089b`). Valor ≈ 320 € (infravalorado: 14 cartas de Radiance sin precio normal todavía). Validado a mano: `SFD-198 Arise!` → `866945`, coincide con la web de Cardmarket.

Consecuencia de diseño, **aceptada por el usuario**: los errores posibles son por construcción entre variantes de precio parecido, o sea baratos. No se pide revisión manual. En su lugar:
- Mostrar confianza baja como "precio aproximado".
- Botón en la ficha de carta para elegir otro producto de Cardmarket entre los candidatos. Se guarda en `mappingOverrides/{cardId}`, vale para todos y tiene prioridad sobre el cálculo.

## 7. Sets nuevos sin intervención manual

Requisito del usuario: la app debe incorporar sola cada set nuevo.

Recomendación: **GitHub Action diaria** (gratis) que:
1. Descarga `products_singles_22.json` y el catálogo de Riftcodex.
2. Regenera `catalog.json` y `mapping.json`.
3. **Hace commit solo si hay cambios**, lo que dispara un despliegue en Netlify.

Por qué no una Netlify Scheduled Function: no puede hacer commit en el repo y tiene límite de tiempo. Los precios **no** van en la Action; siguen saliendo de `/api/prices` con caché, porque cambian a diario y cada commit gasta créditos de build de Netlify.

La traducción de un set nuevo **no** puede ser automática y gratuita a la vez (las APIs de traducción con calidad cuestan dinero o exigen tarjeta). Mientras no haya traducción, la carta se muestra en inglés con un aviso. Traducir cada set nuevo en una sesión de Claude Code con el glosario.

## 8. Plan por fases

Cada fase termina desplegada y usable. No empezar la siguiente sin cumplir el criterio de salida.

### F0 — Datos ✅
Mapeo validado contra el CSV real.

### F1 — Esqueleto y despliegue (código ✅, despliegue pendiente del usuario)
**Salida:** URL de Netlify, los tres entran con Google, un email no invitado se queda fuera, `/api/prices` responde.

### F2 — Catálogo, buscador y colección ← SIGUIENTE
1. Script `tools/build-catalog.ts` (Node, sin Python): Riftcodex + Cardmarket → `public/data/catalog.json` + `mapping.json`. Portar el algoritmo de la sección 6. Test con `collection1.csv`: debe reproducir 371/8/6/5.
2. Servicio de catálogo: carga los JSON, índice por `cardId`, búsqueda por nombre y código.
3. Servicio de colección sobre Firestore (y almacén falso en modo demo), con la misma interfaz.
4. Al primer login, crear `users/{uid}` con nombre y email.
5. Pantallas: catálogo con imágenes y filtros (set, rareza, dominio, tipo) · ficha de carta con precio normal/foil, confianza del mapeo y botón de corregir · "Mi colección" con valor total y aviso de cartas sin precio · +/− normal y foil con guardado inmediato y optimista.
6. Selector "ver colección de…" para Sans y Estela, en solo lectura.
**Salida:** Fran gestiona su colección entera desde el móvil.

### F3 — Importar / exportar
Import DotGG (y Collectr y Legacy si es barato), con informe de filas no reconocidas. Export DotGG. **Salida:** importar `collection1.csv` y exportarlo da el mismo contenido.

### F4 — Traducción al español
Primero un glosario fijo de términos del juego (keywords, tipos, dominios), luego todos los textos usando el glosario, revisados. `catalog_es.json`. Selector EN/ES. No hay edición oficial en español; Riot ha anunciado primero el francés.

### F5 — Lista de deseos
Cartas que faltan, coste total en Cardmarket y **quién del grupo tiene copias** de cada una.

### F6 — Mazos
Crear mazos; validación básica (leyenda, 40 cartas en el mazo principal, runas, 3 campos de batalla; comprobar reglas oficiales antes de codificarlas); qué falta respecto a tu colección, cuánto cuesta completarlo y enviar lo que falta a la lista de deseos.

### F7 — Escáner (el último y más arriesgado)
OCR en el navegador (p. ej. Tesseract.js) del código impreso abajo a la izquierda de la carta, con formato `SFD • 198/221`. Riesgos: foils, reflejos, letra muy pequeña. Si no es fiable, limitarlo a sugerir candidatos. El buscador cubre lo mismo.

## 9. Riesgos y avisos

- **Cuotas gratuitas:** Netlify pausa el sitio si se agotan los 300 créditos/mes; vigilar bucles que llamen a funciones. Firestore Spark: 50k lecturas y 20k escrituras al día.
- **iOS:** con la PWA instalada, `signInWithPopup` puede fallar. Plan B: `signInWithRedirect`, que requiere configurar el dominio de auth.
- **Términos:** la app es gratuita y privada. Antes de abrirla a gente fuera del grupo, revisar los términos de Cardmarket sobre sus datos y la política de contenido de fans de Riot (imágenes y textos son de Riot).
- **Riftcodex** es de fans y puede desaparecer: el catálogo vive en el repo.
- **Precios del día, no del minuto.** La web de Cardmarket mostrará cifras algo distintas a lo largo del día. Es esperado.

## 10. Sobre el usuario y cómo trabajar con él

- Fran es desarrollador fullstack (.NET, Angular, TypeScript, SQL Server). Domina Angular y TS; **Python solo lo usa asistido**, así que las herramientas nuevas deben ir en TypeScript/Node.
- Quiere crítica directa: señalar el problema principal primero, sin rodeos; corregir premisas equivocadas; si una opción es claramente mejor, proponerla en vez de dejarle elegir.
- Español de España en la interfaz y en la comunicación.
- Los nombres de cartas, sets y keywords se quedan en inglés en el código y los datos.
