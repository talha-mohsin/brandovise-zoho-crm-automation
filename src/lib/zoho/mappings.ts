import type { ContractRecord, CustomerRecord } from "@/lib/csv/types";
import { listUsers, type ZohoUser } from "@/lib/zoho/client";

// Field-name mapping between our normalized CSV rows and the Zoho CRM
// fields they land in. Standard Contacts fields use Zoho's built-in API
// names; Kundennummer and Makler are custom fields created on the Contacts
// module during setup (see README "Zoho setup").

export function customerToZohoContact(c: CustomerRecord) {
  return {
    Kundennummer: c.kundennummer,
    Salutation: c.anrede,
    First_Name: c.vorname,
    Last_Name: c.nachname || "(unbekannt)",
    Email: c.email ?? undefined,
    Phone: c.telefon || undefined,
    Mailing_Street: c.strasse || undefined,
    Mailing_Zip: c.plz || undefined,
    Mailing_City: c.ort || undefined,
    Date_of_Birth: c.geburtsdatum ?? undefined,
    Makler: c.makler || undefined,
  };
}

/**
 * Contract fields for insert/update.
 *
 * `Vertraege` has no separate "Vertragsnummer" custom field — the contract
 * number *is* the module's primary `Name` field (just labelled
 * "Vertragsnummer" in the Zoho UI), so that's what upserts are keyed on.
 * Similarly the expiry date field in this org is `Ende`, not `Ablaufdatum`.
 *
 * `Follow_up_Erstellt` is deliberately NOT included here: including it in
 * every upsert would reset the flag to its default on every re-import,
 * silently wiping out follow-ups that were already created from the
 * console. It is only ever written by the follow-up endpoint.
 */
export function contractToZohoRecord(
  ct: ContractRecord,
  contactZohoId: string
) {
  return {
    Name: ct.vertragsnummer,
    Kunde: { id: contactZohoId },
    Produkt: ct.produkt || undefined,
    Versicherer: ct.versicherer || undefined,
    Beginn: ct.beginn ?? undefined,
    Ende: ct.ablaufdatum ?? undefined,
    Jahresbeitrag: ct.jahresbeitrag ?? undefined,
    Zahlweise: ct.zahlweise || undefined,
    Status: ct.status || undefined,
    Makler: ct.makler || undefined,
  };
}

let cachedUsers: ZohoUser[] | null = null;

/**
 * Best-effort match of a "Makler" name from the CSV to a real Zoho user, so
 * follow-up tasks can be assigned to them. Trial/demo orgs typically only
 * have the signed-up account as a user, so this commonly falls back to
 * `null` (task is created unassigned / owned by the API user) — surfaced to
 * the caller so the UI can say so rather than pretending it worked.
 */
export async function findZohoUserByName(name: string): Promise<ZohoUser | null> {
  if (!name) return null;
  if (!cachedUsers) cachedUsers = await listUsers();
  const target = name.trim().toLowerCase();
  return (
    cachedUsers.find((u) => u.full_name?.trim().toLowerCase() === target) ??
    null
  );
}
