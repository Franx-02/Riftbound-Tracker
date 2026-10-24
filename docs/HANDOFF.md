# Riftbound Collection — Informe de traspaso

Fecha: 24/10/2026. Estado: **F0 cerrada. F1 y F2 con el código terminado, probado en local en modo demo y sin desplegar.** El criterio de salida de las dos depende de que el usuario cree el proyecto de Firebase y despliegue en Netlify (sección 3).
Este documento recoge todo lo decidido y descubierto hasta ahora. Las secciones marcadas **[NO VERIFICADO]** son suposiciones que hay que comprobar antes de construir encima.

---

## 1. Qué es

App web y móvil (PWA) para gestionar colecciones de cartas de **Riftbound** (TCG de League of Legends), con precios de Cardmarket.

- **Usuarios:** 3 al inicio (Fran, Sans, Estela). **Registro abierto** desde el 24/10/2026, por decisión del usuario: entra cualquier cuenta de Google y la primera vez se crea su colección. Antes era solo por invitación (`allowed/{email}`); eso ya no existe.
- **Cada usuario tiene su colección**, editable solo por él y **visible en solo lectura para cualquier otro usuario**.
- Consecuencias aceptadas del registro abierto: cualquiera ve el nombre y la colección de los demás (el email no se publica); cualquiera puede cambiar las correcciones de precio compartidas; y la cuota gratuita de Firebase la comparte todo el que entre. **Pendiente del usuario:** revisar los términos de Cardmarket sobre sus datos y la política de contenido de fans de Riot, que el traspaso pedía revisar antes de abrir la app a gente de fuera del grupo.
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
src/app/core/auth.service.ts    login (y registro) con Google, MODO DEMO
src/app/core/guards.ts          signedInGuard, loginGuard
src/app/core/prices.service.ts  carga /api/prices en un signal
src/app/pages/login.page.ts     pantalla de login
src/app/core/catalog.service.ts F2 paso 2: catálogo en memoria, búsqueda y filtros
src/app/core/demo.ts            flag DEMO (condición doble, único sitio) y helpers de localStorage
src/app/core/collection.service.ts  F2 paso 3: colección con almacén Firestore o demo, +/− optimista
src/app/core/users.service.ts   F2 paso 4: perfil users/{uid} y lista del grupo
src/app/core/collection.service.spec.ts  tests (vitest + jsdom, `npm test`)
src/app/core/mapping-overrides.service.ts  correcciones de mapeo compartidas (mappingOverrides/{cardId})
src/app/core/valuation.service.ts  une catálogo, mapeo, correcciones y precios; valora una colección
src/app/pages/shell.component.ts   barra, navegación y carga de datos compartidos
src/app/pages/collection.page.ts   Mi colección (ruta /coleccion, la de inicio)
src/app/pages/catalog.page.ts      catálogo con filtros (/catalogo)
src/app/pages/card.page.ts         ficha de carta (/carta/:cardId)
src/app/ui/                        pipes eur/thumb, +/−, aviso de confianza, texto de reglas
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

`netlify.toml` tiene un bloque `[dev]` con los puertos fijos (Angular 4200, Netlify 8888). Hace falta: Angular antepone la variable de entorno `PORT` a `--port`, y si `PORT` está definida `ng serve` ocupa el puerto de Netlify y `/api/prices` deja de existir en local.

Verificado:
- `ng build` compila sin errores (≈205 KB transferidos, sobre todo Firebase).
- `prices.mts` probado con el price guide real: 1.862 productos, `0` convertido a `null`.
- Prototipo ejecutado en local con Playwright, escritorio y móvil, sin errores de consola.

**No verificado:** login real con Google, reglas de Firestore y despliegue en Netlify. Necesitan el proyecto de Firebase del usuario.

### Modo demo
`auth.service.ts` activa un modo demo **solo si** `firebaseConfig.apiKey === 'REEMPLAZAR'` **y** el host es `localhost`/`127.0.0.1`. En ese modo el login entra sin cuenta con un usuario `demo`. Fuera de localhost nunca se activa. Mantener esta condición doble al tocar el servicio. **Cuidado:** en modo demo no hay Firestore real, así que F2 necesitará un almacén falso (en memoria o `localStorage`) detrás de la misma interfaz, o el emulador de Firestore.

### Pendiente del usuario para cerrar F1
Lo describe paso a paso el README y la guía PDF: crear proyecto Firebase, activar Google, Firestore en `europe-west1`, publicar `firestore.rules`, rellenar `firebase.config.ts`, push a GitHub, importar en Netlify y **añadir el dominio de Netlify a los dominios autorizados de Firebase**.

## 4. Modelo de datos

