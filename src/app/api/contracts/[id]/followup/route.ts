import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import {
  createRecord,
  getRecord,
  updateRecord,
  ZohoApiError,
} from "@/lib/zoho/client";
import { findZohoUserByName } from "@/lib/zoho/mappings";
import { subtractDays } from "@/lib/csv/normalize";

export const runtime = "nodejs";

interface ZohoLookup {
  id: string;
  name?: string;
}

interface ZohoContractRecord {
  id: string;
  Name?: string;
  Ende?: string;
  Kunde?: ZohoLookup | null;
  Follow_up_Erstellt?: boolean;
  Makler?: string;
}

interface ZohoContactRecord {
  id: string;
  First_Name?: string;
  Last_Name?: string;
}

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const contract = await getRecord<ZohoContractRecord>(
      env.contractModuleApiName,
      id
    );
    if (!contract) {
      return NextResponse.json(
        { ok: false, error: "Contract not found in Zoho." },
        { status: 404 }
      );
    }
    if (!contract.Ende) {
      return NextResponse.json(
        { ok: false, error: "Contract has no expiry date; cannot schedule a follow-up." },
        { status: 400 }
      );
    }
    if (!contract.Kunde?.id) {
      return NextResponse.json(
        { ok: false, error: "Contract is not linked to a customer; cannot schedule a follow-up." },
        { status: 400 }
      );
    }

    const contact = await getRecord<ZohoContactRecord>("Contacts", contract.Kunde.id);
    const customerLabel = contact
      ? `${contact.Last_Name ?? ""}, ${contact.First_Name ?? ""}`.replace(/^, |, $/g, "")
      : contract.Kunde.name || "Unknown customer";

    const maklerName = contract.Makler;

    const dueDate = subtractDays(contract.Ende, 30);
    const subject = `Renewal call — ${customerLabel} (${contract.Name ?? id})`;

    const owner = maklerName ? await findZohoUserByName(maklerName) : null;

    const taskPayload: Record<string, unknown> = {
      Subject: subject,
      Due_Date: dueDate,
      Status: "Not Started",
      Priority: "High",
      Who_Id: { id: contract.Kunde.id },
      What_Id: { id: contract.id },
      $se_module: env.contractModuleApiName,
    };
    if (owner) {
      taskPayload.Owner = { id: owner.id };
    }

    const taskResult = await createRecord("Tasks", taskPayload);
    if (taskResult.status !== "success" || !taskResult.details?.id) {
      return NextResponse.json(
        { ok: false, error: taskResult.message || "Zoho rejected the task." },
        { status: 502 }
      );
    }

    const updateResult = await updateRecord(env.contractModuleApiName, id, {
      Follow_up_Erstellt: true,
    });
    if (updateResult.status !== "success") {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Task was created in Zoho, but the contract could not be marked as followed up: " +
            (updateResult.message || "unknown error"),
          taskId: taskResult.details.id,
        },
        { status: 502 }
      );
    }

    return NextResponse.json({
      ok: true,
      task: {
        id: taskResult.details.id,
        subject,
        dueDate,
      },
      contract: { id, followUpErstellt: true },
      ownerAssigned: Boolean(owner),
      ownerNote: owner
        ? undefined
        : `No Zoho user matching Makler "${maklerName ?? "(none)"}" was found — the task was created unassigned. Add a matching user in Zoho to enable auto-assignment.`,
    });
  } catch (err) {
    if (err instanceof ZohoApiError) {
      return NextResponse.json(
        { ok: false, error: err.message, details: err.details },
        { status: 502 }
      );
    }
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Follow-up failed" },
      { status: 500 }
    );
  }
}
