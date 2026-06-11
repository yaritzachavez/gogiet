type BusinessRow = {
  id: number;
  name: string;
  logo_url: string | null;
  business_category_id: number | null;
  category_name: string | null;
  city: string | null;
  district: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  legal_name: string | null;
  tax_id: string | null;
  address_notes: string | null;
  created_at: string;
  updated_at: string;
  status_id: number | null;
  is_open_now: number | boolean | null;
  owner_id: number | null;
};

type HourRow = {
  day_of_week: number;
  open_time: string | null;
  close_time: string | null;
  is_closed: number | boolean | null;
  is_24_hours: number | boolean | null;
};

type CountRow = {
  total: number | null;
};

type AssignedBusiness = {
  id: number;
  name: string;
  city: string | null;
  source: string;
};

type BusinessAccessResult = {
  userId: number;
  email: string | null;
  roles: string[];
  businessId: number | null;
  businessIds: number[];
  businesses: AssignedBusiness[];
  selectedBusinessSource: string | null;
  requestedBusinessId: number | null;
  denialReason: "not_assigned" | "requested_business_forbidden" | null;
  isAdmin: boolean;
};

type AuthUserResult = {
  token: string | null;
  user: {
    id: number;
  } | null;
};

export type BusinessMeRequest = {
  url?: string;
  nextUrl: URL;
  headers: Pick<Headers, "get">;
  cookies?: {
    get: (name: string) => { value: string } | undefined;
  };
};

export type BusinessMeResponseInit = {
  status: number;
  headers?: Record<string, string>;
};

export type BusinessMeJsonResponse<TResponse> = (
  body: unknown,
  init: BusinessMeResponseInit,
) => TResponse;

export type BusinessMeDependencies = {
  ensureBusinessLogoColumn: () => Promise<unknown>;
  getAuthUser: (request: BusinessMeRequest) => AuthUserResult;
  resolveBusinessAccess: (
    userId: number,
    requestedBusinessId?: number | null,
  ) => Promise<BusinessAccessResult>;
  ensureBusinessHoursSchema: (executor: unknown) => Promise<unknown>;
  logDbUsage: (
    endpoint: string,
    payload?: {
      userId?: number | null;
      role?: string | string[] | null;
      email?: string | null;
    },
  ) => void;
  query: <_T>(
    query: string,
    params?: Array<number | string | null>,
  ) => Promise<[unknown[], unknown?]>;
  getBusinessLogoSelect: (alias: string) => string;
  isBusinessOpenByHours: (params: {
    statusId: number;
    fallbackOpen: boolean;
    hours: HourRow[];
  }) => boolean;
  getRequestId: (request: BusinessMeRequest) => string;
  logServerError: (
    event: string,
    error: unknown,
    context: {
      request: BusinessMeRequest;
      userId: number | null;
      requestedBusinessId: number | null;
      resolvedBusinessId: number | null;
    },
  ) => unknown;
  pool: unknown;
};

async function countSafely(
  queryExecutor: BusinessMeDependencies["query"],
  query: string,
  params: Array<number | string | null>,
) {
  try {
    const [rows] = await queryExecutor<CountRow>(query, params);
    const typedRows = rows as CountRow[];
    return Number(typedRows[0]?.total ?? 0);
  } catch {
    return 0;
  }
}

