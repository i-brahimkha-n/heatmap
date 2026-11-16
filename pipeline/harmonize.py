"""Step 2 - MODIS/VIIRS harmonization + app data export.

Problem: VIIRS (375 m) detects ~4.5x more hotspots than MODIS (1 km), and the ratio changes with
the season (about 3x in winter, up to ~9x in summer), so MODIS counts cannot be compared with VIIRS
counts directly. Method ("seasonal regional calibration"):

  1. Count hotspots per 0.1 deg cell per month for every sensor (same quality filters, see clean.py).
  2. In the years where both sensors fly (VIIRS S-NPP is the reference, full months from 2012-02),
     compute a conversion ratio  R = VIIRS / MODIS  for every 2-degree region x month-of-year.
     Sparse regions are shrunk toward the national seasonal ratio:  R = (V + L*Rnat) / (M + L).
  3. A MODIS-only month is converted to "VIIRS-equivalent" hotspots:  H = MODIS * R(region, month).
     Harmonized series = VIIRS where it exists, converted MODIS where it does not.
     Days when VIIRS S-NPP had an outage (or had not yet launched) are gap-filled per cell:
         fill = max(0, MODIS * R - VIIRS)     ->  harmonized month  H = VIIRS + fill
  4. Validation: leave-one-year-out and a back-cast (calibrate on 2018-2025, predict 2012-2017).

Usage: python harmonize.py <clean.pkl> <out_dir>
Outputs in <out_dir>: cells.json, calibration.json, validation.json, meta.json, points/YYYY-Qn.csv
"""
import json, os, sys
import numpy as np, pandas as pd

GRID = 0.1            # export grid (degrees)
REGION_DEG = 2.0      # calibration regions
LAM = 20.0            # shrinkage pseudo-count (MODIS detections)
FULL_VIIRS_FROM = '2012-02'   # S-NPP started 20 Jan 2012, so Jan 2012 is partial
SENSORS = ['MODIS', 'SNPP', 'N20']

def month_key(s): return s.dt.strftime('%Y-%m')

def cell_table(df, grid, region_deg):
    d = pd.DataFrame({
        'ci': np.floor(df.lat.values / grid).astype(int),
        'cj': np.floor(df.lng.values / grid).astype(int),
        'ym': df.ym.values, 's': df.sensor.values})
    g = d.groupby(['ci', 'cj', 'ym', 's']).size().unstack(fill_value=0).reset_index()
    for s in SENSORS:
        if s not in g: g[s] = 0
    g['ri'] = np.floor((g.ci + 0.5) * grid / region_deg).astype(int)
    g['rj'] = np.floor((g.cj + 0.5) * grid / region_deg).astype(int)
    g['year'] = g.ym.str[:4].astype(int); g['moy'] = g.ym.str[5:7].astype(int)
    return g

def fit_ratios(tr):
    nat = tr.groupby('moy')[['MODIS', 'SNPP']].sum()
    nat_r = nat.SNPP / nat.MODIS
    rg = tr.groupby(['ri', 'rj', 'moy'])[['MODIS', 'SNPP']].sum().reset_index()
    rg['nat'] = rg.moy.map(nat_r)
    rg['R'] = (rg.SNPP + LAM * rg.nat) / (rg.MODIS + LAM)
    return nat_r, rg, tr.SNPP.sum() / tr.MODIS.sum()

def predict(te, tr, mode):
    nat_r, rg, const = fit_ratios(tr)
    te = te.copy()
    if mode == 'constant ratio':
        te['pred'] = te.MODIS * const
    elif mode == 'seasonal (national)':
        te['pred'] = te.MODIS * te.moy.map(nat_r)
    else:
        te = te.merge(rg[['ri', 'rj', 'moy', 'R']], on=['ri', 'rj', 'moy'], how='left')
        te['R'] = te.R.fillna(te.moy.map(nat_r))
        te['pred'] = te.MODIS * te.R
    return te

def metrics(p):
    a, b = p.SNPP.values, p.pred.values
    nm = p.groupby('ym')[['SNPP', 'pred']].sum()
    ny = p.groupby('year')[['SNPP', 'pred']].sum()
    r2 = lambda x, y: 1 - ((x - y) ** 2).sum() / ((x - x.mean()) ** 2).sum()
    return {
        'cell_r2': round(float(r2(a, b)), 3),
        'national_month_r2': round(float(r2(nm.SNPP.values, nm.pred.values)), 3),
        'national_month_mape_pct': round(float(100 * (abs(nm.SNPP - nm.pred) / nm.SNPP).mean()), 1),
        'annual_mape_pct': round(float(100 * (abs(ny.SNPP - ny.pred) / ny.SNPP).mean()), 1),
        'bias_pct': round(float(100 * (p.pred.sum() / p.SNPP.sum() - 1)), 1),
    }

