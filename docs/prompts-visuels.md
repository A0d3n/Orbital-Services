# Prompts pour générer les images de la chronologie

Chaque événement de la chronologie peut avoir une vraie image à la place de l'illustration dessinée par le code. Ce document donne un prompt de style commun, puis un prompt par événement.

## Réglages à donner au générateur

- **Format :** paysage très large, rapport 2,8 : 1 (par exemple 1600 × 570 px). Si le générateur ne propose que du 21:9 ou du 16:9, laissez-le faire : l'image est recadrée au centre, donc gardez le sujet au milieu.
- **Poids :** WebP ou JPEG, moins de 200 Ko par image si possible.
- **Nom des fichiers :** `evt-<époque>-<numéro>.webp`, exactement comme dans les tableaux ci-dessous (par exemple `evt-0-0.webp`). Ces fichiers se mettent à la racine du dossier `public/` : le site les affiche automatiquement et garde l'illustration dessinée pour les événements sans image.

## Prompt de style (à coller devant chaque prompt d'événement)

```
Cinematic science-fiction concept art, painterly matte painting, ultra wide panoramic
composition (aspect ratio 2.8:1), subject centred with safe space left and right,
dramatic lighting, volumetric light, rich atmosphere, high detail, moody and dark overall
tones that sit well on a near-black interface (background around #0b0d0c), sophisticated
muted colours with one strong accent colour, space opera mood in the spirit of a
persistent-universe space simulation, realistic scale, no text.
```

## Prompt négatif (si le générateur en accepte un)

```
text, letters, captions, watermark, signature, logo, user interface, frame, border,
real person likeness, celebrity, cartoon, anime, low resolution, blurry, deformed ships,
extra limbs, oversaturated, flat lighting
```

## Palettes par thème

| Thème | Couleurs à demander |
|---|---|
| hum | steel blue and cool cyan |
| xian | teal-green with gold, ornate geometric forms |
| banu | amber and gold, warm market light |
| tev | copper and burnt orange |
| van | deep crimson and black, angular hostile shapes |
| tech | violet and white, clean technological light |
| corp | grey-olive and steel, industrial |
| myst | magenta and deep purple, eerie and mysterious |

## Prompts par événement

Pour chaque ligne : prompt de style + « Palette : » + palette du thème + prompt de l'événement.

### Les Anciens

| Fichier | Date | Événement | Thème |
|---|---|---|---|
| `evt-0-0.webp` | −300 000 | Les Hadésiens disparaissent | myst |
| `evt-0-1.webp` | −26 038 | Les Xi’an atteignent l’espace | xian |
| `evt-0-2.webp` | −20 044 → −19 770 | La Grande Fracture (majeur) | xian |
| `evt-0-3.webp` | −19 668 | Premier âge impérial | xian |
| `evt-0-4.webp` | −291 | Les Xi’an rencontrent les Kr’Thak | xian |
| `evt-0-5.webp` | 351 → 1342 | Les Guerres spirituelles | xian |
| `evt-0-6.webp` | 1457 | Fin de l’Obscurité | xian |
| `evt-0-7.webp` | 1924 | Les Xi’an rencontrent les Banu | banu |
| `evt-0-8.webp` | 1961 → 1969 | Gagarine, puis Armstrong | hum |

**evt-0-0 : Les Hadésiens disparaissent**

```
A world torn in two: a cracked alien planet split by a catastrophic civil war, glowing molten fissure through the crust, debris field and the ruins of ancient orbital structures around it, eerie magenta and violet palette. Palette: magenta and deep purple, eerie and mysterious.
```

**evt-0-1 : Les Xi’an atteignent l’espace**

```
The first single-seat spacecraft of an alien civilization leaving the atmosphere of its lush blue-green homeworld, elegant organic-geometric craft, dawn light on the curve of the planet, sense of the first step into space. Palette: teal-green with gold, ornate geometric forms.
```

**evt-0-2 : La Grande Fracture**

```
An alien homeworld in civil war: old weather satellites sabotaged in orbit, a chain reaction of explosions rippling across the sky, the atmosphere tearing apart, teal and fire palette. Palette: teal-green with gold, ornate geometric forms.
```

