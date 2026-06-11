import { type NextRequest, NextResponse } from "next/server";

import { getAuthUser } from "@/lib/admin-security";
import { getRequestId, logServerError } from "@/lib/api-error";
import {
  ensureBusinessHoursSchema,
  isBusinessOpenByHours,
} from "@/lib/business-hours";
import {
  ensureBusinessLogoColumn,
  getBusinessLogoSelect,
} from "@/lib/business-logo";
import { resolveBusinessAccess } from "@/lib/business-panel";
import pool, { logDbUsage } from "@/lib/db";

import { createBusinessMeHandler } from "./handler";

const handler = createBusinessMeHandler<Response>(
  (body, init) => NextResponse.json(body, init),
  {
    ensureBusinessLogoColumn,
    getAuthUser: (request) => getAuthUser(request),
    resolveBusinessAccess,
    ensureBusinessHoursSchema: (executor) =>
      ensureBusinessHoursSchema(
        executor as Parameters<typeof ensureBusinessHoursSchema>[0],
      ),
    logDbUsage,
    query: async <T>(query: string, params?: Array<number | string | null>) => {
      void (0 as T | undefined);
      const [rows] = await pool.query(query, params);
      return [rows as unknown[]];
    },
    getBusinessLogoSelect,
    isBusinessOpenByHours,
    getRequestId,
    logServerError,
    pool,
  },
);

export async function GET(req: NextRequest): Promise<Response> {
  return handler(req);
}
