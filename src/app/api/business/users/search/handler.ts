import type { RowDataPacket } from "mysql2/promise";

type JsonResponse = {
  status: number;
  json: () => Promise<unknown>;
};

type JsonResponseFactory = (
  body: unknown,
  init: { status: number },
) => JsonResponse;

type SearchUsersRequest = {
  url: string;
  nextUrl: URL;
};

type SearchUsersAccess = {
  userId: number;
  email: string | null;
  roles: string[];
  businessId: number | null;
  businessIds: number[];
};

type SearchUserRow = RowDataPacket & {
  id: number;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
};

export type BusinessUsersSearchDependencies = {
  requireSellerAccess: (
    req: SearchUsersRequest,
    businessId?: number | null,
    deniedMessage?: string,
  ) => Promise<
    | { ok: false; response: JsonResponse }
    | {
        ok: true;
        access: { userId: number; email: string | null; roles: string[] };
        businessAccess: SearchUsersAccess;
      }
  >;
  logDbUsage: (
    endpoint: string,
    payload?: {
      userId?: number | null;
      email?: string | null;
      role?: string | string[] | null;
    },
  ) => void;
  query: (sql: string, params?: Array<string | number>) => Promise<unknown[][]>;
};

function toPositiveNumber(value: string | null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function maskEmail(value: string | null) {
  const email = String(value ?? "").trim();
  const atIndex = email.indexOf("@");

  if (atIndex <= 1) {
    return email ? "[correo protegido]" : "";
  }

  const local = email.slice(0, atIndex);
  const domain = email.slice(atIndex + 1);
  const maskedLocal =
    local.length <= 2 ? `${local[0] ?? "*"}*` : `${local.slice(0, 2)}***`;
  const maskedDomain =
    domain.length <= 4 ? domain : `${domain.slice(0, 2)}***${domain.slice(-2)}`;

  return `${maskedLocal}@${maskedDomain}`;
}

function internalError(jsonResponse: JsonResponseFactory) {
  return jsonResponse(
    {
      success: false,
      error: "No se pudieron buscar los usuarios.",
      users: [],
    },
    { status: 500 },
  );
}

export function createBusinessUsersSearchHandler(
  jsonResponse: JsonResponseFactory,
  dependencies: BusinessUsersSearchDependencies,
) {
  return async function GET(req: SearchUsersRequest) {
    try {
      const requestedBusinessId = toPositiveNumber(
        req.nextUrl.searchParams.get("business_id"),
      );
      const rawQuery = String(req.nextUrl.searchParams.get("q") ?? "").trim();
      const limitParam = Number(req.nextUrl.searchParams.get("limit") ?? 10);
      const limit = Number.isFinite(limitParam)
        ? Math.min(Math.max(limitParam, 1), 10)
        : 10;

      const auth = await dependencies.requireSellerAccess(
        req,
        requestedBusinessId,
        "No tienes permiso para buscar usuarios de este negocio.",
      );
      if (!auth.ok) {
        return auth.response;
      }

      dependencies.logDbUsage("/api/business/users/search", {
        userId: auth.businessAccess.userId,
        email: auth.businessAccess.email,
        role: auth.businessAccess.roles,
      });

      if (!auth.businessAccess.businessId) {
        return jsonResponse(
          {
            success: false,
            error: "No tienes permiso para buscar usuarios de este negocio.",
            users: [],
          },
          { status: 403 },
        );
      }

      if (rawQuery.length < 2) {
        return jsonResponse({ success: true, users: [] }, { status: 200 });
      }

      const likeQuery = `%${rawQuery}%`;
      const [rowsRaw] = await dependencies.query(
        `
          SELECT DISTINCT
            u.id,
            u.first_name,
            u.last_name,
            u.email
          FROM users u
          INNER JOIN (
            SELECT bo.user_id
            FROM business_owners bo
            WHERE bo.business_id = ?
            UNION
            SELECT bm.user_id
            FROM business_managers bm
            WHERE bm.business_id = ?
            UNION
            SELECT o.user_id
            FROM orders o
            WHERE o.business_id = ?
          ) related_users ON related_users.user_id = u.id
          WHERE
            u.first_name LIKE ?
            OR u.last_name LIKE ?
            OR CONCAT_WS(' ', u.first_name, u.last_name) LIKE ?
            OR u.email LIKE ?
          ORDER BY u.first_name ASC, u.last_name ASC, u.id ASC
          LIMIT ?
        `,
        [
          auth.businessAccess.businessId,
          auth.businessAccess.businessId,
          auth.businessAccess.businessId,
          likeQuery,
          likeQuery,
          likeQuery,
          likeQuery,
          limit,
        ],
      );
      const rows = rowsRaw as SearchUserRow[];

      return jsonResponse(
        {
          success: true,
          users: rows.map((row) => ({
            id: Number(row.id),
            name: `${row.first_name ?? ""} ${row.last_name ?? ""}`.trim(),
            identifier: maskEmail(row.email),
          })),
        },
        { status: 200 },
      );
    } catch {
      return internalError(jsonResponse);
    }
  };
}