**evt-0-3 : Premier âge impérial**

```
A new imperial capital founded on an alien world: monumental ornate geometric architecture, the silhouette of a first sovereign on a high terrace, a golden sun rising, a spiral emblem glowing in the sky. Palette: teal-green with gold, ornate geometric forms.
```

**evt-0-4 : Les Xi’an rencontrent les Kr’Thak**

```
First contact between two alien fleets: a graceful teal ship facing a massive, angular, red-lit unknown vessel, tense standoff in deep space. Palette: teal-green with gold, ornate geometric forms.
```

**evt-0-5 : Les Guerres spirituelles**

```
Two vast fleets of alien temple-like warships clashing in a nebula, ritual fire along their hulls, atmosphere of a thousand-year religious war. Palette: teal-green with gold, ornate geometric forms.
```

**evt-0-6 : Fin de l’Obscurité**

```
A new empress crowned at dawn on a vast palace platform, an empire emerging from centuries of darkness, golden sun breaking over a dark city, banners in the wind. Palette: teal-green with gold, ornate geometric forms.
```

**evt-0-7 : Les Xi’an rencontrent les Banu**

```
An alien merchant caravan meeting elegant teal ships in open space, goods being exchanged, amber and teal light, glowing trade lanes. Palette: amber and gold, warm market light.
```

**evt-0-8 : Gagarine, puis Armstrong**

```
Space race era, 1960s retro-futurist: an early capsule orbiting the Earth and an astronaut in a period suit planting a flag on the Moon, visor reflecting the Earth, nostalgic film grain. No real person's likeness, face hidden. Palette: steel blue and cool cyan.
```


### L’aube spatiale

| Fichier | Date | Événement | Thème |
|---|---|---|---|
| `evt-1-0.webp` | 2038 | Naissance de Roberts Space Industries | corp |
| `evt-1-1.webp` | 2075 | Le premier moteur quantique | tech |
| `evt-1-2.webp` | 2113 | Le brevet de terraformation | tech |
| `evt-1-3.webp` | 2120 → 2125 | La Grande Tragédie de Mars | hum |
| `evt-1-4.webp` | 2137 → 2140 | Le premier vaisseau commercial | tech |
| `evt-1-5.webp` | 2157 | Mars est terraformée | hum |
| `evt-1-6.webp` | 2232 | Le départ de l’Artemis | myst |
| `evt-1-7.webp` | 2262 | Le Triangle de Neso | myst |
| `evt-1-8.webp` | 2271 | Nick Croshaw ouvre la voie (majeur) | hum |

**evt-1-0 : Naissance de Roberts Space Industries**

```
A near-future corporate headquarters at night: glass towers, a prototype spacecraft on a hangar floor under spotlights, the founding of a space company, cool blue and sage lights. Palette: grey-olive and steel, industrial.
```

**evt-1-1 : Le premier moteur quantique**

```
A prototype quantum drive in a laboratory: glowing core with concentric energy rings, engineers in silhouette behind glass, violet-white light. Palette: violet and white, clean technological light.
```

**evt-1-2 : Le brevet de terraformation**

```
A holographic blueprint of terraforming technology: wireframe planet half barren, half green, floating patent documents, violet holographic interface. No readable text. Palette: violet and white, clean technological light.
```

**evt-1-3 : La Grande Tragédie de Mars**

```
A terraforming disaster on Mars: a huge atmospheric processor exploding on the red surface, shockwave and fire, dust storm, solemn memorial mood. Non-graphic. Palette: steel blue and cool cyan.
```

**evt-1-4 : Le premier vaisseau commercial**

```
A test pilot flying the first commercial spaceship, a sleek 2130s freighter, over the Earth's orbit, sunlight glinting on the hull, debris of a failed earlier prototype faintly visible. Palette: violet and white, clean technological light.
```

**evt-1-5 : Mars est terraformée**

```
Mars declared terraformed: green valleys and lakes, a memorial monument for the victims at sunrise, a domed city in the distance, hopeful golden light. Palette: steel blue and cool cyan.
```

**evt-1-6 : Le départ de l’Artemis**

