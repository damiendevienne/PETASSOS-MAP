# Map style playground

The map fills the viewport. The floating style panel changes the Liberty basemap live and downloads the current MapLibre style as `petassos-map-style.json`.

## Compare the Petassos style studies

From `map-playground/`, run:

```sh
python3 -m http.server 5180 --bind 127.0.0.1
```

Open <http://127.0.0.1:5180/compare.html> to see **Subtle watercolour** and **Illustrated coast** side by side. The two style JSON files and their watercolour sprites are in `variants/`. They both use OpenFreeMap Positron vector tiles, fonts and original icons. Each style adds a local `sketchy-water-mark-sea` texture to the water layer. Internet access is needed for the map data.

These are review drafts; the main app still uses OpenFreeMap Positron. The sprite URLs inside these JSON files point to this local preview server on port 5180. If a variant is selected for the app, copy its JSON and sprite files into the frontend and change its sprite URL to the deployed absolute URL.

## Run it

From this folder, run:

```sh
python3 -m http.server 5173
```

Open <http://localhost:5173>. MapLibre and OpenFreeMap tiles need an internet connection.

## Work with the exported style

The exported JSON includes the edited map sources and layers. It continues to request its vector tiles, fonts, and sprites from their URLs, so keep the attribution and internet access. To load your saved file in this playground, place it in this folder as `style.json` and change the `style` URL in `app.js` to `./style.json`.

The color controls edit the background, land and buildings, water, roads, and text label colors. Palette edits update the rendered map immediately. The JSON download captures those edits from MapLibre's current style.
