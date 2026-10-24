# Glosario de traducción (F4)

Riftbound no tiene edición oficial en español: Riot ha anunciado primero el francés. Este glosario
fija cómo se traduce cada término para que las ~1.200 cartas digan lo mismo de la misma forma.
**Se revisa antes de traducir**: cambiarlo después obliga a rehacer las traducciones afectadas.

Decisiones cerradas por el usuario el 24/10/2026: keywords en inglés con el recordatorio
traducido, kill → matar y Signature → Firma.

## Reglas generales

- **Nombres de cartas, sets, fichas (tokens) y etiquetas de campeón o región: en inglés.**
  "Play a Gold gear token" → "Juega una ficha de equipo Gold". Coincide con la regla del proyecto
  y con cómo se buscan las cartas en Cardmarket y Riftbound.gg.
- **Las cartas hablan en primera persona** y se mantiene: "When I conquer" → "Cuando conquiste",
  "I have +1 :rb_might:" → "Tengo +1 :rb_might:".
- **Los símbolos no se tocan**: `:rb_energy_2:`, `:rb_rune_fury:`, `:rb_might:`, `:rb_exhaust:`,
  `[>]`, los números y las listas con viñetas salen exactamente igual. El validador
  (`npm run traducir -- aplicar`) rechaza cualquier traducción que pierda o cambie uno.
- **Género**: "unidad", "carta", "runa" son femeninos ("una unidad aliada preparada");
  "equipo", "hechizo", "campo de batalla" son masculinos.
- Imperativo de tú: "Roba 1 carta", "Elige una unidad".

## Decisión 1: las keywords (cerrada: opción A)

Las keywords son lo que va entre corchetes: `[Accelerate]`, `[Deflect]`, `[Ambush]`, `[Tank]`…
(39 distintas). En las cartas casi siempre llevan detrás un texto recordatorio entre paréntesis
que explica qué hacen.

- **A (elegida): se quedan en inglés, y el texto recordatorio se traduce.**
  `[Accelerate] (Puedes pagar :rb_energy_1::rb_rune_fury: como coste adicional para que entre preparada.)`
  Es como juega la comunidad hispanohablante mientras no haya edición en español, coincide con las
  búsquedas en Riftbound.gg y Cardmarket, y no inventa nombres que una edición oficial futura
  podría contradecir. El significado no se pierde porque el recordatorio está en español.
- B (descartada): se traducen (`[Acelerar]`, `[Desviar]`, `[Emboscada]`, `[Tanque]`…). Más fácil de leer para
  quien no sabe inglés, pero son nombres inventados por nosotros.

Con A, las palabras que también son keyword se quedan en inglés aunque aparezcan sin corchetes
cuando funcionan como keyword ("Spend my buff", "Disempower a unit"): `buff`, `Empower`/`Empowered`/
`Disempower`, `XP`.

## Tipos, supertipos, dominios y rarezas (filtros y ficha)

| Inglés | Español |
|---|---|
| Unit | Unidad |
| Spell | Hechizo |
| Gear | Equipo |
| Legend | Leyenda |
| Rune | Runa |
| Battlefield | Campo de batalla |
| Champion | Campeón |
| Basic | Básica |
| Signature | Firma |
| Token | Ficha |
| Fury · Calm · Mind · Body · Chaos · Order | Furia · Calma · Mente · Cuerpo · Caos · Orden |
| Colorless | Incolora |
| Common · Uncommon · Rare · Epic | Común · Infrecuente · Rara · Épica |
| Showcase · Promo | Showcase · Promo (sin traducir: así se conocen las versiones especiales) |

## Términos de reglas

| Inglés | Español | Ejemplo |
|---|---|---|
| unit / friendly unit / enemy unit | unidad / unidad aliada / unidad enemiga | |
| play | jugar | "Play a unit" → "Juega una unidad" |
| battlefield / open battlefield | campo de batalla / campo de batalla libre | |
| base | base | |
| cost / additional cost / energy cost | coste / coste adicional / coste de energía | |
| pay | pagar | |
| draw | robar | "Draw 1" → "Roba 1" |
| deal N (damage) | infligir N (de daño) | "Deal 3 to a unit" → "Inflige 3 a una unidad" |
| damage / combat damage / bonus damage | daño / daño de combate / daño adicional | |
| kill / die | matar / morir | "Kill a unit" → "Mata a una unidad"; "When I die" → "Cuando muera". Se elige matar y no "destruir" para que case con "die", que Riftbound usa mucho (`[Deathknell]`). |
| ready (adj.) / ready (verbo) | preparada / preparar | "enter ready" → "entrar preparada" |
| exhausted / exhaust | agotada / agotar | |
| give | dar | "Give a unit +2 :rb_might:" → "Da +2 :rb_might: a una unidad" |
| move | mover | |
| choose / chosen | elegir / elegida | |
| control / controller | controlar / controlador | |
| owner / owner's hand | propietario / mano de su propietario | |
| token | ficha | "a Bird unit token" → "una ficha de unidad Bird" |
| card / hand / deck / main deck | carta / mano / mazo / mazo principal | |
| top N cards | las N primeras cartas | |
| trash | descarte (la pila) | "Put it in your trash" → "Ponla en tu descarte" |
| discard | descartar | |
| recycle | reciclar | |
| banish | desterrar | |
| return | devolver | |
| reveal / look at | revelar / mirar | |
| spell | hechizo | |
| gear / equipment / attach | equipo / equipamiento / acoplar | |
| conquer / hold | conquistar / mantener | "When I conquer or hold" → "Cuando conquiste o mantenga" |
| attack / attacker / defend / defender | atacar / atacante / defender / defensor | |
| combat / showdown | combate / enfrentamiento | |
| score a point / point | anotar un punto / punto | |
| rune / channel | runa / canalizar | "Channel 1 rune exhausted" → "Canaliza 1 runa agotada" |
| energy / might / power | energía / Might / Power | Might y Power son los nombres de las estadísticas: casi siempre salen como símbolo y se dejan como en la carta. |
| ability / abilities | habilidad / habilidades | |
| spend | gastar | |
| recall | retirar | |
| counter (un hechizo) | contrarrestar | |
| stun | aturdir | Solo cuando va sin corchetes; `[Stun]` sigue la decisión 1. |
| alone | sola / solo | "attacks alone" → "ataca sola" |
| ignoring its cost | sin pagar su coste | |
| Beginning Phase / Main Phase | fase inicial / fase principal | |
| this turn / next turn / start / end | este turno / el próximo turno / comienzo / final | |
| opponent / player | rival / jugador | |
| location | ubicación | |
| choose one — | elige una — | |

## Texto de ambientación

Se traduce libre, buscando que suene natural y conservando el tono del personaje, no palabra por
palabra. Las atribuciones ("—Annie") se dejan igual.