```
The first human interstellar colony ship leaving the Solar System: an enormous elongated vessel with a fusion plume, colonists in stasis, stars streaking past, Earth a tiny dot behind. Palette: magenta and deep purple, eerie and mysterious.
```

**evt-1-7 : Le Triangle de Neso**

```
A region of space where ships vanish: derelict wrecks drifting around a mysterious triangular anomaly, a swirling dark vortex, purple fog, warning beacons. Palette: magenta and deep purple, eerie and mysterious.
```

**evt-1-8 : Nick Croshaw ouvre la voie**

```
A lone explorer ship approaching the first jump point ever found: a giant ring-shaped gateway of blue-white light in the dark, sense of wonder. Palette: steel blue and cool cyan.
```


### L’expansion

| Fichier | Date | Événement | Thème |
|---|---|---|---|
| `evt-2-0.webp` | 2281 | Le comité d’expansion de Croshaw | hum |
| `evt-2-1.webp` | 2287 | Rhetor, un quart des terres pour l’éducation | hum |
| `evt-2-2.webp` | 2290 | Le système « Nul » | hum |
| `evt-2-3.webp` | 2380 | Naissance des Nations unies de la Terre (majeur) | hum |
| `evt-2-4.webp` | 2380 → 2381 | Première guerre d’Unification | hum |
| `evt-2-5.webp` | 2383 → 2384 | Les dernières guerres d’Unification | hum |

**evt-2-0 : Le comité d’expansion de Croshaw**

```
An assembly of the world's leaders in a grand circular hall, a holographic star map hovering in the centre, delegates in formal dress, blue steel palette. Palette: steel blue and cool cyan.
```

**evt-2-1 : Rhetor, un quart des terres pour l’éducation**

```
Two young graduate students aboard a small exploration ship discovering a new star system, a ringed green world filling the viewport, secretive, excited mood. Palette: steel blue and cool cyan.
```

**evt-2-2 : Le système « Nul »**

```
A navigator staring out of a cockpit at a dull, empty star system with nothing of interest: dark void, a single barren grey planet, wry mood. Palette: steel blue and cool cyan.
```

**evt-2-3 : Naissance des Nations unies de la Terre**

```
Earth unified: a summit announcing the founding of a united government, flags rising, a terraformed world below, jubilant crowd, silver-blue heroic lighting. Palette: steel blue and cool cyan.
```

**evt-2-4 : Première guerre d’Unification**

```
A mutiny aboard a warship: crew rebels turning their guns, a fleet divided, laser fire in space, red sparks among blue ships, tense. Palette: steel blue and cool cyan.
```

**evt-2-5 : Les dernières guerres d’Unification**

```
The conquest of a Martian base: orbital bombardment beams striking a domed complex on a red planet, the final battle of a civil war. Palette: steel blue and cool cyan.
```


### Premiers contacts

| Fichier | Date | Événement | Thème |
|---|---|---|---|
| `evt-3-0.webp` | 2438 | Rencontre avec les Banu (majeur) | banu |
| `evt-3-1.webp` | 2468 | Nexus vendu aux enchères | corp |
| `evt-3-2.webp` | 2493 | Premier regard sur Pyro | corp |
| `evt-3-3.webp` | 2523 | Les Planètes unies de la Terre | hum |
| `evt-3-4.webp` | 2530 | L’Empire xi’an est découvert (majeur) | xian |

**evt-3-0 : Rencontre avec les Banu**

```
First contact with an alien species: humans in space suits meeting amber-lit, exotic merchants, a trading ship docking, warm golden light. Palette: amber and gold, warm market light.
```

**evt-3-1 : Nexus vendu aux enchères**

```
A vast corporate space station auction: representatives bidding for the exploitation rights of a distant star system, a holographic star map, money-green and amber light. No real logos. Palette: grey-olive and steel, industrial.
```

**evt-3-2 : Premier regard sur Pyro**

```
An unstable orange star spitting solar flares beside a gravitational anomaly that turns out to be a jump point, mining ships nearby, ominous red-orange glow. Palette: grey-olive and steel, industrial.
```

**evt-3-3 : Les Planètes unies de la Terre**

