/**
 * Départements français : région (découpage 2016) et coordonnées APPROXIMATIVES de la préfecture.
 * Le rayon géographique est calculé de préfecture à préfecture : c'est une approximation
 * (affichée comme telle), suffisante pour un filtre de proximité commerciale.
 */
type Dept = { code: string; name: string; region: string; lat: number; lon: number };

const R = {
  ARA: "Auvergne-Rhône-Alpes",
  BFC: "Bourgogne-Franche-Comté",
  BRE: "Bretagne",
  CVL: "Centre-Val de Loire",
  COR: "Corse",
  GES: "Grand Est",
  HDF: "Hauts-de-France",
  IDF: "Île-de-France",
  NOR: "Normandie",
  NAQ: "Nouvelle-Aquitaine",
  OCC: "Occitanie",
  PDL: "Pays de la Loire",
  PAC: "Provence-Alpes-Côte d'Azur",
  GUA: "Guadeloupe",
  MTQ: "Martinique",
  GUY: "Guyane",
  REU: "La Réunion",
  MAY: "Mayotte",
};

const RAW: [string, string, keyof typeof R, number, number][] = [
  ["01", "Ain", "ARA", 46.205, 5.226],
  ["02", "Aisne", "HDF", 49.564, 3.62],
  ["03", "Allier", "ARA", 46.566, 3.333],
  ["04", "Alpes-de-Haute-Provence", "PAC", 44.092, 6.236],
  ["05", "Hautes-Alpes", "PAC", 44.559, 6.079],
  ["06", "Alpes-Maritimes", "PAC", 43.71, 7.262],
  ["07", "Ardèche", "ARA", 44.735, 4.599],
  ["08", "Ardennes", "GES", 49.773, 4.72],
  ["09", "Ariège", "OCC", 42.965, 1.607],
  ["10", "Aube", "GES", 48.297, 4.074],
  ["11", "Aude", "OCC", 43.213, 2.351],
  ["12", "Aveyron", "OCC", 44.35, 2.575],
  ["13", "Bouches-du-Rhône", "PAC", 43.296, 5.37],
  ["14", "Calvados", "NOR", 49.182, -0.37],
  ["15", "Cantal", "ARA", 44.926, 2.44],
  ["16", "Charente", "NAQ", 45.648, 0.156],
  ["17", "Charente-Maritime", "NAQ", 46.16, -1.151],
  ["18", "Cher", "CVL", 47.081, 2.399],
  ["19", "Corrèze", "NAQ", 45.267, 1.772],
  ["2A", "Corse-du-Sud", "COR", 41.919, 8.738],
  ["2B", "Haute-Corse", "COR", 42.697, 9.45],
  ["21", "Côte-d'Or", "BFC", 47.322, 5.041],
  ["22", "Côtes-d'Armor", "BRE", 48.514, -2.765],
  ["23", "Creuse", "NAQ", 46.171, 1.871],
  ["24", "Dordogne", "NAQ", 45.184, 0.721],
  ["25", "Doubs", "BFC", 47.238, 6.024],
  ["26", "Drôme", "ARA", 44.933, 4.892],
  ["27", "Eure", "NOR", 49.027, 1.151],
  ["28", "Eure-et-Loir", "CVL", 48.444, 1.489],
  ["29", "Finistère", "BRE", 47.996, -4.102],
  ["30", "Gard", "OCC", 43.837, 4.36],
  ["31", "Haute-Garonne", "OCC", 43.605, 1.444],
  ["32", "Gers", "OCC", 43.646, 0.586],
  ["33", "Gironde", "NAQ", 44.838, -0.579],
  ["34", "Hérault", "OCC", 43.611, 3.877],
  ["35", "Ille-et-Vilaine", "BRE", 48.117, -1.678],
  ["36", "Indre", "CVL", 46.811, 1.691],
  ["37", "Indre-et-Loire", "CVL", 47.394, 0.685],
  ["38", "Isère", "ARA", 45.188, 5.725],
  ["39", "Jura", "BFC", 46.675, 5.555],
  ["40", "Landes", "NAQ", 43.89, -0.5],
  ["41", "Loir-et-Cher", "CVL", 47.586, 1.335],
  ["42", "Loire", "ARA", 45.44, 4.387],
  ["43", "Haute-Loire", "ARA", 45.043, 3.885],
  ["44", "Loire-Atlantique", "PDL", 47.218, -1.554],
  ["45", "Loiret", "CVL", 47.903, 1.909],
  ["46", "Lot", "OCC", 44.448, 1.441],
  ["47", "Lot-et-Garonne", "NAQ", 44.203, 0.616],
  ["48", "Lozère", "OCC", 44.518, 3.5],
  ["49", "Maine-et-Loire", "PDL", 47.478, -0.563],
  ["50", "Manche", "NOR", 49.116, -1.091],
  ["51", "Marne", "GES", 48.957, 4.363],
  ["52", "Haute-Marne", "GES", 48.111, 5.139],
  ["53", "Mayenne", "PDL", 48.073, -0.77],
  ["54", "Meurthe-et-Moselle", "GES", 48.692, 6.184],
  ["55", "Meuse", "GES", 48.773, 5.16],
  ["56", "Morbihan", "BRE", 47.658, -2.76],
  ["57", "Moselle", "GES", 49.119, 6.176],
  ["58", "Nièvre", "BFC", 46.99, 3.159],
  ["59", "Nord", "HDF", 50.629, 3.057],
  ["60", "Oise", "HDF", 49.43, 2.081],
  ["61", "Orne", "NOR", 48.432, 0.091],
  ["62", "Pas-de-Calais", "HDF", 50.291, 2.777],
  ["63", "Puy-de-Dôme", "ARA", 45.778, 3.087],
  ["64", "Pyrénées-Atlantiques", "NAQ", 43.295, -0.371],
  ["65", "Hautes-Pyrénées", "OCC", 43.233, 0.078],
  ["66", "Pyrénées-Orientales", "OCC", 42.699, 2.895],
  ["67", "Bas-Rhin", "GES", 48.573, 7.752],
  ["68", "Haut-Rhin", "GES", 48.079, 7.358],
  ["69", "Rhône", "ARA", 45.764, 4.836],
  ["70", "Haute-Saône", "BFC", 47.623, 6.155],
  ["71", "Saône-et-Loire", "BFC", 46.307, 4.828],
  ["72", "Sarthe", "PDL", 48.006, 0.199],
  ["73", "Savoie", "ARA", 45.564, 5.918],
  ["74", "Haute-Savoie", "ARA", 45.899, 6.129],
  ["75", "Paris", "IDF", 48.857, 2.352],
  ["76", "Seine-Maritime", "NOR", 49.443, 1.099],
  ["77", "Seine-et-Marne", "IDF", 48.54, 2.66],
  ["78", "Yvelines", "IDF", 48.801, 2.13],
  ["79", "Deux-Sèvres", "NAQ", 46.323, -0.464],
  ["80", "Somme", "HDF", 49.894, 2.296],
  ["81", "Tarn", "OCC", 43.929, 2.148],
  ["82", "Tarn-et-Garonne", "OCC", 44.018, 1.355],
  ["83", "Var", "PAC", 43.124, 5.928],
  ["84", "Vaucluse", "PAC", 43.949, 4.806],
  ["85", "Vendée", "PDL", 46.67, -1.426],
  ["86", "Vienne", "NAQ", 46.58, 0.34],
  ["87", "Haute-Vienne", "NAQ", 45.833, 1.262],
  ["88", "Vosges", "GES", 48.173, 6.45],
  ["89", "Yonne", "BFC", 47.798, 3.567],
  ["90", "Territoire de Belfort", "BFC", 47.64, 6.863],
  ["91", "Essonne", "IDF", 48.629, 2.441],
  ["92", "Hauts-de-Seine", "IDF", 48.892, 2.207],
  ["93", "Seine-Saint-Denis", "IDF", 48.909, 2.44],
  ["94", "Val-de-Marne", "IDF", 48.79, 2.455],
  ["95", "Val-d'Oise", "IDF", 49.036, 2.076],
  ["971", "Guadeloupe", "GUA", 15.998, -61.726],
  ["972", "Martinique", "MTQ", 14.604, -61.067],
  ["973", "Guyane", "GUY", 4.922, -52.313],
  ["974", "La Réunion", "REU", -20.882, 55.45],
  ["976", "Mayotte", "MAY", -12.78, 45.228],
];

