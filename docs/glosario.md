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

## Textos recordatorio fijos

Las frases entre paréntesis que explican una keyword se repiten en cientos de cartas (59 frases,
711 apariciones). Se traducen siempre igual. `N` es un número y `:R:`/`:E:` el símbolo de runa o de
energía que lleve la carta.

`Empower`, `Empowered` y `Disempower` se quedan en inglés (decisión 1). "Empower me" se traduce
por su efecto: "me vuelvo Empowered".

| Inglés | Español |
|---|---|
| Play on your turn or in showdowns. | Juega en tu turno o en enfrentamientos. |
| Play any time, even before spells and abilities resolve. | Juega en cualquier momento, incluso antes de que se resuelvan hechizos y habilidades. |
| …, including to a battlefield you control. | …, también en un campo de batalla que controles. |
| Hide now for :R: to react with later for :E:. | Ocúltala ahora por :R: para reaccionar con ella más tarde por :E:. |
| You may pay :E::R: as an additional cost to have me enter ready. | Puedes pagar :E::R: como coste adicional para entrar preparada. |
| I can move from battlefield to battlefield. | Puedo moverme de un campo de batalla a otro. |
| It can move from battlefield to battlefield. | Puede moverse de un campo de batalla a otro. |
| Opponents must pay :R: to choose me with a spell or ability. | Los rivales deben pagar :R: para elegirme con un hechizo o una habilidad. |
| +N :rb_might: while I'm an attacker / a defender. | +N :rb_might: mientras sea atacante / defensora. |
| +N :rb_might: while it's an attacker. | +N :rb_might: mientras sea atacante. |
| +N :rb_might: while they're attackers / defenders. | +N :rb_might: mientras sean atacantes / defensoras. |
| I must be assigned combat damage first / last. | Se me debe asignar el daño de combate en primer / último lugar. |
| It must be assigned combat damage first. | Se le debe asignar el daño de combate en primer lugar. |
| Abilities that add resources can't be reacted to. | No se puede reaccionar a las habilidades que añaden recursos. |
| It doesn't deal combat damage this turn. | No inflige daño de combate este turno. |
| A stunned unit doesn't deal combat damage this turn. | Una unidad aturdida no inflige daño de combate este turno. |
| You may pay the additional cost to repeat this spell's effect. | Puedes pagar el coste adicional para repetir el efecto de este hechizo. |
| When I die, get the effect. | Cuando muera, obtén el efecto. |
| Play this only to a battlefield. When an opponent holds here, kill this. | Juega esto solo en un campo de batalla. Cuando un rival mantenga aquí, mata esto. |
| You may play me as a [Reaction] to a battlefield where you have units. | Puedes jugarme como [Reaction] en un campo de batalla donde tengas unidades. |
| You may play this from your trash for its Flow cost. Then banish it. | Puedes jugar esto desde tu descarte por su coste de Flow. Después, destiérralo. |
| :R:: Attach this to a unit you control. | :R:: Acopla esto a una unidad que controles. |
| Pay the cost: Attach this to a unit you control. | Paga el coste: acopla esto a una unidad que controles. |
| When I conquer or hold, gain N XP. | Cuando conquiste o mantenga, gana N XP. |
| While you have N+ XP, get the effect. | Mientras tengas N+ XP, obtén el efecto. |
| A unit is Mighty while it has N+ :rb_might:. | Una unidad es Mighty mientras tenga N+ :rb_might:. |
| :E:: Empower me. Use only if not Empowered. | :E:: me vuelvo Empowered. Úsalo solo si no lo estoy. |
| Pay the cost: Empower me. Use only if not Empowered. | Paga el coste: me vuelvo Empowered. Úsalo solo si no lo estoy. |
| I become Empowered if I'm not already. | Me vuelvo Empowered si no lo estoy ya. |
| If it doesn't have a buff, it gets a +N :rb_might: buff. | Si no tiene un buff, obtiene un buff de +N :rb_might:. |
| If I don't have a buff, I get a +N :rb_might: buff. | Si no tengo un buff, obtengo un buff de +N :rb_might:. |
| Give it a +N :rb_might: buff if it doesn't have one. | Dale un buff de +N :rb_might: si no tiene uno. |
| Kill it at the start of its controller's Beginning Phase, before scoring. | Mátala al comienzo de la fase inicial de su controlador, antes de anotar. |
| Get the effect if you've played another card this turn. | Obtén el efecto si has jugado otra carta este turno. |
| Send it to base. This isn't a move. | Envíala a la base. Esto no es un movimiento. |
| Look at the top card of your Main Deck. You may recycle it. | Mira la primera carta de tu mazo principal. Puedes reciclarla. |
| Look at the top N cards of your Main Deck. Recycle any of them and put the rest back in any order. | Mira las N primeras cartas de tu mazo principal. Recicla las que quieras y devuelve el resto en cualquier orden. |
| Put the top N cards of your Main Deck into your trash. | Pon las N primeras cartas de tu mazo principal en tu descarte. |
| You must still pay its Power cost. | Aún debes pagar su coste de Power. |
| Each instance of damage the spell deals is increased by N. | Cada daño que inflija el hechizo aumenta en N. |

## Añadidos al traducir

| Inglés | Español |
|---|---|
| Awaken Phase · Beginning Phase · Main Phase · Ending Phase | fase de despertar · fase inicial · fase principal · fase final |
| heal | curar |
| win a combat | ganar un combate |
| face down | boca abajo |
| the board / leaves the board | el tablero / sale del tablero |
| occupied (battlefield) | ocupado |
| split among | repartido entre |
| attached / detached Equipment | equipamiento acoplado / desacoplado |
| empower X / disempower X | volver Empowered a X / quitar Empowered a X |
| buff me / buff a unit | dame un buff / da un buff a una unidad |
| They [Burn N]. | Ese jugador sufre [Burn N]. |
| becomes [Mighty] | se vuelve [Mighty] |
| ready (verbo, "when I become ready") | prepararse ("cuando me prepare") |

**Keywords que hacen de verbo**: cuando una keyword entre corchetes es la acción de la frase, se
antepone "aplica": `[Stun] a unit.` → `Aplica [Stun] a una unidad.`; `[Buff] a unit.` → `Aplica [Buff]
a una unidad.`. Si es algo que se da, "da": `Give a unit [Assault 3]` → `Da [Assault 3] a una unidad`.

**Keywords de acción sin objeto** (`[Predict]`, `[Predict 2]`): "haz" — `When you play me, [Predict 2].`
→ `Cuando me juegues, haz [Predict 2].` Si la frase inglesa repite la keyword sin corchetes ("If you
showed off"), se traduce por "si lo hiciste": añadir otro corchete descuadraría el recuento del
validador y no aporta nada.