MODES = ['constant ratio', 'seasonal (national)', 'seasonal regional (chosen)']

def validate(df):
    ov = df[(df.sensor.isin(['MODIS', 'SNPP'])) & (df.ym >= FULL_VIIRS_FROM)]
    loyo, back, national = [], [], None
    for grid in (0.1, 0.25, 0.5, 1.0):
        g = cell_table(ov, grid, REGION_DEG)
        for mode in MODES:
            parts = [predict(g[g.year == Y], g[g.year != Y], mode) for Y in sorted(g.year.unique())]
            p = pd.concat(parts)
            loyo.append({'grid_deg': grid, 'method': mode, **metrics(p)})
            if grid == 0.5 and mode == MODES[-1]:
                nm = p.groupby('ym')[['MODIS', 'SNPP', 'pred']].sum()
                n20 = df[df.sensor == 'N20'].groupby('ym').size().reindex(nm.index, fill_value=0)
                national = {'months': list(nm.index), 'modis': nm.MODIS.astype(int).tolist(),
                            'snpp': nm.SNPP.astype(int).tolist(), 'n20': n20.astype(int).tolist(),
                            'modis_converted_loyo': nm.pred.round(1).tolist()}
            # back-cast: calibrate on 2018-2025, predict 2012-2017 (what a real pre-VIIRS back-cast looks like)
            tr, te = g[g.year >= 2018], g[g.year <= 2017]
            pb = predict(te, tr, mode)
            back.append({'grid_deg': grid, 'method': mode, **metrics(pb)})
    return loyo, back, national