### Firestore
```
users/{uid}                            { displayName }            ← perfil público: SOLO el nombre (lo lee cualquiera)
users/{uid}/collection/{cardId}        { normal, foil, alias? }   ← alias = id original de DotGG (F3)
users/{uid}/wishlist/{cardId}          { qty, nota }
users/{uid}/decks/{deckId}             { nombre, leyenda, cartas: { [cardId]: qty } }
mappingOverrides/{cardId}              { idProduct, by, at }      ← correcciones de mapeo compartidas
```

Reglas (`firestore.rules`):
- `signedIn()` = sesión con email verificado (las cuentas de Google lo están siempre).
- `users/{uid}`: leer si `signedIn()`; escribir solo el dueño, y solo el campo `displayName` (texto de 1 a 80).
- `users/{uid}/collection/{cardId}`: leer si `signedIn()`; escribir solo el dueño, solo `normal` y `foil`, enteros de 0 a 9999.
- `mappingOverrides/{cardId}`: leer y escribir si `signedIn()`; solo `idProduct` (entero), `by` y `at` (textos cortos).
- **Lo que no aparece en las reglas se deniega.** `wishlist` y `decks` necesitarán su regla en F5 y F6.
- Las reglas validan la forma de los documentos porque escribe cualquiera: así nadie guarda basura ni documentos enormes que gasten la cuota gratuita.

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

**5 IDs de DotGG no existen en el catálogo.** Resuelto en F3 sin tabla a mano (`src/app/core/csv.ts`):
- `OGN-089b` → `OPP-089B` y `OGS-004-P` → `OPP-004`: las promos de Nexus Night viven en el set OPP
  con el mismo número. Regla genérica: un id desconocido que es promo (sufijo `-P` o `b`, o "Promo" en
  el nombre) se enlaza con `OPP-<número><sufijo>` **solo si el nombre coincide**. La carta se guarda
  con el id del catálogo (así tiene imagen y precio) y con un campo `alias` que conserva el id de
  DotGG, para que la exportación devuelva el fichero tal como entró.
- `VEN-037-P` (no hay versión promo de Barbara en el catálogo) y `SFD-T01`, `SFD-T02` (tokens) se
  guardan con su id tal cual. Salen en Mi colección como "fuera del catálogo" y se exportan igual.

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
**Salida:** URL de Netlify, cualquiera entra con Google y se le crea su colección, `/api/prices` responde.

### F2 — Catálogo, buscador y colección (código ✅, salida pendiente del despliegue)
1. ✅ `tools/build-catalog.mts`: RiftHunt + Cardmarket → `public/data/catalog.json` (1.638 cartas, 10 sets) + `mapping.json`. `npm run build:catalog -- --check` valida contra `collection1.csv` y da 371 altas, igual que F0.
2. ✅ `src/app/core/catalog.service.ts`: carga los dos JSON una sola vez, índice por `cardId` (siempre en mayúsculas), `search()` por nombre o código con orden de relevancia, `filter()` por set, rareza, dominio y tipo, y signals `rarities/types/domains` sacados del propio catálogo para montar los filtros sin listas a mano. El service worker ya cachea `/data/*.json`.
3. ✅ `CollectionService`: interfaz `CollectionStore` con dos implementaciones (Firestore y localStorage en demo). +/− optimista: pinta antes de guardar y deshace si falla. Escrituras en cola por carta, así que varios clics seguidos acaban en el último valor. Una carta a 0/0 borra su documento. Todo se vacía al cambiar de sesión.
   - **`cards` es siempre la colección propia**, la que pintan y editan el catálogo, la ficha y los +/−. Las ajenas van aparte: `loadOther(uid)` las lee en solo lectura y las cachea para la sesión, y `other(uid)` las devuelve. Así mirar la de otro no cambia lo que ves en el resto de la app, y F5 (quién del grupo tiene cada carta) puede leer varias a la vez.
4. ✅ `UsersService.ensureProfile`: `AuthService` la llama en cuanto hay acceso (en cada arranque, no solo el primero: refresca el nombre si cambió en Google y solo escribe si hay diferencia). `loadProfiles()` lista a todos los usuarios. El perfil guarda solo el nombre: con registro abierto el email lo leería cualquiera. Se escribe sin `merge`, así que borra el email que guardaban las versiones anteriores.
   - **Sin verificar contra Firestore real**: los tests corren sobre el almacén demo. Cuando exista el proyecto de Firebase, falta probarlo con el emulador o en el despliegue.
