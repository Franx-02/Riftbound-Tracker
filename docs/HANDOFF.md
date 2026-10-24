# Riftbound Collection — Informe de traspaso

Fecha: 24/10/2026. Estado: **F0 cerrada, F1 con código terminado y sin desplegar, F2 empezada (paso 1 hecho).**
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
src/app/core/catalog.service.ts F2 paso 2: catálogo en memoria, búsqueda y filtros
src/app/core/demo.ts            flag DEMO (condición doble, único sitio) y helpers de localStorage
src/app/core/collection.service.ts  F2 paso 3: colección con almacén Firestore o demo, +/− optimista
src/app/core/users.service.ts   F2 paso 4: perfil users/{uid} y lista del grupo
src/app/core/collection.service.spec.ts  tests (vitest + jsdom, `npm test`)
src/app/pages/home.page.ts      pantalla de COMPROBACIÓN (sustituir en F2)
src/environments/firebase.config.ts   config web de Firebase (aún con REEMPLAZAR)
netlify/functions/prices.mts    GET /api/prices
netlify.toml                    build, publish, redirect SPA
firestore.rules                 reglas de seguridad
tools/generar_mapeo.py          prototipo del mapeo (Python, F0; sustituido, se puede borrar)
tools/mapping.json              mapeo de las 390 cartas de Fran (F0, obsoleto)
tools/mapeo_revision.csv        mapeo con confianza y motivo, para revisar
tools/build-catalog.mts         F2 paso 1: genera el catálogo y el mapeo completos
tsconfig.tools.json             typecheck de tools/ (`npm run check:tools`)
public/data/catalog.json        1.638 cartas de 10 sets (generado, va al repo)
public/data/mapping.json        cardId → idProduct, confianza, motivo y candidatos
```

**Node 22 o superior es obligatorio en local.** El CLI de Angular 22 rechaza Node 20 y
`npm run build` ni `npm test` arrancan. `netlify.toml` ya fija `NODE_VERSION = "22"` para el despliegue.
`npm run build:catalog` sí funciona con Node 20.

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
- `catalog.json`: cartas de todos los sets (de RiftHunt) con texto EN. **Ya generado.**
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
- Los nombres usan coma: `Annie, Fiery`, igual que RiftHunt. DotGG usa guion: `Annie - Fiery`.
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

Esta tabla **no está codificada** en ninguna parte: `build-catalog.mts` la deduce sola
cruzando los nombres del catálogo con los de Cardmarket (ver sección 6). Queda aquí solo
como referencia para depurar.

### RiftHunt — fuente del catálogo (verificado 24/10/2026)
API pública, sin auth, CORS abierto. Base: `https://api.rifthunt.com`. Docs: https://rifthunt.com/api/
- `GET /bulk/cards` → `{ fetched, sets[], cards[] }`, un único fichero con **todo** (1,5 MB, 1.702 impresiones).
- También `GET /sets`, `/sets/:code`, `/cards/search?q=`, `/cards/named?exact=`, `/cards/:id`, `/bulk/prices` (precios de TCGplayer, no se usan).
- Campos por carta: `riftboundId` (`rad-114-167`), `name`, `cleanName`, `num`, `energy`, `might`, `power`, `type`, `supertype`, `rarity`, `domains[]`, `text`, `rich`, `flavour`, `set`, `setName`, `tags[]`, `artist`, `tcgId`, `imgUrl`, `orientation`, `alt`, `sig`, `over`.
- Dice `"source": "riftcodex.com"`, pero su copia es **más completa** que la API de Riftcodex en vivo.
- Repite algunas impresiones de promos (OPP): hay que deduplicar por `riftboundId`.
- Es una instantánea con fecha (`fetched`), no datos en vivo: la del 24/10/2026 era del 19/10.

**Por qué no Riftcodex directamente (comprobado con peticiones reales el 24/10/2026):**
su API en vivo **no tiene Radiance** (`/cards?set_id=RAD` devuelve 0, `/sets` no lo lista,
`/sets/cardmarket/6659` da error 500), y le faltan las runas y los tokens de Spiritforged.
De las 390 cartas de Fran, Riftcodex cubre **279**; RiftHunt cubre **385**. Radiance salió el
**23/10/2026**, un día antes de esta sesión, y Fran ya tiene 99 cartas del set: una fuente que
tarde días en incorporar un set nuevo no sirve para el requisito de la sección 7.