def main(pkl, out):
    os.makedirs(os.path.join(out, 'points'), exist_ok=True)
    df = pd.read_pickle(pkl)
    df['ym'] = month_key(df.date)

    # ---------- calibration (final, all overlap years) ----------
    g = cell_table(df, GRID, REGION_DEG)
    tr = g[g.ym >= FULL_VIIRS_FROM]
    nat_r, rg, const = fit_ratios(tr)
    regions = []
    for (ri, rj), grp in rg.groupby(['ri', 'rj']):
        R = [None] * 12
        for _, r in grp.iterrows(): R[int(r.moy) - 1] = round(float(r.R), 3)
        R = [x if x is not None else round(float(nat_r[m + 1]), 3) for m, x in enumerate(R)]
        regions.append({'ri': int(ri), 'rj': int(rj), 'lat0': ri * REGION_DEG, 'lng0': rj * REGION_DEG, 'R': R})
    calibration = {
        'method': 'seasonal regional calibration', 'reference_sensor': 'VIIRS S-NPP',
        'region_deg': REGION_DEG, 'shrinkage_lambda': LAM, 'calibration_months': f'{FULL_VIIRS_FROM} to {df.ym.max()}',
        'overall_ratio': round(float(const), 3),
        'national_by_month': [round(float(nat_r[m]), 3) for m in range(1, 13)],
        'regions': regions,
        'note': 'H = MODIS_count * R(region(cell), month_of_year). Month = VIIRS count when VIIRS exists.'}
    json.dump(calibration, open(os.path.join(out, 'calibration.json'), 'w'), separators=(',', ':'))

    # ---------- VIIRS outage days -> gap fill with converted MODIS ----------
    mv = df[df.sensor.isin(['MODIS', 'SNPP'])]
    day = mv.groupby(['date', 'sensor']).size().unstack(fill_value=0)
    day = day.reindex(pd.date_range(df.date.min(), df.date.max()), fill_value=0)
    exp = day.MODIS.values * nat_r.reindex(day.index.month).values
    outage = (day.index < pd.Timestamp('2012-01-20')) | ((day.MODIS.values >= 5) & (day.SNPP.values < 0.25 * exp))
    gap_days = day.index[outage]
    sub = mv[mv.date.isin(gap_days)]
    cd = pd.DataFrame({'ci': np.floor(sub.lat.values / GRID).astype(int), 'cj': np.floor(sub.lng.values / GRID).astype(int),
                       'date': sub.date.values, 's': sub.sensor.values})
    cd = cd.groupby(['ci', 'cj', 'date', 's']).size().unstack(fill_value=0).reset_index()
    for sname in ('MODIS', 'SNPP'):
        if sname not in cd: cd[sname] = 0
    cd['date'] = pd.to_datetime(cd['date'])
    cd['moy'] = cd.date.dt.month; cd['ym'] = cd.date.dt.strftime('%Y-%m')
    cd['ri'] = np.floor((cd.ci + 0.5) * GRID / REGION_DEG).astype(int); cd['rj'] = np.floor((cd.cj + 0.5) * GRID / REGION_DEG).astype(int)
    cd = cd.merge(rg[['ri', 'rj', 'moy', 'R']], on=['ri', 'rj', 'moy'], how='left')
    cd['R'] = cd.R.fillna(cd.moy.map(nat_r))
    cd['fill'] = np.maximum(0, cd.MODIS * cd.R - cd.SNPP)
    fill = cd.groupby(['ci', 'cj', 'ym']).fill.sum().reset_index()
    g = g.merge(fill, on=['ci', 'cj', 'ym'], how='left')
    g['fill'] = g.fill.fillna(0).round(1)
    gap_total = float(g.fill.sum())

    # ---------- cells.json (sparse monthly counts per 0.1 deg cell) ----------
    cells = g[['ci', 'cj', 'ri', 'rj']].drop_duplicates().sort_values(['ci', 'cj']).reset_index(drop=True)
    cells['k'] = cells.index
    rid = {(r['ri'], r['rj']): n for n, r in enumerate(regions)}
    g = g.merge(cells[['ci', 'cj', 'k']], on=['ci', 'cj'])
    months = {}
    for ym, grp in g.groupby('ym'):
        grp = grp.sort_values('k')
        months[ym] = {'k': grp.k.tolist(), 'm': grp.MODIS.astype(int).tolist(),
                      's': grp.SNPP.astype(int).tolist(), 'n': grp.N20.astype(int).tolist(),
                      'f': [int(x) if float(x).is_integer() else round(float(x), 1) for x in grp.fill]}
    cj = {'grid_deg': GRID, 'cell_i': cells.ci.tolist(), 'cell_j': cells.cj.tolist(),
          'cell_region': [rid.get((a, b), -1) for a, b in zip(cells.ri, cells.rj)],
          'sensors': {'m': 'MODIS (Terra+Aqua)', 's': 'VIIRS S-NPP', 'n': 'VIIRS NOAA-20', 'f': 'gap-fill (converted MODIS on VIIRS outage days)'},
          'months': months}
    json.dump(cj, open(os.path.join(out, 'cells.json'), 'w'), separators=(',', ':'))

    # ---------- point files for CSV download (one file per quarter keeps the repo small and easy to upload) ----------
    n_points = 0
    df['q'] = df.date.dt.year.astype(str) + '-Q' + ((df.date.dt.month - 1) // 3 + 1).astype(str)
    for q, grp in df.groupby('q'):
        grp = grp.sort_values(['date', 'time'])
        o = pd.DataFrame({'md': grp.date.dt.strftime('%m-%d'), 'hhmm': grp.time.astype(int).map('{:04d}'.format),
                          'lat': grp.lat.round(3), 'lng': grp.lng.round(3), 'sat': grp.sat,
                          'frp': grp.frp.round(1), 'conf': grp.conf.astype(int)})
        o.to_csv(os.path.join(out, 'points', f'{q}.csv'), index=False)
        n_points += len(o)

    # ---------- validation ----------
    loyo, back, national = validate(df)
    ov = df[(df.ym >= FULL_VIIRS_FROM) & df.sensor.isin(['MODIS', 'SNPP'])]
    mm = ov.groupby(['ym', 'sensor']).size().unstack(fill_value=0)
    mm['moy'] = mm.index.str[5:7].astype(int)
    by_moy = (mm.groupby('moy').SNPP.sum() / mm.groupby('moy').MODIS.sum()).round(2)
    nn = df[df.sensor.isin(['SNPP', 'N20']) & (df.ym >= '2018-05')].groupby(['ym', 'sensor']).size().unstack(fill_value=0)
    validation = {
        'loyo': loyo, 'backcast_2018_2025_to_2012_2017': back, 'national': national,
        'ratio_viirs_over_modis_by_month': by_moy.tolist(),
        'n20_vs_snpp': {'monthly_correlation': round(float(np.corrcoef(nn.SNPP, nn.N20)[0, 1]), 3),
                        'ratio_n20_over_snpp': round(float(nn.N20.sum() / nn.SNPP.sum()), 3)}}
    json.dump(validation, open(os.path.join(out, 'validation.json'), 'w'), separators=(',', ':'))

    meta = {'first_date': str(df.date.min().date()), 'last_date': str(df.date.max().date()),
            'detections': int(n_points), 'by_sensor': df.groupby('sensor').size().to_dict(),
            'filters': 'type=0 (vegetation fire); confidence nominal/high (MODIS>=30, VIIRS n/h); inside Pakistan outline',
            'viirs_reference_from': FULL_VIIRS_FROM,
            'viirs_gap_days': [str(d.date()) for d in gap_days], 'viirs_gap_fill_hotspots': round(gap_total)}
    json.dump(meta, open(os.path.join(out, 'meta.json'), 'w'), indent=1)
    print('done', meta)

if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