5. ✅ Pantallas, probadas en el navegador (escritorio y móvil) con las 390 cartas de collection1.csv cargadas en el almacén demo. Valor total 309,71 €, igual que el generador.
   - **Catálogo**: búsqueda, filtros por set, rareza, dominio y tipo, "solo las que tengo", carga de 60 en 60 al hacer scroll. El set más reciente sale primero. Los filtros, las cartas pintadas y el scroll se conservan al volver de una ficha.
   - **Ficha**: precio normal y foil (tendencia, mínimo, media 7 días), aviso de confianza, motivo del mapeo, +/− y texto de reglas con los símbolos dibujados. **Corregir precio**: lista los candidatos con su set y sus precios, ordenados por precio; la elección se guarda en `mappingOverrides/{cardId}` para todo el grupo y se puede deshacer.
   - **Mi colección**: valor total, cartas y copias, aviso desplegable de copias sin precio (no suman, el texto dice que el valor real es mayor), búsqueda y orden. Las cartas guardadas que no están en el catálogo (los 5 ids de DotGG de la sección 5) se listan aparte.
   - **Vista de carpeta** (por defecto desde el 24/10/2026, a petición del usuario, siguiendo el estilo de Riftbound.gg): todas las cartas del catálogo en cuadrícula; las que no tienes, oscurecidas y con la etiqueta "falta"; las que tienes, a color con "×N" y borde dorado. Filtros por set y "todas / las que tengo / las que me faltan", y con un set elegido, barra de **completado** ("55 de 352 cartas de Origins · 15 %"). La vista **lista** se conserva para ordenar por valor. En la colección de otro, lo oscurecido es lo que le falta a él. Vista, filtros y scroll se conservan al volver de una ficha (`CollectionViewState`).
   - La tarjeta y la carga por tandas son componentes compartidos con el catálogo: `ui/card-tile.component.ts` y `ui/load-more.component.ts`.
   - **El +/− de normal y foil va encima de la imagen**, en un panel con degradado (a petición del usuario). Con ratón aparece al pasar por encima o al enfocar con el teclado, y la carta se eleva con sombra y borde dorado; en táctil (`hover: none`) el panel se ve siempre. La imagen y el nombre enlazan a la ficha; los botones van en un hermano posicionado, no dentro del enlace. Los estilos `:hover` de los botones están dentro de `@media (hover: hover)`, porque en táctil se quedan "pegados" tras tocar. El +/− se adapta al ancho **de la carta** con container queries, no al de la ventana: con varias columnas, una carta de escritorio puede ser tan estrecha como una de móvil. Por debajo de 150 px usa "N"/"F" y por debajo de 125 px, botones de 24 px. Comprobado midiendo que ningún botón se sale de la imagen de 320 a 2560 px (la imagen recorta lo que sobresale, así que mirar el scroll horizontal no basta). Las rejillas usan tarjetas de 190 px como mínimo: unas 6 columnas a 1440 px, como Riftbound.gg.
   - Comprobado sin scroll horizontal de 320 a 1280 px en todas las páginas. Ojo para pantallas nuevas: un `display: grid` sin columnas declaradas no encoge por debajo del contenido de sus hijos; usar `grid-template-columns: minmax(0, 1fr)`.
   - Solo se marca la confianza **baja** ("precio aproximado"), sin producto y corregido. La media no se marca: casi siempre son alt arts bien emparejados.
   - Imágenes pedidas al CDN de Riot con `&w=…&fm=webp`: 14 KB por carta en vez de 780 KB. El service worker las cachea 30 días.
   - Si una carta no tiene precio normal pero sí foil, la tarjeta del catálogo lo dice ("foil 1,23 €"); si no, parecería el de la normal.
6. ✅ Ruta `/coleccion/:uid` y selector "Ver" en la cabecera de Mi colección, con los miembros de `users/*` (se oculta si solo estás tú). La colección ajena muestra valor, totales y lista igual que la propia, con las copias como números sin botones y una etiqueta "solo lectura". Probado en el navegador con un segundo perfil creado a mano en el almacén demo: valores, selector, solo lectura, y que al volver al catálogo se ven y editan las copias propias.
   - Leer la colección de otro cuesta una lectura de Firestore por carta. Se cachea por sesión; con 3 usuarios y ~400 cartas sobra el plan Spark (sección 4).
**Salida:** Fran gestiona su colección entera desde el móvil. **Pendiente:** necesita el despliegue de F1.

### F3 — Importar / exportar ✅
Import DotGG (y Collectr y Legacy si es barato), con informe de filas no reconocidas. Export DotGG. **Salida:** importar `collection1.csv` y exportarlo da el mismo contenido.

