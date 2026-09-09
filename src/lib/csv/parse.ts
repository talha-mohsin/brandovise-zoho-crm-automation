import Papa from "papaparse";
import {
  normalizeWhitespace,
  parseFlexibleDate,
  parseGermanDecimal,
} from "@/lib/csv/normalize";
import type {
  ContractRecord,
  CustomerRecord,
  DataIssue,
  ParsedImportData,
} from "@/lib/csv/types";

interface RawRow {
  [key: string]: string;
}

function parseCsv(text: string): RawRow[] {
  const result = Papa.parse<RawRow>(text.trim(), {
    header: true,
    delimiter: ";",
    skipEmptyLines: true,
    transform: (v) => v.trim(),
  });
  return result.data;
}

const KUNDENNUMMER_RE = /^K-\d{4}$/;
const VERTRAGSNUMMER_RE = /^VN-\d{4}-\d{4}$/;

export function parseImportData(
  kontakteCsv: string,
  vertraegeCsv: string
): ParsedImportData {
  const issues: DataIssue[] = [];
  const kontakteRows = parseCsv(kontakteCsv);
  const vertraegeRows = parseCsv(vertraegeCsv);

  // ---- Customers -----------------------------------------------------
  const customers: CustomerRecord[] = [];
  const skippedCustomers: ParsedImportData["skippedCustomers"] = [];
  const seenKundennummer = new Map<string, number>(); // kundennummer -> row
  const emailToRows = new Map<string, number[]>();

  kontakteRows.forEach((row, idx) => {
    const lineNo = idx + 2; // +1 header, +1 for 1-based
    const kundennummer = normalizeWhitespace(row["Kundennummer"]);

    if (!KUNDENNUMMER_RE.test(kundennummer)) {
      skippedCustomers.push({
        row: lineNo,
        kundennummer: kundennummer || "(leer)",
        reason: "Kundennummer fehlt oder hat ein unerwartetes Format.",
      });
      issues.push({
        severity: "error",
        source: "kontakte",
        row: lineNo,
        identifier: kundennummer || "(unbekannt)",
        message: `Row ${lineNo}: customer number "${kundennummer || "(empty)"}" is missing or not in the expected K-NNNN format. Row skipped.`,
      });
      return;
    }

    if (seenKundennummer.has(kundennummer)) {
      skippedCustomers.push({
        row: lineNo,
        kundennummer,
        reason: `Duplicate Kundennummer, first seen on row ${seenKundennummer.get(kundennummer)}.`,
      });
      issues.push({
        severity: "error",
        source: "kontakte",
        row: lineNo,
        identifier: kundennummer,
        message: `Row ${lineNo}: customer number ${kundennummer} was already used on row ${seenKundennummer.get(kundennummer)}. This row was skipped — please confirm which record is correct.`,
      });
      return;
    }
    seenKundennummer.set(kundennummer, lineNo);

    const email = normalizeWhitespace(row["Email"]) || null;
    const geburtsdatumRaw = normalizeWhitespace(row["Geburtsdatum"]);
    const geburtsdatum = parseFlexibleDate(geburtsdatumRaw);

    if (!email) {
      issues.push({
        severity: "warning",
        source: "kontakte",
        row: lineNo,
        identifier: kundennummer,
        message: `Row ${lineNo} (${kundennummer}): no email address on file. Imported without one — add it manually once you have it.`,
      });
    }

    if (geburtsdatumRaw && !geburtsdatum) {
      issues.push({
        severity: "warning",
        source: "kontakte",
        row: lineNo,
        identifier: kundennummer,
        message: `Row ${lineNo} (${kundennummer}): date of birth "${geburtsdatumRaw}" could not be read and was left empty.`,
      });
    }

    const customer: CustomerRecord = {
      kundennummer,
      anrede: normalizeWhitespace(row["Anrede"]),
      vorname: normalizeWhitespace(row["Vorname"]),
      nachname: normalizeWhitespace(row["Nachname"]),
      email,
      telefon: normalizeWhitespace(row["Telefon"]),
      strasse: normalizeWhitespace(row["Strasse"]),
      plz: normalizeWhitespace(row["PLZ"]),
      ort: normalizeWhitespace(row["Ort"]),
      geburtsdatum,
      makler: normalizeWhitespace(row["Makler"]),
    };
    customers.push(customer);

    if (email) {
      const list = emailToRows.get(email) ?? [];
      list.push(lineNo);
      emailToRows.set(email, list);
    }
  });

  // Possible duplicate people: same email shared by two different customer numbers.
  for (const [email, rows] of emailToRows) {
    if (rows.length > 1) {
      issues.push({
        severity: "warning",
        source: "kontakte",
        row: rows[rows.length - 1],
        identifier: email,
        message: `Rows ${rows.join(", ")} share the email address ${email} under different customer numbers. These may be the same person (e.g. a name change) recorded twice. Both were imported as separate contacts — please review and merge manually if they are the same person.`,
      });
    }
  }

  // ---- Contracts --------------------------------------------------------
  const contracts: ContractRecord[] = [];
  const skippedContracts: ParsedImportData["skippedContracts"] = [];
  const seenVertragsnummer = new Map<string, number>();
  const validKundennummern = new Set(customers.map((c) => c.kundennummer));

  vertraegeRows.forEach((row, idx) => {
    const lineNo = idx + 2;
    const vertragsnummer = normalizeWhitespace(row["Vertragsnummer"]);
    const kundennummer = normalizeWhitespace(row["Kundennummer"]);

    if (!VERTRAGSNUMMER_RE.test(vertragsnummer)) {
      skippedContracts.push({
        row: lineNo,
        vertragsnummer: vertragsnummer || "(leer)",
        reason: "Vertragsnummer fehlt oder hat ein unerwartetes Format.",
      });
      issues.push({
        severity: "error",
        source: "vertraege",
        row: lineNo,
        identifier: vertragsnummer || "(unknown)",
        message: `Row ${lineNo}: contract number "${vertragsnummer || "(empty)"}" is missing or not in the expected VN-YYYY-NNNN format. Row skipped.`,
      });
      return;
    }

    if (seenVertragsnummer.has(vertragsnummer)) {
      skippedContracts.push({
        row: lineNo,
        vertragsnummer,
        reason: `Duplicate row for contract ${vertragsnummer}, first seen on row ${seenVertragsnummer.get(vertragsnummer)}.`,
      });
      issues.push({
        severity: "warning",
        source: "vertraege",
        row: lineNo,
        identifier: vertragsnummer,
        message: `Row ${lineNo}: contract ${vertragsnummer} appears more than once in the file (first seen on row ${seenVertragsnummer.get(vertragsnummer)}). The duplicate row was skipped; only one copy will be imported.`,
      });
      return;
    }

    if (!validKundennummern.has(kundennummer)) {
      skippedContracts.push({
        row: lineNo,
        vertragsnummer,
        reason: `References customer ${kundennummer}, which does not exist in the customer file.`,
      });
      issues.push({
        severity: "error",
        source: "vertraege",
        row: lineNo,
        identifier: vertragsnummer,
        message: `Row ${lineNo}: contract ${vertragsnummer} references customer ${kundennummer}, who is not in the customer file. Row skipped — likely a typo in the customer number or a missing customer record. Needs a human decision.`,
      });
      return;
    }
    seenVertragsnummer.set(vertragsnummer, lineNo);

    const beginnRaw = normalizeWhitespace(row["Beginn"]);
    const ablaufRaw = normalizeWhitespace(row["Ablaufdatum"]);
    const beginn = parseFlexibleDate(beginnRaw);
    const ablaufdatum = parseFlexibleDate(ablaufRaw);
    const jahresbeitragRaw = normalizeWhitespace(row["Jahresbeitrag"]);
    const jahresbeitrag = parseGermanDecimal(jahresbeitragRaw);

    if (ablaufRaw && !ablaufdatum) {
      issues.push({
        severity: "warning",
        source: "vertraege",
        row: lineNo,
        identifier: vertragsnummer,
        message: `Row ${lineNo} (${vertragsnummer}): expiry date "${ablaufRaw}" was in an unexpected format and could not be read reliably.`,
      });
    }
    if (ablaufRaw.includes(".") && ablaufdatum) {
      issues.push({
        severity: "warning",
        source: "vertraege",
        row: lineNo,
        identifier: vertragsnummer,
        message: `Row ${lineNo} (${vertragsnummer}): expiry date was written as "${ablaufRaw}" (DD.MM.YYYY) instead of the usual YYYY-MM-DD used elsewhere in the file. Read correctly and normalized to ${ablaufdatum}.`,
      });
    }

    if (jahresbeitragRaw && jahresbeitrag === null) {
      issues.push({
        severity: "warning",
        source: "vertraege",
        row: lineNo,
        identifier: vertragsnummer,
        message: `Row ${lineNo} (${vertragsnummer}): annual premium "${jahresbeitragRaw}" could not be read as a number and was left empty.`,
      });
    }

    contracts.push({
      vertragsnummer,
      kundennummer,
      produkt: normalizeWhitespace(row["Produkt"]),
      versicherer: normalizeWhitespace(row["Versicherer"]),
      beginn,
      ablaufdatum,
      jahresbeitrag,
      zahlweise: normalizeWhitespace(row["Zahlweise"]),
      status: normalizeWhitespace(row["Status"]),
      makler: normalizeWhitespace(row["Makler"]),
    });
  });

  return {
    customers,
    contracts,
    skippedCustomers,
    skippedContracts,
    issues,
    counts: {
      customersRead: kontakteRows.length,
      customersToImport: customers.length,
      contractsRead: vertraegeRows.length,
      contractsToImport: contracts.length,
    },
  };
}
