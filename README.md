# HeatMap

Harmonized MODIS + VIIRS burning-activity calendar for Pakistan, 2012–2025. Built for the NASA Space Apps Challenge "Harmonization of MODIS and VIIRS data".

## Features
- Smog intro that disperses and reveals the HeatMap name
- Zoomable, clickable 3D globe (click anywhere in Pakistan to pick an area; outside Pakistan shows "Data not available")
- Draw an area on a flat map: rectangle, polygon, circle or point, or type latitude/longitude
- Search a Pakistani city or paste "lat, lng"; latitude and longitude are always shown
- Pyro-Ring and calendar grid (hotspots or anomaly vs the multi-year average), play-through timeline
- Month picker 2000–2025 (months before 2012 show "Data not available"), NOW button jumps to 2025
- Charts with PNG download; monthly analytics CSV and hotspot-level CSV for any area and date range
- Early warning: with location permission, tells you if fire activity is within 30 km in the latest archive month
- Method page with measured accuracy of the harmonization

## Run (optional)
    npm install
    npm run dev      # local preview
    npm test         # checks the core maths against the real data
    npm run build    # production build in dist/

## Data
`public/data` holds the processed data (about 42 MB). To rebuild it from FIRMS CSVs:
    python pipeline/clean.py   # raw FIRMS CSV -> clean.pkl
    python pipeline/harmonize.py clean.pkl public/data
See `pipeline/` and the in-app Method page.

## Deploy
See DEPLOY.md.
