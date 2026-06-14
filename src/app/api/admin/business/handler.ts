import type { ResultSetHeader } from "mysql2/promise";

type AuthUser = { id: number } | null;

type BusinessRow = {
  id: number;
  name: string;
  legal_name: string | null;
  city: string | null;
  district: string | null;
  address: string | null;
  address_notes: string | null;
  status_id: number | null;
  is_open: number | boolean | null;
  business_category_id: number | null;
  category_name: string | null;
  owner_id: number | null;
  created_at: Date | string;
  updated_at: Date | string;
};

export type AdminBusinessRequest = {
  url?: string;
  headers: Pick<Headers, "get">;
  cookies?: {
    get: (name: string) => { value: string } | undefined;
  };
  json?: () => Promise<unknown>;
};

export type AdminBusinessResponseInit = {
  status: number;
  headers?: Record<string, string>;
};

export type AdminBusinessJsonResponse<TResponse> = (
  body: unknown,
  init: AdminBusinessResponseInit,
) => TResponse;

type TransactionConnection = {
  beginTransaction: () => Promise<void>;
  query: (
    query: string,
    params?: Array<number | string | null>,
  ) => Promise<unknown>;
  commit: () => Promise<void>;
  rollback: () => Promise<void>;
  release: () => void;
};

export type AdminBusinessDependencies = {
  getAuthUser: (request: AdminBusinessRequest) => AuthUser;
  isAdminGeneral: (userId: number) => Promise<boolean>;
  query: (
    query: string,
    params?: Array<number | string | null>,
  ) => Promise<unknown>;
  getConnection: () => Promise<TransactionConnection>;
  syncBusinessOwnerSafely: (
    connection: TransactionConnection,
    businessId: number,
    ownerId: number,
  ) => Promise<{ alreadyAssigned: boolean }>;
  getRequestId: (request: AdminBusinessRequest) => string;
  logServerError: (
    event: string,
    error: unknown,
    context: {
      request: AdminBusinessRequest;
      userId: number | null;
      businessId?: number | null;
    },
  ) => unknown;
};

function parsePositiveNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function mapBusinessRow(row: BusinessRow) {
  const isActive = Number(row.status_id ?? 0) === 1 && Boolean(row.is_open);

  return {
    id: row.id,
    name: row.name,
    legal_name: row.legal_name,
    city: row.city,
    district: row.district,
    address: row.address,
    address_notes: row.address_notes,
    status_id: row.status_id,
    business_category_id: row.business_category_id,
    category_name: row.category_name,
    owner_id: row.owner_id,
    created_at: row.created_at,
    updated_at: row.updated_at,
    business_owner: { user_id: row.owner_id ?? null },
    is_active: isActive,
    is_open_now: isActive,
  };
}

async function getBusinessRowById(
  query: AdminBusinessDependencies["query"],
  businessId: number,
) {
  const [rows] = (await query(
    `
      SELECT
        b.id,
        b.name,
        b.legal_name,
        b.city,
        b.district,
        b.address,
        b.address_notes,
        b.status_id,
        b.is_open,
        bcm.category_id AS business_category_id,
        bc.name AS category_name,
        bo.user_id AS owner_id,
        b.created_at,
        b.updated_at
      FROM business b
      LEFT JOIN business_category_map bcm ON bcm.business_id = b.id
      LEFT JOIN business_categories bc ON bc.id = bcm.category_id
      LEFT JOIN business_owners bo ON bo.business_id = b.id
      WHERE b.id = ?
      LIMIT 1
    `,
    [businessId],
  )) as [BusinessRow[]];

  return (rows as BusinessRow[])[0] ?? null;
}

async function resolveCategoryId(
  query: AdminBusinessDependencies["query"],
  rawCategory: unknown,
) {
  const numericCategoryId = parsePositiveNumber(rawCategory);
  if (numericCategoryId) return numericCategoryId;

  const categoryName = String(rawCategory ?? "").trim();
  if (!categoryName) return null;

  const [rows] = (await query(
    `
      SELECT id
      FROM business_categories
      WHERE name = ?
      LIMIT 1
    `,
    [categoryName],
  )) as [Array<{ id: number }>];

  return (rows as Array<{ id: number }>)[0]?.id ?? null;
}

function exactErrorResponse<TResponse>(
  request: AdminBusinessRequest,
  status: 400 | 401 | 403 | 500,
  message: string,
  jsonResponse: AdminBusinessJsonResponse<TResponse>,
  getRequestId: AdminBusinessDependencies["getRequestId"],
) {
  return jsonResponse(
    { error: message },
    {
      status,
      headers: {
        "x-request-id": getRequestId(request),
      },
    },
  );
}

function logBusinessError(
  request: AdminBusinessRequest,
  event: string,
  error: unknown,
  userId: number | null,
  businessId: number | null,
  logServerError: AdminBusinessDependencies["logServerError"],
) {
  logServerError(event, error, {
    request,
    userId,
    businessId,
  });
}