### Riftcodex (alternativa, no se usa)
API pública, sin auth. Base: `https://api.riftcodex.com`. Docs: https://riftcodex.com/docs
- `GET /cards?set_id=sfd&sort=collector_number&page=1&size=100` (máx. 100 por página)
- `GET /cards/name?exact=...` / `?fuzzy=...`
- `GET /cards/riftbound/{id}` (p. ej. `ogn-179`, parcial e insensible a mayúsculas)
- `GET /cards/search?query=...` (texto completo)
- `GET /sets` devuelve `cardmarket_id` por set (a veces `null`, a veces una lista). Rutas: `/sets/set-id/{id}`, `/sets/tcgplayer/{id}`, `/sets/cardmarket/{id}`. Hay `openapi.json` en la raíz.
- Respuesta paginada: `{ items[], total, page, size, pages }` (verificado).
- No existe `public_code` en la respuesta real; sí `riftbound_id`.
- Campos de carta: `name`, `id`, `riftbound_id` (`ogn-179-298`), `public_code` (`OGN-179/298`), `collector_number`, `attributes {energy, might, power}`, `classification {type, supertype, rarity, domain[]}`, `text {rich, plain}`, `set {set_id, label}`, `media {image_url, artist, accessibility_text}`, `tags`, `orientation`, `metadata {alternate_art, overnumbered, signature}`, `tcgplayer_id`.
- **No tiene ID de Cardmarket ni idioma.**
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

La promo de Nexus Night de Origins es `OGN-089b` (con "Promo" en el nombre), y las de Spiritforged/Vendetta usan `-P`.

**Resuelto (24/10/2026): `a` y `A` son lo mismo.** En el catálogo el sufijo va siempre en
minúscula dentro de `riftboundId` (`sfd-110a-221`) y corresponde a `alternate_art`. DotGG lo
escribe indistintamente, así que `build-catalog.mts` guarda el `cardId` **en mayúsculas**
(`SFD-110A`) y todas las búsquedas comparan en mayúsculas.

**5 IDs de DotGG no existen en el catálogo** y hay que resolverlos con una tabla de alias en F3:
`OGN-089b` y `OGS-004-P`, `VEN-037-P` (promos Nexus Night, que en el catálogo viven en los sets
OPP/PR con otra numeración) y `SFD-T01`, `SFD-T02` (tokens de doble cara, que no están ni en el
catálogo ni en Cardmarket).

## 6. Mapeo cardId → idProduct (el núcleo del proyecto)

No existe una fuente que una el número de colección con el producto de Cardmarket. El mapeo es heurístico.

Algoritmo (`tools/build-catalog.mts`, ya en TypeScript; el `.py` queda solo de referencia):

**Paso previo — qué expansión de Cardmarket es cada set, sin tabla a mano.** Para cada par
(set, expansión) se calcula un solape tipo Jaccard: nombres compartidos ÷ (cartas del set +
productos de la expansión − compartidos). Un set normal da **0,95 o más** con su expansión
(OGN·6286 = 0,97, RAD·6659 = 0,95, SFD·6399 = 1,01) y como mucho 0,28 con cualquier otra, así
que se corta en 0,5. Los sets de promos (OPP, PR, JDG) no tienen expansión propia: ninguno
llega al corte y se quedan con todas las que pasen de 0,1. Esto es lo que hace que un set
nuevo entre solo (sección 7). **Sin este filtro el mapeo se degrada mucho**: dejando pasar las
expansiones de promos como candidatas, las bajas pasan de 6 a 24.

**El mapeo se hace por grupos, no carta a carta.** Esto es lo más importante del algoritmo
y el prototipo de F0 no lo hacía. Dentro de un set puede haber **varias cartas distintas con
el mismo nombre exacto**: en Origins, Kai'Sa es la unidad `OGN-247`, la leyenda `OGN-299` y
la leyenda firmada `OGN-299*`, y Cardmarket tiene un producto para cada una, los tres con el
nombre `Kai'Sa, Daughter of the Void` (0,32 € · 95 € · 1.100 €). Decidiendo carta a carta,
las tres se llevaban el producto más barato.

1. Normalizar nombre: minúsculas, `' - '` → `', '`, quitar `(…)` y `Starter`, quitar puntuación excepto `,` y `/`.
2. Agrupar las cartas del catálogo por **set + nombre normalizado**. Candidatos = productos con ese mismo nombre.
3. Sin candidatos → sin mapear (son tokens, que no se venden sueltos).
4. Las promos de un set normal (`SFD-R03B`, Nexus Night) salen del grupo: no se venden en la expansión del set sino en las de promos, así que se les asigna el candidato más barato de **fuera** del set (media si solo había uno, baja si varios). En los sets que son de promos enteros (OPP, PR, JDG) no se separa nada: allí la promo es la carta normal.
5. Ordenar las cartas del grupo de más barata a más cara (ver abajo) y los productos del set por precio, y **emparejarlos uno a uno en ese orden**.
   - Si las dos listas miden lo mismo: alta si el grupo es de una sola carta o si cada escalón de precio multiplica por 3 o más al anterior; media si los precios están juntos.
   - Si no cuadran: se empareja lo que se puede con confianza baja y el resto queda sin mapear.

