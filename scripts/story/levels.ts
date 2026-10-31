// Guardian (world boss) level of every Việt Nam Odyssey province, in route order (V30). Bands of the spec:
// provinces 1–7 Lv 1–25 · 8–15 Lv 25–45 · 16–24 Lv 45–65 · 25–32 Lv 65–85 · 33–36 Lv 85–100.
// Used by scripts/rescale-vn-levels.ts (province maps, encounter regions) and scripts/story/vietnam.ts (story levels).
export const BOSS_LEVEL: Record<string, number> = {
  'ca-mau': 12, 'an-giang': 14, 'can-tho': 16, 'vinh-long': 18, 'tra-vinh': 21, 'ben-tre': 23, 'dong-thap': 25,
  'tay-ninh': 28, 'ho-chi-minh': 31, 'dong-nai': 33, 'lam-dong': 36, 'khanh-hoa': 38, 'dak-lak': 41, 'gia-lai': 43, 'quang-ngai': 45,
  'da-nang': 47, 'hue': 50, 'quang-tri': 52, 'ha-tinh': 55, 'nghe-an': 57, 'thanh-hoa': 59, 'ninh-binh': 61, 'hung-yen': 63, 'hai-phong': 65,
  'bac-ninh': 67, 'quang-ninh': 70, 'lang-son': 72, 'cao-bang': 75, 'thai-nguyen': 77, 'tuyen-quang': 80, 'lao-cai': 82, 'lai-chau': 85,
  'dien-bien': 88, 'son-la': 92, 'phu-tho': 96, 'ha-noi': 100,
};