Hecho y **criterio de salida cumplido**, comprobado de dos formas: `npm run check:import` (con el
catálogo real y el mismo código que la app) y en el navegador, importando el fichero y descargando la
exportación: 390 filas de 390 iguales en código, normales y foils.
- `src/app/core/csv.ts`: funciones puras. Lee DotGG y Legacy, con comillas, BOM, CRLF y `;` (el
  separador de Excel en España). Rechaza con línea y motivo los códigos y cantidades no válidos, suma
  las filas repetidas y se salta las que están a cero.
- **Collectr no está**: sin un fichero real de ejemplo no se pueden adivinar sus columnas. Lo mismo
  Piltover Archive, que no se ha podido confirmar que exporte colecciones.
- Pantalla `/importar`, enlazada desde Mi colección: revisión antes de guardar nada (cartas, copias,
  valor estimado, enlazadas, fuera del catálogo y rechazadas) y modo **Sumar** o **Sustituir** (con
  aviso de cuántas cartas se borrarían y confirmación). Exportar descarga `riftbound-coleccion-AAAA-MM-DD.csv`.
- `CollectionService.importCollection` escribe en lotes de Firestore de 450 y **solo lo que cambia**:
  reimportar el mismo fichero son 0 escrituras. Si un lote falla, relee la colección para no enseñar
  algo que no se guardó.
- Las reglas admiten el campo `alias` (texto de hasta 20). **Hay que volver a publicar `firestore.rules`.**
- Exportar escribe los códigos en mayúsculas (`OGN-089A`); DotGG mezcla `a` y `A`, que son lo mismo.
- `npm run start:demo` arranca `netlify dev` en modo demo aunque la config de Firebase esté rellena:
  sirve para probar en local sin tocar el Firestore real (es lo que se usó para probar F3).

### F4 — Traducción al español ← HECHA (falta la revisión del usuario)
Primero un glosario fijo de términos del juego (keywords, tipos, dominios), luego todos los textos usando el glosario, revisados. `catalog_es.json`. Selector EN/ES. No hay edición oficial en español; Riot ha anunciado primero el francés.

Hecho (24/10/2026):
- **Texto de origen arreglado**: el catálogo se genera desde el campo `rich` de RiftHunt, no desde
  `text`, que perdía los saltos de línea (797 cartas los tienen) y las listas de opciones. Las
  entidades HTML (`&gt;`, `&quot;`) se decodifican: antes la ficha enseñaba `[&gt;]` como si fuera
  una keyword. `[>]` y `[>>]` se pintan como las flechas ▶ y ▶▶ de las cartas.
- **Glosario**: `docs/glosario.md`. Tiene decisiones pendientes del usuario (marcadas con ⚠️):
  keywords en inglés o traducidas, kill → matar o destruir, Signature → Firma o Exclusiva.
- **Infraestructura**: `src/app/core/traduccion.ts` (clave por hash del texto inglés y validador),
  `TraduccionService` (idioma ES/EN guardado en el navegador, carga de `catalog_es.json`),
  selector ES/EN en la ficha, aviso "aún no está traducida" y tipos, dominios y rarezas traducidos
  en la ficha y en los filtros del catálogo.
- **Flujo de trabajo**: `npm run traducir -- pendientes [--set OGN] [--max 50]` saca lo que falta;
  las traducciones se escriben en `tools/traduccion/lotes/*.json` (fuente de verdad, revisable en
  git); `npm run traducir -- aplicar` valida cada una (símbolos, keywords, números, flechas, líneas
  y viñetas) y regenera `public/data/catalog_es.json`. Lo que no pasa no entra.
- La clave es un hash del texto inglés: las alt arts comparten traducción y, si Riot corrige un
  texto, esa carta vuelve al inglés con aviso en vez de enseñar una traducción desfasada.
- **Volumen**: 1.164 textos de reglas y 773 de ambientación distintos.

Glosario aprobado por el usuario el 24/10/2026 (opción A: keywords en inglés con el recordatorio
traducido). Traducción terminada el mismo día:
- **Reglas: 1.164/1.164**, lotes `001`–`017`. Todas pasan el validador.
- **Ambientación: 755/773**, lotes `100`–`104`. Las 18 que faltan son **letras de canciones** (las
  cartas de la banda de Radiance, OPP-015, OPP-038 y el poema en seis partes de UNL-220 a UNL-225):
  se dejan en inglés a propósito, por derechos de autor. La ficha las enseña en inglés, como
  cualquier texto sin traducir. `npm run traducir -- pendientes --tipo ambientacion` las seguirá
  listando: es lo esperado.
- Pendiente: que el usuario revise en la app las cartas que más juega y corrija lo que no le suene
  natural (editar el lote y `npm run traducir -- aplicar`).
- Detalle visto al revisar: la ambientación se pinta sin saltos de línea (también en inglés), así
  que las citas con la atribución en otra línea salen seguidas. Es cosmético.

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
