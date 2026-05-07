# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev       # Start dev server (Vite, localhost:5173)
npm run build     # Production build
npm run preview   # Preview production build locally
```

No test runner or linter is configured.

## Stack

- **React 18** + **Vite 6** — no TypeScript, JSX only
- **MapLibre GL** (`maplibre-gl`) — map rendering, no API key required (CARTO Positron basemap)
- **Zustand** — global state (`src/store/mapStore.js`)
- **Tailwind CSS v3** — utility styling, no component library
- **Overpass API** — live OSM data fetched on demand (no backend)

## Architecture

### Data flow

```
mapStore (Zustand)
  ├── activeLayers   → useMapLayers (adds/removes MapLibre sources & layers)
  ├── amenityData    → useMapLayers (renders amenity circles)
  └── selectedCategory → useAmenities (scopes Overpass query)
```

`App.jsx` mounts `<Map>` which initialises the MapLibre instance and calls `onMapReady(map)`. The map ref is lifted into `App` state and passed to `<MapController>`, a render-null component that runs `useMapLayers(map)`. This pattern keeps the map instance out of Zustand while letting hooks react to store changes.

### Layer management (`src/hooks/useMapLayers.js`)

All MapLibre source/layer add/remove logic lives here. District boundaries are pre-built at module load time from `districtBoundaries.json` into a single merged GeoJSON `FeatureCollection`. Layers are toggled by switching `visibility` to `'none'`/`'visible'` rather than adding/removing — except on first toggle where the source is added.

### District boundary data (`src/data/districtBoundaries.json`)

Keyed by district name (matching `DISTRICT_COLORS` keys in `districtConfig.js`). Each value is a GeoJSON `FeatureCollection`. Coordinates are WGS84 `[lon, lat]`. This file is the source of truth for polygon shapes — if boundaries look wrong, the coordinates here need to be verified against OSM or official Wolfsburg Stadtteile data.

### Amenities (`src/hooks/useAmenities.js`)

Queries Overpass API at `https://overpass-api.de/api/interpreter` using the administrative boundary of Wolfsburg. Only `node` elements with `lat`/`lon` are converted to GeoJSON points — `way` and `relation` elements from OSM are discarded. Category coloring is defined in both `useAmenities.js` (`CATEGORY_COLORS`) and `useMapLayers.js` (the `circle-color` expression) — keep them in sync.

## UI layout

The app is full-viewport. `<Sidebar>` is `absolute left-0`, the map fills `absolute left-60 … right-0`. `<NeighbourhoodsButton>` floats `absolute top-3 right-3` inside the map area. The design palette is dark navy `#16213e` (panel) + indigo `#818cf8` (accent).