export const DEPARTMENTS: Dept[] = RAW.map(([code, name, r, lat, lon]) => ({ code, name, region: R[r], lat, lon }));
const BY_CODE = new Map(DEPARTMENTS.map((d) => [d.code, d]));
export const REGIONS = [...new Set(DEPARTMENTS.map((d) => d.region))].sort((a, b) => a.localeCompare(b, "fr"));

/** Normalise un code département publié (« 1 », « 01 », « 2a », « 75 - Paris », « 97411 »…). */
export function normalizeDepartment(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = String(raw).trim().toUpperCase();
  const m = s.match(/^(2A|2B|97[1-6]|\d{1,2})\b/);
  if (!m) return null;
  let code = m[1];
  if (/^\d$/.test(code)) code = "0" + code;
  return BY_CODE.has(code) ? code : null;
}

export function departmentFromPostalCode(cp: string | null | undefined): string | null {
  if (!cp) return null;
  const s = cp.replace(/\s/g, "");
  if (!/^\d{5}$/.test(s)) return null;
  if (s.startsWith("97")) return normalizeDepartment(s.slice(0, 3));
  if (s.startsWith("20")) return Number(s) < 20200 ? "2A" : "2B";
  return normalizeDepartment(s.slice(0, 2));
}

export const getDepartment = (code: string | null | undefined) => (code ? BY_CODE.get(code) ?? null : null);
export const regionOf = (code: string | null | undefined) => getDepartment(code)?.region ?? null;

