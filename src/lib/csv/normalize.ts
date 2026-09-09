// Small, dependency-free normalizers for the quirks found in the source
// exports: two different date formats, German decimal commas, and
// inconsistent whitespace.

/**
 * Parses either ISO (YYYY-MM-DD) or German (DD.MM.YYYY) dates, which both
 * appear in the source files. Returns an ISO date string (YYYY-MM-DD) or
 * null if the value can't be confidently parsed.
 */
export function parseFlexibleDate(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const value = raw.trim();
  if (!value) return null;

  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) {
    const [, y, m, d] = iso;
    return isValidYmd(+y, +m, +d) ? `${y}-${m}-${d}` : null;
  }

  const de = value.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (de) {
    const [, d, m, y] = de;
    return isValidYmd(+y, +m, +d) ? `${y}-${m}-${d}` : null;
  }

  return null;
}

function isValidYmd(y: number, m: number, d: number): boolean {
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return (
    dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
  );
}

/** Parses "1.284,00" / "1284,00" style German decimals into a number. */
export function parseGermanDecimal(raw: string | undefined | null): number | null {
  if (raw === undefined || raw === null) return null;
  const value = raw.trim();
  if (!value) return null;
  const normalized = value.replace(/\./g, "").replace(",", ".");
  const num = Number(normalized);
  return Number.isFinite(num) ? num : null;
}

export function normalizeWhitespace(raw: string | undefined | null): string {
  return (raw ?? "").replace(/\s+/g, " ").trim();
}

export function daysUntil(isoDate: string, from: Date = new Date()): number {
  const target = new Date(isoDate + "T00:00:00Z");
  const today = new Date(
    Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate())
  );
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

export function subtractDays(isoDate: string, days: number): string {
  const dt = new Date(isoDate + "T00:00:00Z");
  dt.setUTCDate(dt.getUTCDate() - days);
  return dt.toISOString().slice(0, 10);
}
