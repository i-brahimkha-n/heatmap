"""Step 1 - load raw FIRMS CSVs, apply the same quality rules to every sensor, save one tidy table.

Rules (identical for all sensors so counts are comparable):
  * type == 0            -> presumed vegetation fire (drops static land sources such as gas flares, and offshore)
  * confidence           -> nominal or high only
                            MODIS: numeric 30-100   VIIRS: 'n' or 'h'  (both agencies' "low" class dropped)
  * inside Pakistan      -> polygon test on the detection centre
Output columns: lat, lng, date, time, sensor, sat (T=Terra A=Aqua S=S-NPP N=NOAA-20), frp, conf, daynight
Usage: python clean.py <raw_dir_with_subfolders> <out.pkl>
"""
import glob, os, sys
import numpy as np, pandas as pd

PK_POLY = [
  [61.6, 25.05], [61.8, 26.2], [63.2, 26.7], [63.2, 27.2], [62.8, 28.2], [62.4, 29.4],
  [63.6, 29.5], [64.4, 29.6], [66.2, 29.85], [66.4, 30.9], [67.8, 31.6], [69.3, 31.9],
  [69.3, 33.0], [70.3, 33.9], [71.1, 34.05], [71.4, 35.2], [71.6, 36.0], [72.8, 36.9],
  [74.8, 37.0], [75.9, 36.7], [77.8, 35.5], [76.7, 34.9], [75.0, 34.6], [74.2, 34.0],
  [74.0, 33.2], [74.5, 32.8], [75.3, 32.3], [74.7, 31.9], [74.6, 31.0], [74.1, 30.5],
  [73.8, 29.9], [72.9, 29.0], [71.9, 27.9], [70.9, 27.7], [70.2, 26.9], [70.4, 26.1],
  [70.1, 25.7], [70.4, 25.2], [70.9, 24.75], [71.1, 24.4], [70.6, 24.1], [69.6, 24.0],
  [68.7, 23.8], [68.2, 23.65], [67.45, 24.1], [67.3, 24.75], [66.7, 24.75], [66.5, 25.4],
  [64.6, 25.3], [62.3, 25.0],
]

def in_polygon(lat, lng, poly=PK_POLY):
    """Vectorised ray casting. poly is [lng, lat] pairs."""
    lat = np.asarray(lat); lng = np.asarray(lng)
    inside = np.zeros(lat.shape, dtype=bool)
    j = len(poly) - 1
    for i in range(len(poly)):
        xi, yi = poly[i]; xj, yj = poly[j]
        cond = (yi > lat) != (yj > lat)
        with np.errstate(divide='ignore', invalid='ignore'):
            xint = (xj - xi) * (lat - yi) / (yj - yi) + xi
        inside ^= cond & (lng < xint)
        j = i
    return inside

SENSORS = {'modis': 'MODIS', 'snpp': 'SNPP', 'n20': 'N20'}

def load_one(path, sensor):
    df = pd.read_csv(path, low_memory=False)
    n0 = len(df)
    if sensor == 'MODIS':
        conf = pd.to_numeric(df['confidence'], errors='coerce')
        keep = (df['type'] == 0) & (conf >= 30)
        conf_out = conf
    else:
        c = df['confidence'].astype(str).str.lower()
        keep = (df['type'] == 0) & c.isin(['n', 'h'])
        conf_out = c.map({'n': 60, 'h': 90})
    out = pd.DataFrame({
        'lat': df['latitude'].round(4), 'lng': df['longitude'].round(4),
        'date': df['acq_date'], 'time': df['acq_time'].astype(int),
        'sensor': sensor,
        'sat': (df['satellite'].astype(str).str[0] if sensor == 'MODIS' else ('S' if sensor == 'SNPP' else 'N')),
        'frp': df['frp'].astype(float),
        'conf': conf_out, 'daynight': df['daynight'],
    })[keep]
    stats = {'rows': n0, 'after_type_conf': len(out)}
    inside = in_polygon(out['lat'].values, out['lng'].values)
    out = out[inside]
    stats['after_polygon'] = len(out)
    return out, stats

if __name__ == '__main__':
    raw, outp = sys.argv[1], sys.argv[2]
    parts, tot = [], {}
    for folder, sensor in SENSORS.items():
        for f in sorted(glob.glob(os.path.join(raw, folder, '*.csv'))):
            d, s = load_one(f, sensor)
            parts.append(d)
            for k, v in s.items():
                tot[(sensor, k)] = tot.get((sensor, k), 0) + v
    df = pd.concat(parts, ignore_index=True)
    df['date'] = pd.to_datetime(df['date'])
    df.to_pickle(outp)
    print('cleaning summary (rows -> after type/confidence -> after Pakistan polygon)')
    for sensor in SENSORS.values():
        print(f"  {sensor:6s} {tot[(sensor,'rows')]:>9,} -> {tot[(sensor,'after_type_conf')]:>9,} -> {tot[(sensor,'after_polygon')]:>9,}")
    print('total kept', f'{len(df):,}')