**Orden de las variantes** (`ordenVariante`): normal → alt art → Showcase → Signature, y dentro
de cada nivel por número de colección. **Ordenar solo por número no vale**: las cartas
especiales llevan numeración propia y empiezan otra vez por 1, así que `RAD-SP2` (la Showcase
de Akali, 28,30 €) se colocaba antes que `RAD-015` (la Rare normal, 0,57 €) y se intercambiaban
los precios.

**Clave descubierta:** las variantes tienen **el mismo nombre exacto** y el orden de `idProduct` **no es fiable** (en las runas de Spiritforged está invertido respecto a Origins). La única señal útil es el precio. Ojo: Radiance y sets recién salidos tienen la versión normal sin `trend`; ordenar por normal + foil, no solo por normal.

Resultado sobre **todo el catálogo** (1.638 cartas): **1.301 alta, 141 media, 170 baja, 26 sin mapear**,
y **cero colisiones** dentro de un mismo set (dos cartas del mismo set apuntando al mismo
producto). Con el algoritmo carta a carta había 183 colisiones y 75 sin mapear, entre ellas las
50 cartas **Signature**, que son las más caras del juego.

Resultado con las 390 cartas de Fran (`npm run build:catalog -- --check`):
**365 alta, 15 media, 3 baja, 2 sin mapear, 5 fuera del catálogo**. Valor ≈ 310 €
(infravalorado: 14 cartas sin precio en Cardmarket todavía). El producto elegido es **el mismo
que daba el prototipo de F0 en las 385 cartas**; lo que cambia son 20 etiquetas de confianza,
ahora más prudentes. Validado a mano: `SFD-198 Arise!` → `866945`, coincide con la web de
Cardmarket, y `OGN-299*` → `847500`, la Kai'Sa firmada de 1.100 €.

Consecuencia de diseño, **aceptada por el usuario**: los errores posibles son por construcción entre variantes de precio parecido, o sea baratos. No se pide revisión manual. En su lugar:
- Mostrar confianza baja como "precio aproximado".
- Botón en la ficha de carta para elegir otro producto de Cardmarket entre los candidatos. Se guarda en `mappingOverrides/{cardId}`, vale para todos y tiene prioridad sobre el cálculo.

## 7. Sets nuevos sin intervención manual

Requisito del usuario: la app debe incorporar sola cada set nuevo.

Recomendación: **GitHub Action diaria** (gratis) que:
1. Ejecuta `npm run build:catalog` (descarga RiftHunt y Cardmarket).
2. Comprueba con `-- --check` que el mapeo no se degrada.
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
1. ✅ `tools/build-catalog.mts`: RiftHunt + Cardmarket → `public/data/catalog.json` (1.638 cartas, 10 sets) + `mapping.json`. `npm run build:catalog -- --check` valida contra `collection1.csv` y da 371 altas, igual que F0.
2. ✅ `src/app/core/catalog.service.ts`: carga los dos JSON una sola vez, índice por `cardId` (siempre en mayúsculas), `search()` por nombre o código con orden de relevancia, `filter()` por set, rareza, dominio y tipo, y signals `rarities/types/domains` sacados del propio catálogo para montar los filtros sin listas a mano. El service worker ya cachea `/data/*.json`.
3. ✅ `CollectionService`: interfaz `CollectionStore` con dos implementaciones (Firestore y localStorage en demo). +/− optimista: pinta antes de guardar y deshace si falla. Escrituras en cola por carta, así que varios clics seguidos acaban en el último valor. Una carta a 0/0 borra su documento. Caché por uid que se vacía al cambiar de sesión. `view(uid)` muestra la colección de otro en solo lectura (base del paso 6).
4. ✅ `UsersService.ensureProfile`: `AuthService` la llama en cuanto hay acceso (en cada arranque, no solo el primero: refresca el nombre si cambió en Google y solo escribe si hay diferencia). `loadProfiles()` lista el grupo; las reglas actuales ya permiten ese `list` a invitados.
   - **Sin verificar contra Firestore real**: los tests corren sobre el almacén demo. Cuando exista el proyecto de Firebase, falta probarlo con el emulador o en el despliegue.
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
- **RiftHunt** y **Riftcodex** son proyectos de fans y pueden desaparecer: por eso el catálogo generado vive en el repo. RiftHunt además publica una instantánea con fecha, no datos en vivo: si deja de actualizarse, el síntoma será que un set nuevo no aparece.
- **Precios del día, no del minuto.** La web de Cardmarket mostrará cifras algo distintas a lo largo del día. Es esperado.

## 10. Sobre el usuario y cómo trabajar con él

- Fran es desarrollador fullstack (.NET, Angular, TypeScript, SQL Server). Domina Angular y TS; **Python solo lo usa asistido**, así que las herramientas nuevas deben ir en TypeScript/Node.
- Quiere crítica directa: señalar el problema principal primero, sin rodeos; corregir premisas equivocadas; si una opción es claramente mejor, proponerla en vez de dejarle elegir.
- Español de España en la interfaz y en la comunicación.
- Los nombres de cartas, sets y keywords se quedan en inglés en el código y los datos.
