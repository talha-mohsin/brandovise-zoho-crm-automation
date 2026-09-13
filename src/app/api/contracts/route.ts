import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { getRecordsByIds, listRecords, ZohoApiError } from "@/lib/zoho/client";

export const runtime = "nodejs";

interface ZohoLookup {
  id: string;
  name?: string;
  // Populated when the record was fetched with dot-notation sub-fields
  // (e.g. `Kontakt.Email`) — not guaranteed on every Zoho plan/API version,
  // so callers still fall back to a batch fetch by id when these are absent.
  First_Name?: string;
  Last_Name?: string;
  Email?: string;
  Phone?: string;
  Kundennummer?: string;
}

interface ZohoContractRecord {
  id: string;
  Name?: string;
  Kontakt?: ZohoLookup | null;
  Produkt?: string;
  Versicherer?: string;
  Beginn?: string;
  Ende?: string;
  Jahresbeitrag?: number;
  Zahlweise?: string;
  Status?: string;
  Makler?: string;
  Follow_up_Erstellt?: boolean;
}

interface ZohoContactRecord {
  id: string;
  First_Name?: string;
  Last_Name?: string;
  Email?: string;
  Phone?: string;
}

export interface ConsoleContract {
  id: string;
  vertragsnummer: string;
  produkt: string;
  versicherer: string;
  beginn: string | null;
  ablaufdatum: string | null;
  jahresbeitrag: number | null;
  zahlweise: string;
  status: string;
  makler: string;
  followUpErstellt: boolean;
  customer: {
    id: string | null;
    name: string;
    email: string | null;
    phone: string | null;
  };
}

export async function GET() {
  try {
    const contractRes = await listRecords<ZohoContractRecord>(
      env.contractModuleApiName,
      {
        fields: [
          "Name",
          "Kontakt",
          "Kontakt.First_Name",
          "Kontakt.Last_Name",
          "Kontakt.Email",
          "Kontakt.Phone",
          "Kontakt.Kundennummer",
          "Produkt",
          "Versicherer",
          "Beginn",
          "Ende",
          "Jahresbeitrag",
          "Zahlweise",
          "Status",
          "Makler",
          "Follow_up_Erstellt",
        ],
        perPage: 200,
      }
    );

    const contractRecords = contractRes.data ?? [];

    // The dot-notation fields above populate Kontakt.First_Name etc. inline
    // when Zoho supports it; for any contract where they didn't come back,
    // batch-fetch the linked Contacts so the console never shows a blank
    // customer for a contract that genuinely has a linked Kontakt.
    const idsNeedingLookup = Array.from(
      new Set(
        contractRecords
          .filter((c) => c.Kontakt?.id && !c.Kontakt.First_Name && !c.Kontakt.Last_Name)
          .map((c) => c.Kontakt!.id)
      )
    );

    const fetchedContacts = await getRecordsByIds<ZohoContactRecord>(
      "Contacts",
      idsNeedingLookup,
      ["First_Name", "Last_Name", "Email", "Phone"]
    );
    const fetchedContactsById = new Map(fetchedContacts.map((c) => [c.id, c]));

    const contracts: ConsoleContract[] = contractRecords.map((c) => {
      const kontakt = c.Kontakt;
      const fallback = kontakt?.id ? fetchedContactsById.get(kontakt.id) : undefined;
      const firstName = kontakt?.First_Name ?? fallback?.First_Name;
      const lastName = kontakt?.Last_Name ?? fallback?.Last_Name;
      const email = kontakt?.Email ?? fallback?.Email ?? null;
      const phone = kontakt?.Phone ?? fallback?.Phone ?? null;
      const name =
        [firstName, lastName].filter(Boolean).join(" ") ||
        kontakt?.name ||
        "(unknown customer)";
      return {
        id: c.id,
        vertragsnummer: c.Name || "",
        produkt: c.Produkt || "",
        versicherer: c.Versicherer || "",
        beginn: c.Beginn ?? null,
        ablaufdatum: c.Ende ?? null,
        jahresbeitrag: c.Jahresbeitrag ?? null,
        zahlweise: c.Zahlweise || "",
        status: c.Status || "",
        makler: c.Makler || "",
        followUpErstellt: Boolean(c.Follow_up_Erstellt),
        customer: {
          id: kontakt?.id ?? null,
          name,
          email,
          phone,
        },
      };
    });

    contracts.sort((a, b) => (a.ablaufdatum ?? "9999").localeCompare(b.ablaufdatum ?? "9999"));

    return NextResponse.json({ ok: true, contracts });
  } catch (err) {
    if (err instanceof ZohoApiError) {
      return NextResponse.json(
        { ok: false, error: err.message, details: err.details },
        { status: 502 }
      );
    }
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Failed to load contracts" },
      { status: 500 }
    );
  }
}