export function distanceKm(a: string, b: string): number | null {
  const A = BY_CODE.get(a);
  const B = BY_CODE.get(b);
  if (!A || !B) return null;
  const rad = Math.PI / 180;
  const dLat = (B.lat - A.lat) * rad;
  const dLon = (B.lon - A.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(A.lat * rad) * Math.cos(B.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

export function departmentsWithin(code: string, radiusKm: number): string[] {
  return DEPARTMENTS.filter((d) => {
    const dist = distanceKm(code, d.code);
    return dist !== null && dist <= radiusKm;
  }).map((d) => d.code);
}

/** Pays ISO-3 (TED) → ISO-2. Union européenne + pays voisins fréquents. */
export const ISO3_TO_ISO2: Record<string, string> = {
  FRA: "FR", BEL: "BE", LUX: "LU", DEU: "DE", NLD: "NL", ITA: "IT", ESP: "ES", PRT: "PT", AUT: "AT", IRL: "IE",
  DNK: "DK", SWE: "SE", FIN: "FI", POL: "PL", CZE: "CZ", SVK: "SK", SVN: "SI", HUN: "HU", ROU: "RO", BGR: "BG",
  HRV: "HR", GRC: "GR", CYP: "CY", MLT: "MT", EST: "EE", LVA: "LV", LTU: "LT", CHE: "CH", NOR: "NO", ISL: "IS",
  GBR: "GB", LIE: "LI", MCO: "MC",
};

export const COUNTRY_NAMES: Record<string, string> = {
  FR: "France", BE: "Belgique", LU: "Luxembourg", DE: "Allemagne", NL: "Pays-Bas", IT: "Italie", ES: "Espagne",
  PT: "Portugal", AT: "Autriche", IE: "Irlande", DK: "Danemark", SE: "Suède", FI: "Finlande", PL: "Pologne",
  CZ: "Tchéquie", SK: "Slovaquie", SI: "Slovénie", HU: "Hongrie", RO: "Roumanie", BG: "Bulgarie", HR: "Croatie",
  GR: "Grèce", CY: "Chypre", MT: "Malte", EE: "Estonie", LV: "Lettonie", LT: "Lituanie", CH: "Suisse", NO: "Norvège",
  IS: "Islande", GB: "Royaume-Uni", LI: "Liechtenstein", MC: "Monaco",
};
