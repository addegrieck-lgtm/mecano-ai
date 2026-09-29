import { describeDtc } from "@/lib/diagnostics/engine";
import type { DiagnosticTroubleCode, VehicleLiveData } from "./obd-provider";

/**
 * Parser OBD-II indépendant du transport.
 * Transforme les réponses brutes ELM327 (mode 01, 03, 09, AT RV) en objets exploitables.
 * Formules SAE J1979 standard (mode 01).
 */

export const NO_DATA = /NO DATA|UNABLE TO CONNECT|CAN ERROR|BUS INIT|ERROR|STOPPED|\?/i;

/** Nettoie une réponse brute : prompt, écho, "SEARCHING...", préfixes de trames multi-lignes. */
export function cleanLines(raw: string): string[] {
  return raw
    .replace(/>/g, "")
    .replace(/SEARCHING\.\.\./gi, "")
    .split(/[\r\n]+/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => l.replace(/^[0-9A-F]:\s*/i, "")) // "0: 49 02 ..." (trames ISO-TP)
    .filter((l) => !/^[0-9A-F]{3}$/i.test(l)); // longueur de trame ISO-TP ("014")
}

export function toBytes(line: string): number[] {
  const compact = line.replace(/\s+/g, "");
  if (!/^[0-9A-F]*$/i.test(compact) || compact.length % 2 !== 0) return [];
  const bytes: number[] = [];
  for (let i = 0; i < compact.length; i += 2) bytes.push(parseInt(compact.slice(i, i + 2), 16));
  return bytes;
}

export const PIDS = {
  engineLoad: "04",
  coolantTemperature: "05",
  shortFuelTrimB1: "06",
  longFuelTrimB1: "07",
  rpm: "0C",
  speed: "0D",
  intakeAirTemperature: "0F",
  throttlePosition: "11",
  controlModuleVoltage: "42",
} as const;

type PidDecoder = (a: number, b: number) => number;

const DECODERS: Record<string, { key: keyof VehicleLiveData | "controlModuleVoltage"; decode: PidDecoder }> = {
  "04": { key: "engineLoad", decode: (a) => round((a * 100) / 255, 1) },
  "05": { key: "coolantTemperature", decode: (a) => a - 40 },
  "06": { key: "shortFuelTrimB1", decode: (a) => round(((a - 128) * 100) / 128, 1) },
  "07": { key: "longFuelTrimB1", decode: (a) => round(((a - 128) * 100) / 128, 1) },
  "0C": { key: "rpm", decode: (a, b) => Math.round((a * 256 + b) / 4) },
  "0D": { key: "speed", decode: (a) => a },
  "0F": { key: "intakeAirTemperature", decode: (a) => a - 40 },
  "11": { key: "throttlePosition", decode: (a) => round((a * 100) / 255, 1) },
  "42": { key: "controlModuleVoltage", decode: (a, b) => round((a * 256 + b) / 1000, 2) },
};

function round(v: number, digits: number): number {
  const f = 10 ** digits;
  return Math.round(v * f) / f;
}

/** Décode une réponse mode 01 ("41 0C 1A F8") → { pid, key, value } ou null. */
export function parseMode01(raw: string): { pid: string; key: string; value: number } | null {
  if (NO_DATA.test(raw)) return null;
  for (const line of cleanLines(raw)) {
    const bytes = toBytes(line);
    if (bytes.length >= 3 && bytes[0] === 0x41) {
      const pid = bytes[1].toString(16).toUpperCase().padStart(2, "0");
      const dec = DECODERS[pid];
      if (!dec) return null;
      return { pid, key: dec.key, value: dec.decode(bytes[2], bytes[3] ?? 0) };
    }
  }
  return null;
}

/** Réponse "AT RV" → tension batterie (ex. "14.2V"). */
export function parseVoltage(raw: string): number | undefined {
  const m = raw.match(/(\d{1,2}(?:\.\d{1,2})?)\s*V/i);
  return m ? parseFloat(m[1]) : undefined;
}

/** Deux octets → code DTC (SAE J2012). */
export function bytesToDtc(a: number, b: number): string | null {
  if (a === 0 && b === 0) return null;
  const letter = ["P", "C", "B", "U"][(a & 0xc0) >> 6];
  const d1 = (a & 0x30) >> 4;
  const d2 = (a & 0x0f).toString(16);
  const rest = b.toString(16).padStart(2, "0");
  return `${letter}${d1}${d2}${rest}`.toUpperCase();
}

/** Réponse mode 03 (ou 07) → liste de codes. Gère les formats CAN (octet de comptage) et non-CAN. */
export function parseDTCs(raw: string, mode: "43" | "47" = "43"): string[] {
  if (NO_DATA.test(raw)) return [];
  const header = parseInt(mode, 16);
  const codes = new Set<string>();
  for (const line of cleanLines(raw)) {
    let bytes = toBytes(line);
    if (bytes[0] !== header) continue;
    bytes = bytes.slice(1);
    if (bytes.length % 2 === 1) bytes = bytes.slice(1); // octet de comptage (CAN)
    for (let i = 0; i + 1 < bytes.length; i += 2) {
      const dtc = bytesToDtc(bytes[i], bytes[i + 1]);
      if (dtc) codes.add(dtc);
    }
  }
  return [...codes];
}

const VIN_CHARS = /[A-HJ-NPR-Z0-9]/;

/** Réponse mode 09 PID 02 → VIN (17 caractères) ou undefined. */
export function parseVIN(raw: string): string | undefined {
  if (NO_DATA.test(raw)) return undefined;
  let chars = "";
  for (const line of cleanLines(raw)) {
    let bytes = toBytes(line);
    // retire l'en-tête "49 02 xx" lorsqu'il est présent
    if (bytes[0] === 0x49 && bytes[1] === 0x02) bytes = bytes.slice(3);
    for (const b of bytes) {
      const c = String.fromCharCode(b);
      if (VIN_CHARS.test(c)) chars += c;
    }
  }
  return chars.length >= 17 ? chars.slice(-17) : undefined;
}

export function toTroubleCodes(codes: string[]): DiagnosticTroubleCode[] {
  return codes.map((code) => ({ code, description: describeDtc(code) }));
}

export const LIVE_DATA_LABELS: Record<keyof VehicleLiveData, { label: string; unit: string }> = {
  rpm: { label: "Régime moteur", unit: "tr/min" },
  speed: { label: "Vitesse", unit: "km/h" },
  coolantTemperature: { label: "Température moteur", unit: "°C" },
  batteryVoltage: { label: "Tension batterie", unit: "V" },
  engineLoad: { label: "Charge moteur", unit: "%" },
  throttlePosition: { label: "Position papillon", unit: "%" },
  intakeAirTemperature: { label: "Température air admission", unit: "°C" },
  shortFuelTrimB1: { label: "Correction richesse court terme B1", unit: "%" },
  longFuelTrimB1: { label: "Correction richesse long terme B1", unit: "%" },
};
