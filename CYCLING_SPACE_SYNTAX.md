# Cycling Space Syntax Layer — Implementation Guide

Pick up here once the Grasshopper cycling CSV is ready.
Everything follows the pedestrian frequency layer (`spaceFrequency`) exactly.

---

## 1 — CSV format & placement

The CSV must have the same columns as `wolfsburg_frequency.csv`:

```
id, lon_start, lat_start, lon_end, lat_end, frequency
```

Copy it into `public/` so Vite serves it at the correct base URL:

```
public/wolfsburg_cycling_frequency.csv   ← suggested name
```

---

## 2 — mapStore.js  (`src/store/mapStore.js`)

Add two new entries to `activeLayers`:

```js
cyclingSpaceFrequency: false,
```

Add two new state fields alongside the pedestrian ones:

```js
cyclingSpaceFrequencyData: null,
isLoadingCyclingSpaceFrequency: false,
```

Add two new setters:

```js
setCyclingSpaceFrequencyData: (data) => set({ cyclingSpaceFrequencyData: data }),
setLoadingCyclingSpaceFrequency: (val) => set({ isLoadingCyclingSpaceFrequency: val }),
```

---

## 3 — useMovement.js  (`src/hooks/useMovement.js`)

### 3a — Destructure new setters

Add to the `useMapStore()` destructure at the top of `useMovement()`:

```js
setCyclingSpaceFrequencyData, setLoadingCyclingSpaceFrequency,
```

### 3b — Add fetch function

Copy `fetchSpaceFrequency` exactly, with these three differences:

| Detail | Pedestrian | Cycling |
|---|---|---|
| CSV filename | `wolfsburg_frequency.csv` | `wolfsburg_cycling_frequency.csv` |
| Strava activity type | `'running'` | `'riding'` |
| Store setter | `setSpaceFrequencyData` / `setLoadingSpaceFrequency` | `setCyclingSpaceFrequencyData` / `setLoadingCyclingSpaceFrequency` |

```js
async function fetchCyclingSpaceFrequency() {
  setLoadingCyclingSpaceFrequency(true)
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}wolfsburg_cycling_frequency.csv`)
    const text = await res.text()
    const lines = text.trim().split('\n')
    const rows = lines.slice(1).map(line => {
      const [, lon_start, lat_start, lon_end, lat_end, frequency] = line.split(',')
      return {
        lonStart: parseFloat(lon_start),
        latStart: parseFloat(lat_start),
        lonEnd:   parseFloat(lon_end),
        latEnd:   parseFloat(lat_end),
        freq:     parseFloat(frequency),
      }
    }).filter(r => !isNaN(r.freq))

    const ranked = rows.map((r, i) => ({ freq: r.freq, i })).sort((a, b) => a.freq - b.freq)
    const n = ranked.length
    const ssPercentile = new Array(n)
    ranked.forEach(({ i }, rank) => { ssPercentile[i] = n > 1 ? Math.round((rank / (n - 1)) * 100) : 100 })

    const { stravaToken } = useMapStore.getState()
    let stravaMids = []
    if (stravaToken) {
      try {
        const stravaData = await fetchStravaSegments('riding', stravaToken)   // <-- 'riding' not 'running'
        stravaMids = (stravaData?.features ?? []).map(f => {
          const c = f.geometry.coordinates
          return {
            lon: (c[0][0] + c[c.length - 1][0]) / 2,
            lat: (c[0][1] + c[c.length - 1][1]) / 2,
            score: f.properties.score,
          }
        })
      } catch (err) {
        if (err.message === 'strava_401') { setStravaToken(null); localStorage.removeItem('strava_token') }
      }
    }

    function closestStravaScore(midLon, midLat) {
      let bestD2 = 60 * 60, score = null
      for (const s of stravaMids) {
        const dx = (midLon - s.lon) * LON_M
        const dy = (midLat - s.lat) * LAT_M
        const d2 = dx * dx + dy * dy
        if (d2 < bestD2) { bestD2 = d2; score = s.score }
      }
      return score
    }

    const features = rows.map((r, i) => {
      const start = ssWarp(r.lonStart, r.latStart)
      const end   = ssWarp(r.lonEnd,   r.latEnd)
      const stravaS = stravaMids.length
        ? closestStravaScore((start[0] + end[0]) / 2, (start[1] + end[1]) / 2)
        : null
      return {
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: [start, end] },
        properties: {
          id: i,
          frequency: r.freq,
          percentile: stravaS !== null ? Math.round((ssPercentile[i] + stravaS) / 2) : ssPercentile[i],
        },
      }
    })

    setCyclingSpaceFrequencyData({ type: 'FeatureCollection', features })
  } catch (err) {
    console.error('Cycling space frequency fetch error:', err)
  } finally {
    setLoadingCyclingSpaceFrequency(false)
  }
}
```

### 3c — Export the function

Add `fetchCyclingSpaceFrequency` to the return object:

```js
return { fetchPedestrian, fetchCycling, fetchCycleParking, fetchBusStops,
         fetchStravaCycling, fetchSpaceFrequency, fetchCyclingSpaceFrequency }