function toPositiveNumber(value: string | null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function exactErrorResponse<TResponse>(
  request: BusinessMeRequest,
  status: 401 | 403 | 500,
  message: string,
  jsonResponse: BusinessMeJsonResponse<TResponse>,
  getRequestId: BusinessMeDependencies["getRequestId"],
): TResponse {
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

function logBusinessMeError(
  request: BusinessMeRequest,
  event: string,
  error: unknown,
  context: {
    userId: number | null;
    requestedBusinessId: number | null;
    resolvedBusinessId: number | null;
  },
  logServerError: BusinessMeDependencies["logServerError"],
) {
  logServerError(event, error, {
    request,
    userId: context.userId,
    requestedBusinessId: context.requestedBusinessId,
    resolvedBusinessId: context.resolvedBusinessId,
  });
}

export function createBusinessMeHandler<TResponse>(
  jsonResponse: BusinessMeJsonResponse<TResponse>,
  dependencies: BusinessMeDependencies,
) {
  return async function handler(
    request: BusinessMeRequest,
  ): Promise<TResponse> {
    let userId: number | null = null;
    let requestedBusinessId: number | null = null;
    let resolvedBusinessId: number | null = null;

    try {
      await dependencies.ensureBusinessLogoColumn();

      const authUser = dependencies.getAuthUser(request);

      if (!authUser?.token) {
        return exactErrorResponse(
          request,
          401,
          "No autorizado",
          jsonResponse,
          dependencies.getRequestId,
        );
      }

      if (!authUser?.user) {
        return exactErrorResponse(
          request,
          401,
          "No autorizado",
          jsonResponse,
          dependencies.getRequestId,
        );
      }

      requestedBusinessId = toPositiveNumber(
        request.nextUrl.searchParams.get("business_id"),
      );
      userId = authUser.user.id;
      const access = await dependencies.resolveBusinessAccess(
        authUser.user.id,
        requestedBusinessId,
      );
      resolvedBusinessId = access.businessId;
      dependencies.logDbUsage("/api/business/me", {
        userId: access.userId,
        role: access.roles,
      });

      if (!access.businessId) {
        return exactErrorResponse(
          request,
          403,
          "No tienes acceso a este negocio",
          jsonResponse,
          dependencies.getRequestId,
        );
      }

      const businessId = Number(access.businessId);
      const avatarSelect = dependencies.getBusinessLogoSelect("b");

      const [rows] = await dependencies.query<BusinessRow>(
        `
        SELECT
          b.id,
          b.name,
          ${avatarSelect},
          bcm.category_id AS business_category_id,
          bc.name AS category_name,
          b.city,
          b.district,
          b.address,
          b.phone,
          b.email,
          b.legal_name,
          b.tax_id,
          b.address_notes,
          b.created_at,
          b.updated_at,
          b.status_id,
          b.is_open AS is_open_now,
          bo.user_id AS owner_id
        FROM business b
        LEFT JOIN business_category_map bcm ON bcm.business_id = b.id
        LEFT JOIN business_categories bc ON bc.id = bcm.category_id
        LEFT JOIN business_owners bo ON bo.business_id = b.id
        WHERE b.id = ?
        LIMIT 1
      `,
        [businessId],
      );

      const business = (rows as BusinessRow[])[0];

      if (!business) {
        logBusinessMeError(
          request,
          "business.me.missing_business_record",
          new Error(
            "Resolved business access without a matching business row.",
          ),
          {
            userId,
            requestedBusinessId,
            resolvedBusinessId,
          },
          dependencies.logServerError,
        );
        return exactErrorResponse(
          request,
          500,
          "No fue posible obtener la información del negocio",
          jsonResponse,
          dependencies.getRequestId,
        );
      }

      await dependencies.ensureBusinessHoursSchema(dependencies.pool);

      let hoursRows: HourRow[] = [];
      try {
        const [resolvedHoursRows] = await dependencies.query<HourRow>(
          `
          SELECT day_of_week, open_time, close_time, is_closed, is_24_hours
          FROM business_hours
          WHERE business_id = ?
          ORDER BY day_of_week ASC
        `,
          [businessId],
        );
        hoursRows = resolvedHoursRows as HourRow[];
      } catch (error) {
        void error;
      }

      const productsCount = await countSafely(
        dependencies.query,
        `
        SELECT COUNT(*) AS total
        FROM products
        WHERE business_id = ? AND status_id = 1
      `,
        [businessId],
      );

      const activeOrdersCount = await countSafely(
        dependencies.query,
        `
        SELECT COUNT(*) AS total
        FROM orders o
        LEFT JOIN order_status_catalog osc ON osc.id = o.order_status_id
        WHERE o.business_id = ?
          AND LOWER(TRIM(COALESCE(osc.name, ''))) NOT IN ('entregado', 'cancelado', 'pago_rechazado')
      `,
        [businessId],
      );

      const completedOrdersCount = await countSafely(
        dependencies.query,
        `
        SELECT COUNT(*) AS total
        FROM orders o
        LEFT JOIN order_status_catalog osc ON osc.id = o.order_status_id
        WHERE o.business_id = ?
          AND LOWER(TRIM(COALESCE(osc.name, ''))) = 'entregado'
      `,
        [businessId],
      );

      const criticalInventoryCount = await countSafely(
        dependencies.query,
        `
        SELECT COUNT(*) AS total
        FROM products
        WHERE business_id = ?
          AND status_id = 1
          AND COALESCE(stock_average, 0) <= COALESCE(NULLIF(stock_danger, 0), 10)
      `,
        [businessId],
      );

      return jsonResponse(
        {
          success: true,
          business: {
            id: Number(business.id),
            name: business.name,
            logo_url: business.logo_url ?? null,
            category: business.category_name,
            category_name: business.category_name,
            business_category_id: business.business_category_id,
            city: business.city,
            district: business.district,
            address: business.address,
            legal_name: business.legal_name,
            tax_id: business.tax_id,
            address_notes: business.address_notes,
            created_at: business.created_at,
            updated_at: business.updated_at,
            status: business.status_id,
            status_id: business.status_id,
            is_open_now: dependencies.isBusinessOpenByHours({
              statusId: Number(business.status_id ?? 1),
              fallbackOpen: Boolean(business.is_open_now),
              hours: hoursRows,
            }),
            business_owner: { user_id: business.owner_id ?? null },
          },
          businesses: access.businesses.map((assignedBusiness) => ({
            id: Number(assignedBusiness.id),
            name: assignedBusiness.name,
            city: assignedBusiness.city,
            source: assignedBusiness.source,
          })),
          products_count: productsCount,
          active_orders_count: activeOrdersCount,
          completed_orders_count: completedOrdersCount,
          critical_inventory_count: criticalInventoryCount,
          hours: hoursRows.map((hour) => ({
            day_of_week: Number(hour.day_of_week),
            day_name:
              [
                "Lunes",
                "Martes",
                "Miércoles",
                "Jueves",
                "Viernes",
                "Sábado",
                "Domingo",
              ][Number(hour.day_of_week)] ?? "Día",
            open_time: hour.open_time,
            close_time: hour.close_time,
            is_closed: Boolean(hour.is_closed),
            is_24_hours: Boolean(hour.is_24_hours),
          })),
        },
        { status: 200 },
      );
    } catch (error) {
      logBusinessMeError(
        request,
        "business.me.get_error",
        error,
        {
          userId,
          requestedBusinessId,
          resolvedBusinessId,
        },
        dependencies.logServerError,
      );
      return exactErrorResponse(
        request,
        500,
        "No fue posible obtener la información del negocio",
        jsonResponse,
        dependencies.getRequestId,
      );
    }
  };
}
