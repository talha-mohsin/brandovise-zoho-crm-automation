import { env } from "@/lib/env";
import { getAccessToken, invalidateAccessToken } from "@/lib/zoho/token";

// Thin server-only wrapper around the Zoho CRM REST API.
// All calls go through here so token attachment / 401-retry / error
// shaping happens in one place.

export class ZohoApiError extends Error {
  status: number;
  details: unknown;
  constructor(message: string, status: number, details: unknown) {
    super(message);
    this.name = "ZohoApiError";
    this.status = status;
    this.details = details;
  }
}

function apiUrl(path: string) {
  return `${env.zohoApiDomain}/crm/${env.zohoApiVersion}/${path.replace(/^\//, "")}`;
}

async function request<T>(
  path: string,
  init: RequestInit,
  retry = true
): Promise<T> {
  const token = await getAccessToken();
  const res = await fetch(apiUrl(path), {
    ...init,
    headers: {
      Authorization: `Zoho-oauthtoken ${token}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
    cache: "no-store",
  });

  if (res.status === 401 && retry) {
    invalidateAccessToken();
    return request<T>(path, init, false);
  }

  const text = await res.text();
  const body = text ? JSON.parse(text) : null;

  if (!res.ok) {
    throw new ZohoApiError(
      `Zoho API ${init.method || "GET"} ${path} failed with ${res.status}`,
      res.status,
      body
    );
  }

  return body as T;
}

export interface ZohoUpsertResultItem {
  code: string; // "SUCCESS" | "DUPLICATE_DATA" | ...
  status: "success" | "error";
  action?: "insert" | "update";
  details?: { id?: string; [key: string]: unknown };
  message?: string;
}

export interface ZohoBatchResponse {
  data: ZohoUpsertResultItem[];
}

/**
 * Insert-or-update up to 100 records at a time, keyed by `duplicateCheckFields`.
 * This is what makes the import safe to run twice: Zoho matches existing
 * records on the given unique field(s) and updates them instead of creating
 * a second copy.
 */
export async function upsertRecords(
  moduleApiName: string,
  records: Record<string, unknown>[],
  duplicateCheckFields: string[]
): Promise<ZohoUpsertResultItem[]> {
  if (records.length === 0) return [];
  const chunks: Record<string, unknown>[][] = [];
  for (let i = 0; i < records.length; i += 100) {
    chunks.push(records.slice(i, i + 100));
  }

  const results: ZohoUpsertResultItem[] = [];
  for (const chunk of chunks) {
    const res = await request<ZohoBatchResponse>(`${moduleApiName}/upsert`, {
      method: "POST",
      body: JSON.stringify({
        data: chunk,
        duplicate_check_fields: duplicateCheckFields,
        trigger: [],
      }),
    });
    results.push(...res.data);
  }
  return results;
}

export async function updateRecord(
  moduleApiName: string,
  id: string,
  fields: Record<string, unknown>
): Promise<ZohoUpsertResultItem> {
  const res = await request<ZohoBatchResponse>(`${moduleApiName}/${id}`, {
    method: "PUT",
    body: JSON.stringify({ data: [fields], trigger: [] }),
  });
  return res.data[0];
}

export async function createRecord(
  moduleApiName: string,
  fields: Record<string, unknown>
): Promise<ZohoUpsertResultItem> {
  const res = await request<ZohoBatchResponse>(`${moduleApiName}`, {
    method: "POST",
    body: JSON.stringify({ data: [fields], trigger: [] }),
  });
  return res.data[0];
}

export interface ZohoListResponse<T> {
  data: T[];
  info?: { more_records?: boolean; page?: number; count?: number };
}

export async function listRecords<T = Record<string, unknown>>(
  moduleApiName: string,
  params: {
    fields?: string[];
    page?: number;
    perPage?: number;
    sortBy?: string;
    sortOrder?: "asc" | "desc";
  } = {}
): Promise<ZohoListResponse<T>> {
  const search = new URLSearchParams();
  if (params.fields) search.set("fields", params.fields.join(","));
  search.set("page", String(params.page ?? 1));
  search.set("per_page", String(params.perPage ?? 200));
  if (params.sortBy) search.set("sort_by", params.sortBy);
  if (params.sortOrder) search.set("sort_order", params.sortOrder);

  try {
    return await request<ZohoListResponse<T>>(
      `${moduleApiName}?${search.toString()}`,
      { method: "GET" }
    );
  } catch (err) {
    if (err instanceof ZohoApiError && err.status === 204) {
      return { data: [] };
    }
    // Zoho returns 204 No Content with an empty body when a module has no
    // records yet; some environments surface that as a parse-safe empty body.
    if (err instanceof ZohoApiError && (err.details === null || err.details === undefined)) {
      return { data: [] };
    }
    throw err;
  }
}

export async function searchRecords<T = Record<string, unknown>>(
  moduleApiName: string,
  criteria: string
): Promise<T[]> {
  try {
    const res = await request<ZohoListResponse<T>>(
      `${moduleApiName}/search?criteria=${encodeURIComponent(criteria)}`,
      { method: "GET" }
    );
    return res.data ?? [];
  } catch (err) {
    if (err instanceof ZohoApiError && err.status === 204) return [];
    throw err;
  }
}

export async function getRecordsByIds<T = Record<string, unknown>>(
  moduleApiName: string,
  ids: string[],
  fields?: string[]
): Promise<T[]> {
  if (ids.length === 0) return [];
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    const search = new URLSearchParams();
    search.set("ids", chunk.join(","));
    if (fields) search.set("fields", fields.join(","));
    try {
      const res = await request<ZohoListResponse<T>>(
        `${moduleApiName}?${search.toString()}`,
        { method: "GET" }
      );
      out.push(...(res.data ?? []));
    } catch (err) {
      if (err instanceof ZohoApiError && err.status === 204) continue;
      throw err;
    }
  }
  return out;
}

export async function getRecord<T = Record<string, unknown>>(
  moduleApiName: string,
  id: string
): Promise<T | null> {
  try {
    const res = await request<ZohoListResponse<T>>(`${moduleApiName}/${id}`, {
      method: "GET",
    });
    return res.data?.[0] ?? null;
  } catch (err) {
    if (err instanceof ZohoApiError && err.status === 204) return null;
    throw err;
  }
}

export interface ZohoUser {
  id: string;
  full_name: string;
  email: string;
}

let usersCache: ZohoUser[] | null = null;

export async function listUsers(): Promise<ZohoUser[]> {
  if (usersCache) return usersCache;
  const res = await request<{ users: ZohoUser[] }>(`users?type=AllUsers`, {
    method: "GET",
  });
  usersCache = res.users ?? [];
  return usersCache;
}
