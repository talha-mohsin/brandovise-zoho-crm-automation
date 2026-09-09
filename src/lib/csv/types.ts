export interface CustomerRecord {
  kundennummer: string;
  anrede: string;
  vorname: string;
  nachname: string;
  email: string | null;
  telefon: string;
  strasse: string;
  plz: string;
  ort: string;
  geburtsdatum: string | null; // ISO
  makler: string;
}

export interface ContractRecord {
  vertragsnummer: string;
  kundennummer: string;
  produkt: string;
  versicherer: string;
  beginn: string | null; // ISO
  ablaufdatum: string | null; // ISO
  jahresbeitrag: number | null;
  zahlweise: string;
  status: string;
  makler: string;
}

export type IssueSeverity = "error" | "warning";

export interface DataIssue {
  severity: IssueSeverity;
  source: "kontakte" | "vertraege";
  row: number; // 1-based line number in the source CSV (including header)
  identifier: string; // Kundennummer / Vertragsnummer for quick reference
  message: string; // plain-language, for a non-technical reader
}

export interface ParsedImportData {
  customers: CustomerRecord[];
  contracts: ContractRecord[];
  skippedCustomers: { row: number; kundennummer: string; reason: string }[];
  skippedContracts: { row: number; vertragsnummer: string; reason: string }[];
  issues: DataIssue[];
  counts: {
    customersRead: number;
    customersToImport: number;
    contractsRead: number;
    contractsToImport: number;
  };
}
