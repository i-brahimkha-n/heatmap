export const PAKISTAN_ZONES = {
  peshawar: { name: 'Peshawar, KP', lat: 34.01, lng: 71.52 },
  islamabad: { name: 'Islamabad Capital Territory', lat: 33.68, lng: 73.04 },
  rawalpindi: { name: 'Rawalpindi, Punjab', lat: 33.56, lng: 73.01 },
  lahore: { name: 'Lahore, Punjab', lat: 31.52, lng: 74.35 },
  faisalabad: { name: 'Faisalabad, Punjab', lat: 31.45, lng: 73.13 },
  multan: { name: 'Multan, Punjab', lat: 30.15, lng: 71.52 },
  gujranwala: { name: 'Gujranwala, Punjab', lat: 32.18, lng: 74.19 },
  sialkot: { name: 'Sialkot, Punjab', lat: 32.49, lng: 74.52 },
  bahawalpur: { name: 'Bahawalpur, Punjab', lat: 29.35, lng: 71.69 },
  sargodha: { name: 'Sargodha, Punjab', lat: 32.07, lng: 72.68 },
  'rahim yar khan': { name: 'Rahim Yar Khan, Punjab', lat: 28.42, lng: 70.3 },
  jhelum: { name: 'Jhelum, Punjab', lat: 32.93, lng: 73.73 },
  sahiwal: { name: 'Sahiwal, Punjab', lat: 30.67, lng: 73.1 },
  karachi: { name: 'Karachi, Sindh', lat: 24.86, lng: 67.0 },
  hyderabad: { name: 'Hyderabad, Sindh', lat: 25.39, lng: 68.35 },
  sukkur: { name: 'Sukkur, Sindh', lat: 27.72, lng: 68.82 },
  larkana: { name: 'Larkana, Sindh', lat: 27.55, lng: 68.2 },
  nawabshah: { name: 'Nawabshah, Sindh', lat: 26.25, lng: 68.4 },
  thatta: { name: 'Thatta, Sindh', lat: 24.75, lng: 67.92 },
  mithi: { name: 'Mithi (Thar), Sindh', lat: 24.74, lng: 69.8 },
  quetta: { name: 'Quetta, Balochistan', lat: 30.17, lng: 66.97 },
  gwadar: { name: 'Gwadar, Balochistan', lat: 25.12, lng: 62.32 },
  turbat: { name: 'Turbat, Balochistan', lat: 26.0, lng: 63.05 },
  khuzdar: { name: 'Khuzdar, Balochistan', lat: 27.8, lng: 66.61 },
  zhob: { name: 'Zhob, Balochistan', lat: 31.34, lng: 69.45 },
  gilgit: { name: 'Gilgit, Gilgit-Baltistan', lat: 35.92, lng: 74.31 },
  skardu: { name: 'Skardu, Gilgit-Baltistan', lat: 35.32, lng: 75.55 },
  hunza: { name: 'Hunza, Gilgit-Baltistan', lat: 36.32, lng: 74.65 },
  muzaffarabad: { name: 'Muzaffarabad, AJK', lat: 34.37, lng: 73.47 },
  mardan: { name: 'Mardan, KP', lat: 34.19, lng: 72.04 },
  swat: { name: 'Swat Valley, KP', lat: 35.22, lng: 72.42 },
  abbottabad: { name: 'Abbottabad, KP', lat: 34.16, lng: 73.22 },
  chitral: { name: 'Chitral, KP', lat: 35.85, lng: 71.78 },
  kohat: { name: 'Kohat, KP', lat: 33.59, lng: 71.44 },
  bannu: { name: 'Bannu, KP', lat: 32.99, lng: 70.6 },
  'dera ismail khan': { name: 'D.I. Khan, KP', lat: 31.86, lng: 70.9 },
};

export function findZone(q) {
  const s = q.toLowerCase().trim();
  const key = Object.keys(PAKISTAN_ZONES).find(
    (k) => k === s || k.includes(s) || PAKISTAN_ZONES[k].name.toLowerCase().includes(s),
  );
  return key ? PAKISTAN_ZONES[key] : null;
}