```
A senate chamber of a united human government, monumental columns and a large dome, glass and stone, golden afternoon light, representatives from many worlds. Palette: steel blue and cool cyan.
```

**evt-3-4 : L’Empire xi’an est découvert**

```
A human navigator discovering a vast alien empire: ornate towering structures of a military world glimpsed through the viewport, a corporate survey ship crossing into foreign territory. Palette: teal-green with gold, ornate geometric forms.
```


### Tevarin et Empire

| Fichier | Date | Événement | Thème |
|---|---|---|---|
| `evt-4-0.webp` | 2541 | Les Tevarin apparaissent | tev |
| `evt-4-1.webp` | 2542 | Idris IV tombe | tev |
| `evt-4-2.webp` | 2542 | La ligne Perry | hum |
| `evt-4-3.webp` | 2544 | La bataille d’Idris IV | tev |
| `evt-4-4.webp` | 2546 | L’Atrocité de Jata | hum |
| `evt-4-5.webp` | 2546 | Messer devient Imperator (majeur) | hum |
| `evt-4-6.webp` | 2603 → 2610 | La seconde guerre tévarine | tev |
| `evt-4-7.webp` | 2659 | L’Aurora arrive | corp |

**evt-4-0 : Les Tevarin apparaissent**

```
An explorer sees an alien civilization for the first time: a warm orange world with city lights glowing on the night side, spiny elegant ships in orbit. Palette: copper and burnt orange.
```

**evt-4-1 : Idris IV tombe**

```
Orbital bombardment of a human colony planet by alien warships: plasma beams striking the surface, burning cities, defenders overwhelmed, copper-orange palette. Palette: copper and burnt orange.
```

**evt-4-2 : La ligne Perry**

```
A military no-fly line across a frontier: patrol ships holding a defensive line of warning buoys and beacons stretching into the dark, stern atmosphere. Palette: steel blue and cool cyan.
```

**evt-4-3 : La bataille d’Idris IV**

```
A human fleet counterattacking to retake a planet: anti-orbital fire rising from the surface, explosions between ships, a surprise attack guided by intelligence. Palette: copper and burnt orange.
```

**evt-4-4 : L’Atrocité de Jata**

```
The aftermath of coordinated terrorist attacks on a city skyline at night: smoke columns, flashing emergency lights, a military leader's silhouette on a balcony. Somber, non-graphic. Palette: steel blue and cool cyan.
```

**evt-4-5 : Messer devient Imperator**

```
A triumphant general presenting a captured alien leader to a roaring crowd, rising to become the first emperor, dramatic podium, imperial banners. No real person's likeness. Palette: steel blue and cool cyan.
```

**evt-4-6 : La seconde guerre tévarine**

```
Reconstituted alien fleets returning to reclaim their native world: long-range ships emerging from a jump point, defenders scrambling, copper and blue. Palette: copper and burnt orange.
```

**evt-4-7 : L’Aurora arrive**

```
A small utilitarian wedge-shaped starter spaceship launching from a landing pad at dawn, humble and proud, an ordinary pilot's first ship. Palette: grey-olive and steel, industrial.
```


### L’ombre vanduul

| Fichier | Date | Événement | Thème |
|---|---|---|---|
| `evt-5-0.webp` | 2681 | Premier contact avec les Vanduul (majeur) | van |
| `evt-5-1.webp` | 2712 | La bataille d’Orion (majeur) | van |
| `evt-5-2.webp` | 2732 → 2736 | Le siège de Tiber | van |
| `evt-5-3.webp` | 2736 → 2737 | La chute de Virgil (majeur) | van |
| `evt-5-4.webp` | 2743 | Tiber ne sera pas repris | van |
| `evt-5-5.webp` | 2757 | Le refus d’Anthony Tanaka | hum |
| `evt-5-6.webp` | 2785 | « Nous serons des dieux » | hum |
| `evt-5-7.webp` | 2789 | Le traité de paix de 2789 | xian |
| `evt-5-8.webp` | 2792 | Le Massacre de Garron II et la chute des Messer (majeur) | hum |
| `evt-5-9.webp` | 2793 | Toi rencontre Kray | xian |

