import { type NextRequest, NextResponse } from "next/server";

import { getAuthUser, isAdminGeneral } from "@/lib/admin-security";
import { getRequestId, logServerError } from "@/lib/api-error";
import { syncBusinessOwnerSafely } from "@/lib/business-owners";
import pool from "@/lib/db";

import { createAdminBusinessHandlers } from "./handler";

const handlers = createAdminBusinessHandlers<Response>(
  (body, init) => NextResponse.json(body, init),
  {
    getAuthUser: (request) => getAuthUser(request).user,
    isAdminGeneral,
    query: async <T>(query: string, params?: Array<number | string | null>) => {
      void (0 as T | undefined);
      const [rows] = await pool.query(query, params);
      return [rows];
    },
    getConnection: () => pool.getConnection(),
    syncBusinessOwnerSafely: async (connection, businessId, ownerId) =>
      syncBusinessOwnerSafely(connection as never, businessId, ownerId),
    getRequestId,
    logServerError,
  },
);

export async function GET(req: NextRequest): Promise<Response> {
  return handlers.GET(req);
}

export async function POST(req: NextRequest): Promise<Response> {
  return handlers.POST(req);
}
