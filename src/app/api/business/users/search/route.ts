import type { RowDataPacket } from "mysql2/promise";
import { type NextRequest, NextResponse } from "next/server";

import pool, { logDbUsage } from "@/lib/db";
import { requireSellerAccess } from "@/lib/permissions";
import { createBusinessUsersSearchHandler } from "./handler";

const handler = createBusinessUsersSearchHandler(NextResponse.json, {
  requireSellerAccess: async (req, businessId, deniedMessage) =>
    requireSellerAccess(req as NextRequest, businessId, deniedMessage),
  logDbUsage,
  query: async (sql, params) => {
    const [rows] = await pool.query(sql, params);
    return [rows as RowDataPacket[]];
  },
});

export const GET = (req: NextRequest): Promise<Response> =>
  handler(req) as Promise<Response>;