```

---

## 4 — useMapLayers.js  (`src/hooks/useMapLayers.js`)

### 4a — Destructure new data

Add to the `useMapStore()` destructure:

```js
cyclingSpaceFrequencyData,
```

### 4b — Add layer effect

Copy the `spaceFrequency` effect block exactly, changing:

| Detail | Pedestrian | Cycling |
|---|---|---|
| Source id | `'space-frequency'` | `'cycling-space-frequency'` |
| Layer id | `'space-frequency-lines'` | `'cycling-space-frequency-lines'` |
| Store key | `activeLayers.spaceFrequency` | `activeLayers.cyclingSpaceFrequency` |
| Data | `spaceFrequencyData` | `cyclingSpaceFrequencyData` |

Also update `raiseTopLayers` to raise both SS layers:

```js
function raiseTopLayers(map) {
  for (const lyr of ['strava-heatmap-run-layer', 'strava-heatmap-ride-layer']) {
    if (map.getLayer(lyr) && map.getLayoutProperty(lyr, 'visibility') !== 'none') {
      map.moveLayer(lyr)
    }
  }
  for (const lyr of ['space-frequency-lines', 'cycling-space-frequency-lines']) {
    if (map.getLayer(lyr) && map.getLayoutProperty(lyr, 'visibility') !== 'none') {
      map.moveLayer(lyr)
    }
  }
}
```

### 4c — Effect dependency array

```js
}, [map, activeLayers.cyclingSpaceFrequency, cyclingSpaceFrequencyData])
```

---

## 5 — TopNav.jsx  (`src/components/TopNav.jsx`)

### 5a — Store destructure

Add:

```js
cyclingSpaceFrequencyData, isLoadingCyclingSpaceFrequency,
```

### 5b — useMovement destructure

Add:

```js
fetchCyclingSpaceFrequency,
```

### 5c — activeNetworks

Add `'cyclingSpaceFrequency'` to the array.

### 5d — handleMovementToggle

```js
if (id === 'cyclingSpaceFrequency' && !cyclingSpaceFrequencyData) fetchCyclingSpaceFrequency()
```

### 5e — INFO_SECTIONS

Add an entry (fill in the methodology details once known):

```js
cyclingSpaceFrequency: {
  title: 'Cycling Frequency',
  groups: [
    {
      label: 'Method',
      color: '#3b82f6',
      tags: ['Betweenness Centrality', 'Space Syntax approach', 'Rhino 8 + Grasshopper'],
    },
    {
      label: 'Network',
      color: '#3b82f6',
      tags: ['cycling network', 'full city of Wolfsburg', '← fill in segment count'],
    },
    {
      label: 'Scoring',
      color: '#3b82f6',
      tags: ['percentile rank 0–100', 'blended with Strava cycling when logged in'],
    },
  ],
},
```

### 5f — UI button

Add a new toggle button inside the Space Syntax section, copying the `spaceFrequency` button and changing:
- `onClick` → `handleMovementToggle('cyclingSpaceFrequency')`
- `disabled` → `isLoadingCyclingSpaceFrequency`
- `activeLayers.spaceFrequency` → `activeLayers.cyclingSpaceFrequency`
- Label → `"Cycling Frequency"`
- Subtitle → `"Space syntax · Strava cycling"`

---

## Notes

- The `ssWarp` 15-point IDW calibration applies to both CSVs — no re-calibration needed.
- Color scheme (blue→teal→green→yellow→orange→red→dark red) is shared — no change needed in the paint expression.
- If the cycling simulation uses different parameters (radius, OD logic, etc.), update the INFO_SECTIONS entry accordingly.
