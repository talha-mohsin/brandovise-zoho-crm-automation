import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { getRecordsByIds, listRecords, ZohoApiError } from "@/lib/zoho/client";

export const runtime = "nodejs";

interface ZohoLookup {
  id: string;
  name?: string;
}

interface ZohoContractRecord {
  id: string;
  Name?: string;
  Kunde?: ZohoLookup | null;
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
          "Kunde",
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
    const contactIds = Array.from(
      new Set(
        contractRecords
          .map((c) => c.Kunde?.id)
          .filter((id): id is string => Boolean(id))
      )
    );

    const contacts = await getRecordsByIds<ZohoContactRecord>(
      "Contacts",
      contactIds,
      ["First_Name", "Last_Name", "Email", "Phone"]
    );
    const contactsById = new Map(contacts.map((c) => [c.id, c]));

    const contracts: ConsoleContract[] = contractRecords.map((c) => {
      const contact = c.Kunde?.id ? contactsById.get(c.Kunde.id) : undefined;
      const name = contact
        ? [contact.First_Name, contact.Last_Name].filter(Boolean).join(" ")
        : c.Kunde?.name || "(unknown customer)";
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
          id: c.Kunde?.id ?? null,
          name,
          email: contact?.Email ?? null,
          phone: contact?.Phone ?? null,
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
