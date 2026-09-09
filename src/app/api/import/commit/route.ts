import { NextResponse } from "next/server";
import { parseImportData } from "@/lib/csv/parse";
import { readSampleCsvs } from "@/lib/csv/sample";
import { env } from "@/lib/env";
import { upsertRecords, ZohoApiError } from "@/lib/zoho/client";
import { contractToZohoRecord, customerToZohoContact } from "@/lib/zoho/mappings";

export const runtime = "nodejs";

interface CommitRequestBody {
  kontakteCsv?: string;
  vertraegeCsv?: string;
  useSample?: boolean;
}

interface CommitItemResult {
  identifier: string;
  action: "created" | "updated" | "skipped" | "failed";
  reason?: string;
}

export async function POST(req: Request) {
  const body = (await req.json()) as CommitRequestBody;
  let kontakteCsv = body.kontakteCsv;
  let vertraegeCsv = body.vertraegeCsv;
  if (body.useSample || !kontakteCsv || !vertraegeCsv) {
    const sample = readSampleCsvs();
    kontakteCsv ??= sample.kontakteCsv;
    vertraegeCsv ??= sample.vertraegeCsv;
  }

  const parsed = parseImportData(kontakteCsv, vertraegeCsv);

  try {
    // --- Customers first, so we have Zoho IDs to link contracts to. ------
    const customerResults: CommitItemResult[] = [];
    const kundennummerToContactId = new Map<string, string>();

    const contactPayloads = parsed.customers.map(customerToZohoContact);
    const zohoContactResults = await upsertRecords(
      "Contacts",
      contactPayloads,
      ["Kundennummer"]
    );

    zohoContactResults.forEach((result, i) => {
      const customer = parsed.customers[i];
      if (result.status === "success" && result.details?.id) {
        kundennummerToContactId.set(customer.kundennummer, String(result.details.id));
        customerResults.push({
          identifier: customer.kundennummer,
          action: result.action === "update" ? "updated" : "created",
        });
      } else {
        customerResults.push({
          identifier: customer.kundennummer,
          action: "failed",
          reason: result.message || "Zoho rejected this record.",
        });
      }
    });

    // --- Contracts, linked via the Kunde lookup. --------------------------
    const contractResults: CommitItemResult[] = [];
    const contractPayloads: ReturnType<typeof contractToZohoRecord>[] = [];
    const contractsBeingSent: typeof parsed.contracts = [];

    for (const contract of parsed.contracts) {
      const contactId = kundennummerToContactId.get(contract.kundennummer);
      if (!contactId) {
        contractResults.push({
          identifier: contract.vertragsnummer,
          action: "skipped",
          reason: `Linked customer ${contract.kundennummer} was not imported successfully, so this contract cannot be linked yet.`,
        });
        continue;
      }
      contractPayloads.push(contractToZohoRecord(contract, contactId));
      contractsBeingSent.push(contract);
    }

    const zohoContractResults = await upsertRecords(
      env.contractModuleApiName,
      contractPayloads,
      ["Vertragsnummer"]
    );

    zohoContractResults.forEach((result, i) => {
      const contract = contractsBeingSent[i];
      if (result.status === "success") {
        contractResults.push({
          identifier: contract.vertragsnummer,
          action: result.action === "update" ? "updated" : "created",
        });
      } else {
        contractResults.push({
          identifier: contract.vertragsnummer,
          action: "failed",
          reason: result.message || "Zoho rejected this record.",
        });
      }
    });

    const skippedFromValidation = [
      ...parsed.skippedCustomers.map((s) => ({
        identifier: s.kundennummer,
        action: "skipped" as const,
        reason: s.reason,
      })),
      ...parsed.skippedContracts.map((s) => ({
        identifier: s.vertragsnummer,
        action: "skipped" as const,
        reason: s.reason,
      })),
    ];

    return NextResponse.json({
      ok: true,
      counts: parsed.counts,
      customers: customerResults,
      contracts: contractResults,
      skippedDuringValidation: skippedFromValidation,
      issues: parsed.issues,
    });
  } catch (err) {
    if (err instanceof ZohoApiError) {
      return NextResponse.json(
        { ok: false, error: err.message, details: err.details },
        { status: 502 }
      );
    }
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Import failed" },
      { status: 500 }
    );
  }
}