**evt-5-0 : Premier contact avec les Vanduul**

```
A small frontier colony town attacked by savage, angular raiders: dark crimson ships streaking through smoke, panic, lights in the town. Palette: deep crimson and black, angular hostile shapes.
```

**evt-5-1 : La bataille d’Orion**

```
A gigantic alien capital ship with a serrated dark-crimson hull appearing over a planet, a human fleet outmatched in front of it. Palette: deep crimson and black, angular hostile shapes.
```

**evt-5-2 : Le siège de Tiber**

```
A great clan fleet blockading a jump point, human battle groups forming a defensive line, mines and beam fire, a planet below, a desperate siege. Palette: deep crimson and black, angular hostile shapes.
```

**evt-5-3 : La chute de Virgil**

```
A colossal crimson capital ship crushing a battle group over a planet, the surface burning, ash clouds, a world falling, apocalyptic red and black. Palette: deep crimson and black, angular hostile shapes.
```

**evt-5-4 : Tiber ne sera pas repris**

```
An abandoned system: military ships turning away, a lone warning marker, refugees fleeing in transports, a government decision, melancholic. Palette: deep crimson and black, angular hostile shapes.
```

**evt-5-5 : Le refus d’Anthony Tanaka**

```
A statue in a plaza dedicated to a man who refused to obey: a simple monument at dusk, candles around its base, a silent crowd, a remembrance day. Face not specific. Palette: steel blue and cool cyan.
```

**evt-5-6 : « Nous serons des dieux »**

```
Tyrant propaganda: a giant holographic broadcast of living alien creatures in a lush forest, billboard screens across an empire, ominous gold light. The emperor is never shown. Palette: steel blue and cool cyan.
```

**evt-5-7 : Le traité de paix de 2789**

```
A peace treaty being signed between a human senator and a young alien emperor, a table in a diplomatic hall with a scroll and a seal, two worlds visible through the window, hopeful teal-blue light. Palette: teal-green with gold, ornate geometric forms.
```

**evt-5-8 : Le Massacre de Garron II et la chute des Messer**

```
A tense popular uprising: a massive crowd at night with banners and torches facing a government building, a regime toppling, silhouettes with dramatic rim light. Non-graphic. Palette: steel blue and cool cyan.
```

**evt-5-9 : Toi rencontre Kray**

```
A human leader and an alien emperor meeting quietly in a serene garden temple, a drop of water creating widening ripples on a still pool, symbolic of a small action changing the universe. Palette: teal-green with gold, ornate geometric forms.
```


### Les temps modernes

| Fichier | Date | Événement | Thème |
|---|---|---|---|
| `evt-6-0.webp` | 2845 | Drake Interplanetary | corp |
| `evt-6-1.webp` | 2851 | microTech est découverte | hum |
| `evt-6-2.webp` | 2884 | L’échec de CHARIOT | tech |
| `evt-6-3.webp` | 2900 | Silent Song | hum |

**evt-6-0 : Drake Interplanetary**

```
A rugged industrial shipyard: a boxy, utilitarian, heavily armed cargo gunship under construction, welding sparks, rust and steel. No real logos. Palette: grey-olive and steel, industrial.
```

**evt-6-1 : microTech est découverte**

```
A distant icy blue planet seen for the first time through a telescope crosshair, a ring of small ice moons, observatory feel, cold light. Palette: steel blue and cool cyan.
```

**evt-6-2 : L’échec de CHARIOT**

```
A failed demonstration of an experimental engine: the engine bursting into a white-hot flare in a hangar, scientists thrown back, alarms, violet energy arcs. Palette: violet and white, clean technological light.
```

**evt-6-3 : Silent Song**

```
A giant interspecies art installation among the asteroids of a belt: ribbons of coloured light and sound waves arcing between rocks, harmony between species. Palette: steel blue and cool cyan.
```


### Le présent

