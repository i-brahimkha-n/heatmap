# Deploying HeatMap (no local setup needed)

## 1. Put the code on GitHub
Option A, web upload (easiest):
1. Open your `heatmap` repo on github.com > "Add file" > "Upload files".
2. Unzip this project, drag in the CONTENTS of the folder (package.json, index.html, src, public, pipeline, tests, ...). Keep the folder structure.
   - GitHub allows about 100 files per browser upload. `public/data/points` has 56 files, so upload in two batches: first everything except `public/data/points`, commit, then upload the `points` folder.
3. Commit to `main`.

## 2. Deploy on Vercel (free)
1. Go to vercel.com > Sign up with GitHub.
2. "Add New..." > Project > import `heatmap` > Framework Preset should show Vite.
3. Leave build command `npm run build` and output `dist`. Click Deploy.
4. In about a minute you get a link like heatmap-xxxx.vercel.app. Every future commit to GitHub redeploys automatically.
(The 100 MB limit applies to CLI uploads; deploying from GitHub works with this 42 MB of data.)

## 3. Check it
Open the link, skip the intro, click the globe, press NOW, download a CSV.

## Alternative: GitHub Pages
Repo Settings > Pages > Source "GitHub Actions" > use the "Vite" workflow, and set `base: '/heatmap/'` in vite.config.js.

## Later
- Add MODIS 2000–2011 files to extend the calendar (re-run pipeline).
- Custom domain: Vercel > Project > Settings > Domains.