export function createAdminBusinessHandlers<TResponse>(
  jsonResponse: AdminBusinessJsonResponse<TResponse>,
  dependencies: AdminBusinessDependencies,
) {
  return {
    GET: async (request: AdminBusinessRequest): Promise<TResponse> => {
      let userId: number | null = null;

      try {
        const authUser = dependencies.getAuthUser(request);

        if (!authUser) {
          return exactErrorResponse(
            request,
            401,
            "No autorizado",
            jsonResponse,
            dependencies.getRequestId,
          );
        }

        userId = authUser.id;

        if (!(await dependencies.isAdminGeneral(authUser.id))) {
          return exactErrorResponse(
            request,
            403,
            "No tienes permisos para realizar esta acción",
            jsonResponse,
            dependencies.getRequestId,
          );
        }

        const [rows] = (await dependencies.query(
          `
            SELECT
              b.id,
              b.name,
              b.legal_name,
              b.city,
              b.district,
              b.address,
              b.address_notes,
              b.status_id,
              b.is_open,
              bcm.category_id AS business_category_id,
              bc.name AS category_name,
              bo.user_id AS owner_id,
              b.created_at,
              b.updated_at
            FROM business b
            LEFT JOIN business_category_map bcm ON bcm.business_id = b.id
            LEFT JOIN business_categories bc ON bc.id = bcm.category_id
            LEFT JOIN business_owners bo ON bo.business_id = b.id
            ORDER BY b.id DESC
          `,
        )) as [BusinessRow[]];

        return jsonResponse(
          {
            success: true,
            businesses: (rows as BusinessRow[]).map(mapBusinessRow),
          },
          { status: 200 },
        );
      } catch (error) {
        logBusinessError(
          request,
          "admin.business.list_error",
          error,
          userId,
          null,
          dependencies.logServerError,
        );
        return exactErrorResponse(
          request,
          500,
          "No fue posible obtener la información de los negocios",
          jsonResponse,
          dependencies.getRequestId,
        );
      }
    },
    POST: async (request: AdminBusinessRequest): Promise<TResponse> => {
      const connection = await dependencies.getConnection();
      let userId: number | null = null;
      let createdBusinessId: number | null = null;

      try {
        const authUser = dependencies.getAuthUser(request);

        if (!authUser) {
          return exactErrorResponse(
            request,
            401,
            "No autorizado",
            jsonResponse,
            dependencies.getRequestId,
          );
        }

        userId = authUser.id;

        if (!(await dependencies.isAdminGeneral(authUser.id))) {
          return exactErrorResponse(
            request,
            403,
            "No tienes permisos para realizar esta acción",
            jsonResponse,
            dependencies.getRequestId,
          );
        }

        const body = await request.json?.();
        const payload = (body ?? {}) as Record<string, unknown>;
        const ownerId = parsePositiveNumber(payload.owner_id);
        const categoryId =
          (await resolveCategoryId(
            dependencies.query,
            payload.business_category_id,
          )) ??
          (await resolveCategoryId(dependencies.query, payload.category_id)) ??
          (await resolveCategoryId(dependencies.query, payload.category));
        const name = String(payload.name ?? "").trim();
        const city = String(payload.city ?? "").trim();
        const district = String(payload.district ?? "").trim();
        const address = String(payload.address ?? "").trim();
        const legalName = String(payload.legal_name ?? "").trim();
        const taxId = String(payload.tax_id ?? "").trim();
        const addressNotes = String(payload.address_notes ?? "").trim();

        if (!ownerId || !name || !categoryId || !city) {
          return exactErrorResponse(
            request,
            400,
            "owner_id, name, category y city son requeridos",
            jsonResponse,
            dependencies.getRequestId,
          );
        }

        await connection.beginTransaction();

        const [insertResult] = (await connection.query(
          `
            INSERT INTO business (
              name,
              legal_name,
              tax_id,
              city,
              district,
              address,
              address_notes,
              status_id,
              is_open,
              created_at,
              updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, 1, 1, NOW(), NOW())
          `,
          [
            name,
            legalName || null,
            taxId || null,
            city,
            district || null,
            address || city,
            addressNotes || null,
          ],
        )) as [ResultSetHeader];

        createdBusinessId = insertResult.insertId;

        await connection.query(
          `
            INSERT INTO business_category_map (business_id, category_id)
            VALUES (?, ?)
          `,
          [createdBusinessId, categoryId],
        );

        const { alreadyAssigned: ownerAlreadyAssigned } =
          await dependencies.syncBusinessOwnerSafely(
            connection,
            createdBusinessId,
            ownerId,
          );

        await connection.query(
          `
            INSERT IGNORE INTO user_roles (user_id, role_id)
            SELECT ?, id FROM roles WHERE name = 'business_admin'
          `,
          [ownerId],
        );

        await connection.commit();

        const business = await getBusinessRowById(
          dependencies.query,
          createdBusinessId,
        );

        return jsonResponse(
          {
            success: true,
            message: ownerAlreadyAssigned
              ? "Negocio creado correctamente. El dueño ya estaba asignado a este negocio."
              : "Negocio creado correctamente",
            owner_assignment_message: ownerAlreadyAssigned
              ? "El negocio ya tiene ese dueño asignado"
              : "Dueño asignado correctamente",
            business: business ? mapBusinessRow(business) : null,
          },
          { status: 201 },
        );
      } catch (error) {
        await connection.rollback();
        logBusinessError(
          request,
          "admin.business.create_error",
          error,
          userId,
          createdBusinessId,
          dependencies.logServerError,
        );
        return exactErrorResponse(
          request,
          500,
          "No fue posible crear el negocio",
          jsonResponse,
          dependencies.getRequestId,
        );
      } finally {
        connection.release();
      }
    },
  };
}
