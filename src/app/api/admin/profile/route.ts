import { type NextRequest, NextResponse } from "next/server";

import { getAuthUser, isAdminGeneral } from "@/lib/admin-security";
import { getRequestId, logServerError } from "@/lib/api-error";
import pool from "@/lib/db";

import { createAdminProfileHandlers } from "./handler";

const handlers = createAdminProfileHandlers<Response>(
  (body, init) => NextResponse.json(body, init),
  {
    getAuthUser: (request) => {
      const auth = getAuthUser(request);
      return auth.user;
    },
    isAdminGeneral,
    query: async <T>(query: string, params?: Array<number | string | null>) => {
      void (0 as T | undefined);
      const [rows] = await pool.query(query, params);
      return [rows as unknown[]];
    },
    getRequestId,
    logServerError,
  },
);

export async function GET(req: NextRequest): Promise<Response> {
  return handlers.GET(req);
}

export async function PATCH(req: NextRequest): Promise<Response> {
  return handlers.PATCH(req);
}
