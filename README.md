# MotoVisual

Search for a motorcycle and browse its OEM parts in an **exploded 3D schematic**.
Parts are grouped by component (engine, front suspension, bodywork, …). Click any
part to see its part number, price, the original catalog diagram and a link to buy it.

The first target is the **2022 Yamaha R7 (YZF690)**, scraped from
[bike-parts-yam.ie](https://www.bike-parts-yam.ie/yamaha-motorcycle/700-MOTO/2022/R7/YZF690/86433).

## Quick start

```bash
npm install
npm run dev          # http://localhost:5173
```

The site is static: it reads `public/data/index.json` (the bike list for search)
and `public/data/bikes/<id>.json` (one file per bike). Until a bike has been
scraped, the search page will say so.

## Adding a bike (scraping)

```bash
npm run scrape -- "https://www.bike-parts-yam.ie/yamaha-motorcycle/700-MOTO/2022/R7/YZF690/86433"
npm run check-data   # sanity-check every bike file
```

- Make, model, year and code are inferred from the URL. Override them with `--make`, `--model`, `--year`, `--code` and `--id`.
- The scraper honours `robots.txt`, makes at most 1 request per second and caches pages in `scraper/.cache/`. Re-runs are free; pass `--refresh` to re-download.
- Commit the generated JSON under `public/data/`.

> **Status:** the parser in `scraper/src/parse.ts` has only been tested against
> hand-written HTML fixtures so far, because the source site wasn't reachable
> from the build environment. Run it against the real site, and if any field
> comes out empty, add a saved real page to `scraper/test/fixtures/` and adjust the parser.

## How the 3D view works

There are no CAD models. Everything comes from the parts list:

| Piece | File | What it does |
| --- | --- | --- |
| Categories | `shared/categories.ts` | Maps assembly names (e.g. "FRONT FORK") to a component category. |
| Shapes | `src/viewer/shapes.ts` | Maps part descriptions to primitives: bolt → thin cylinder, nut → hex, washer/O-ring → ring, gear → toothed disc, spring → helix, cover → panel, hose → tube, wheel → large ring, and so on. |
| Layout | `src/viewer/layout.ts` | Assembled: each category sits at its place on a rough bike silhouette. Exploded: category blocks fan out around the bike, with each assembly's parts on a grid ordered by diagram ref. |
| Rendering | `src/viewer/scene.ts` | Three.js with one `InstancedMesh` per shape, blueprint-style wireframes, raycast picking, and camera fly-to. |

Controls: drag to orbit, scroll to zoom, click a part to select it, double-click to isolate an
assembly, <kbd>Esc</kbd> to clear. Every selection is a shareable URL (`#/bike/<id>/<assembly>/<index>`).

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` / `build` / `preview` | Vite dev server, production build to `dist/`, and a local preview of the build. |
| `npm test` | Unit tests: parser, categories, shapes, layout. |
| `npm run smoke -- [url] [screenshotDir]` | Playwright browser test against a running dev server, using **synthetic** data (`e2e/syntheticBike.ts`). Set `CHROMIUM_PATH` to use a system Chromium. |
| `npm run scrape -- <url>` | Scrape a bike into `public/data/`. |
| `npm run check-data` | Validate the scraped bike files. |

Pushes to `main` deploy to GitHub Pages through `.github/workflows/deploy.yml`. To turn this on, set Settings → Pages → Source to *GitHub Actions*.

## Data notes

Part data, prices and diagrams belong to the source catalog. The site links to
diagrams and product pages instead of re-hosting them. Prices are a snapshot from
the scrape date (`scrapedAt`). Check the source's terms before launching publicly.
