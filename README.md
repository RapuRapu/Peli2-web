# Sea Of Crabs (Peli 2) – selainkokeilu

Purjehduskokeilu: yksi saari, meri ja slooppi isometrisellä kameralla. Three.js + WebGL2, kaikki grafiikka generoidaan koodilla.

## Ajo

```bash
npm install
npm run build        # -> dist/index.html (yksi tiedosto)
```

Avaa `dist/index.html` selaimessa.

**Ohjaus merellä:** kosketa merta = purjehdi sinne · pidä pohjassa = ohjaa · nipistä/rulla = zoomaa · A/D = käänny.

**Ohjaus maissa:** kosketa = kävele sinne (reitinhaku kiertää esteet) · kosketa esinettä = hae se · ⚓-painike = laivaan / maihin.

**I näytös:** kerää saarelta 4 lankkua, 2 köyttä, tynnyri ja purjekangas (4 aluetta: hylyn ranta, länsiranta, itäpoukama, viidakon aukio), korjaa rannalla makaava slooppi ja purjehdi. Reunanuoli osoittaa lähimpään tarvittavaan tavaraan, 🔨-merkki slooppiin.

**Tallennus:** selaimen localStorage (`peli2-save`), automaattisesti 5 s välein, esinettä poimiessa ja sivulta poistuttaessa. ↺ (kahdesti) aloittaa alusta.

## Rakenne

| Tiedosto | Sisältö |
|---|---|
| `src/island.js` | Korkeuskartta (generoitu), maastoverkko ja värit, merenpohjan syvyystekstuuri |
| `src/ocean.js` | Aallot (sama funktio CPU:lla ja shaderissa), veden shaderi |
| `src/ship.js` | Sloopin malli ja purjehdusfysiikka (tuulikulma, karilleajo, keinunta) |
| `src/vegetation.js` | Palmut, lehtipuut, pensaat, kivet (instansoitu, ruuduttain kullattu) |
| `src/wake.js` | Peräaalto |
| `src/detailTerrain.js` | 1 m tarkkuuden maastopala pelaajan ympärillä (rakennetaan taustalla useassa ruudussa) |
| `src/pathfinding.js` | 2 m ruudukko + A*, esteet kasvillisuudesta ja hylystä |
| `src/character.js` | Merirosvohahmo ja kävelyanimaatio |
| `src/items.js`, `src/wreck.js` | Kerättävät esineet ja haaksirikkoutunut laiva |
| `src/save.js` | Versioitu tallennus |
| `src/dolphins.js` | Delfiiniparvet: vaeltelu, laivan saattaminen keulassa, hypyt ja roiskeet |
| `src/performance.js` | 60 fps -rajoitin, automaattinen resoluutio, FPS-mittari |
| `src/hud.js` | Tuulinuoli, nopeus, vihjeet |
| `src/main.js` | Kamera, syöte, valaistus, kuvakulmat kuvakaappauksille |

**DEM-saaret:** `createHeightmap(resolution, worldSize, heights)` ottaa minkä tahansa korkeuskartan (metreinä, merenpinta 0), joten generaattorin voi korvata omalla 16-bit-datalla.

## Kuvakaappaukset

`dist/index.html?pose=1..7&hud` renderöi kiinteän kuvakulman (7 = delfiinit, 8–10 = maissa, 11 = korjattava slooppi). `&warmup=N` vaihtaa simuloidun alkuajan. `shoot.py` ajaa kuvakulmat headless-Chromella (Playwright).
