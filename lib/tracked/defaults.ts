// Default configuration of the primary tracked event. The same values are inserted by the
// 20261010090000_tracked_event migration for existing databases; analysts can edit the terms afterwards.
export const IRKUTSK_TRACKED = {
  outbreakSlug: "russia-irkutsk-2026",
  name: "Irkutsk investigation",
  originCountryCode: "RU",
  originAdmin1: "Irkutsk Oblast",
  anchorTerms: ["irkutsk", "shelekhov", "shelikhov", "shelehov", "anti-plague research institute", "anti-plague institute", "иркутск", "шелехов", "противочумн"],
  contextTerms: ["plague", "yersinia", "pneumonia", "pathogen", "infection", "infectious", "epidemiolog", "quarantine", "quarantined", "contacts", "under observation", "laboratory", "lab worker", "technician", "researcher", "rospotrebnadzor", "outbreak", "virus", "bacteri", "tested", "test results", "unknown origin", "чум", "пневмони", "карантин", "роспотребнадзор", "инфекц"],
  weakAnchorTerms: ["siberia", "siberian", "сибир"],
  mapCenterLat: 52.25,
  mapCenterLng: 104.2,
  mapZoom: 8.6,
} as const;
