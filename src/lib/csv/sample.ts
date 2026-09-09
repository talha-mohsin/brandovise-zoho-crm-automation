import { readFileSync } from "fs";
import path from "path";

// Server-only. Lets the app read the two sample CSVs straight from the repo
// (docs/) so a reviewer can trigger an import without having the original
// files on hand, per the brief's "read them from the repo" option.

export function readSampleCsvs() {
  const dir = path.join(process.cwd(), "data");
  const kontakteCsv = readFileSync(path.join(dir, "kontakte_export.csv"), "utf-8");
  const vertraegeCsv = readFileSync(path.join(dir, "vertraege_export.csv"), "utf-8");
  return { kontakteCsv, vertraegeCsv };
}