| Fichier | Date | Événement | Thème |
|---|---|---|---|
| `evt-7-0.webp` | 2903 | Ouverture de Stanton (majeur) | hum |
| `evt-7-1.webp` | 2910 | Le 42nd Squadron affronte les Vanduul | van |
| `evt-7-2.webp` | 2940 → 2941 | Kelos Costigan, Imperator | hum |
| `evt-7-3.webp` | 2942 | Terra, nouvelle capitale ? | hum |
| `evt-7-4.webp` | 2942 → 2943 | Le X12 retrouvé sans vie | van |
| `evt-7-5.webp` | 2943 | Jenk Gallen arrêté par les Xi’an | xian |
| `evt-7-6.webp` | 2944 | Une boutique xi’an sur un monde humain | xian |
| `evt-7-7.webp` | 2945 | L’initiative Polo | hum |
| `evt-7-8.webp` | 2945 | Vega II et le discours de l’amiral Bishop | van |
| `evt-7-9.webp` | 2945 | Début de la guerre vanduul (majeur) | van |
| `evt-7-10.webp` | 2946 | La mobilisation des milices | hum |
| `evt-7-11.webp` | 2947 | HuXa, puis un attentat | xian |
| `evt-7-12.webp` | 2950 | Élection impériale | hum |

**evt-7-0 : Ouverture de Stanton**

```
A new star system revealed through a jump point: four distinct planets in a row, a gas giant with a floating city, a city-covered world, a dusty industrial world, an icy corporate world. Palette: steel blue and cool cyan.
```

**evt-7-1 : Le 42nd Squadron affronte les Vanduul**

```
A human carrier under attack: a squadron of fighters launching in V-formation to intercept dark red alien blades, tracer fire, determined pilots, cinematic. Palette: deep crimson and black, angular hostile shapes.
```

**evt-7-2 : Kelos Costigan, Imperator**

```
A political inauguration: an emperor elected, a ballot box and holographic votes, imperial emblem, official ceremony, blue and gold. Palette: steel blue and cool cyan.
```

**evt-7-3 : Terra, nouvelle capitale ?**

```
A glittering new capital skyline at night, a proposed imperial throne city, a golden crown motif above the skyline, bright and hopeful. Palette: steel blue and cool cyan.
```

**evt-7-4 : Le X12 retrouvé sans vie**

```
A huge alien carrier found drifting dead near a planet: no lights, frost along its hull, tiny human investigation ships approaching, eerie silence. Palette: deep crimson and black, angular hostile shapes.
```

**evt-7-5 : Jenk Gallen arrêté par les Xi’an**

```
A spy being detained by alien authorities: a cold interrogation room with a single watchful eye symbol, graceful but menacing, teal light bars. Palette: teal-green with gold, ornate geometric forms.
```

**evt-7-6 : Une boutique xi’an sur un monde humain**

```
The first alien corporate shop opening on a human world: a modern storefront with striped awnings, curious customers queueing, a sign in alien script, warm daylight. Palette: teal-green with gold, ornate geometric forms.
```

**evt-7-7 : L’initiative Polo**

```
A senate debate on cutting the military budget by ten percent: citizens voting with holographic ballots, a declining bar chart in the background, a warship silhouette. Palette: steel blue and cool cyan.
```

**evt-7-8 : Vega II et le discours de l’amiral Bishop**

```
A burning planet below, human and alien fleets clashing in orbit, an admiral's emergency speech glimpsed on a screen in a senate chamber, inset. Palette: deep crimson and black, angular hostile shapes.
```

**evt-7-9 : Début de la guerre vanduul**

```
The official start of a war: a flood of crimson raiders over the night side of a planet, city lights going out, human fleets launching, grim. Palette: deep crimson and black, angular hostile shapes.
```

**evt-7-10 : La mobilisation des milices**

```
Civilians volunteering as militia: ordinary pilots in repurposed ships forming up beside military fighters, recruitment atmosphere, patriotic blue light. Palette: steel blue and cool cyan.
```

**evt-7-11 : HuXa, puis un attentat**

```
A trade agreement between humans and aliens announced at a summit, two flags flanking the stage, goods exchanged; subtle tension, a distant glint of a sniper's scope across the skyline. Palette: teal-green with gold, ornate geometric forms.
```

**evt-7-12 : Élection impériale**

```
Election day for an empire: a mass of voters, holographic flags and ballot boxes, a vote-count display, official celebration. Palette: steel blue and cool cyan.
```

