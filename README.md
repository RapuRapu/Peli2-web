# Peli 2 – selainkokeilu

Purjehduskokeilu: yksi saari, meri ja slooppi isometrisellä kameralla. Three.js + WebGL2, kaikki grafiikka generoidaan koodilla.

## Ajo

```bash
npm install
npm run build        # -> dist/index.html (yksi tiedosto)
```

Avaa `dist/index.html` selaimessa.

**Ohjaus:** kosketa merta = purjehdi sinne · pidä pohjassa = ohjaa · nipistä/rulla = zoomaa · A/D = käänny.

## Rakenne

| Tiedosto | Sisältö |
|---|---|
| `src/island.js` | Korkeuskartta (generoitu), maastoverkko ja värit, merenpohjan syvyystekstuuri |
| `src/ocean.js` | Aallot (sama funktio CPU:lla ja shaderissa), veden shaderi |
| `src/ship.js` | Sloopin malli ja purjehdusfysiikka (tuulikulma, karilleajo, keinunta) |
| `src/vegetation.js` | Palmut, lehtipuut, pensaat, kivet (instansoitu, ruuduttain kullattu) |
| `src/wake.js` | Peräaalto |
| `src/performance.js` | 60 fps -rajoitin, automaattinen resoluutio, FPS-mittari |
| `src/hud.js` | Tuulinuoli, nopeus, vihjeet |
| `src/main.js` | Kamera, syöte, valaistus, kuvakulmat kuvakaappauksille |

**DEM-saaret:** `createHeightmap(resolution, worldSize, heights)` ottaa minkä tahansa korkeuskartan (metreinä, merenpinta 0), joten generaattorin voi korvata omalla 16-bit-datalla.

## Kuvakaappaukset

`dist/index.html?pose=1..6&hud` renderöi kiinteän kuvakulman. `shoot.py` ajaa kaikki kuusi headless-Chromella (Playwright).
