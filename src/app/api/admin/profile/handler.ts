type JwtPayload = {
  id: number;
};

type ProfileRow = {
  id: number;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  profile_image_url: string | null;
};

export type AdminProfileRequest = {
  url?: string;
  headers: Pick<Headers, "get">;
  cookies?: {
    get: (name: string) => { value: string } | undefined;
  };
  json?: () => Promise<unknown>;
};

export type AdminProfileResponseInit = {
  status: number;
  headers?: Record<string, string>;
};

export type AdminProfileJsonResponse<TResponse> = (
  body: unknown,
  init: AdminProfileResponseInit,
) => TResponse;

export type AdminProfileDependencies = {
  getAuthUser: (request: AdminProfileRequest) => JwtPayload | null;
  isAdminGeneral: (userId: number) => Promise<boolean>;
  query: <_T>(
    query: string,
    params?: Array<number | string | null>,
  ) => Promise<[unknown[], unknown?]>;
  getRequestId: (request: AdminProfileRequest) => string;
  logServerError: (
    event: string,
    error: unknown,
    context: {
      request: AdminProfileRequest;
      userId: number | null;
    },
  ) => unknown;
};

function normalizeNameParts(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);

  return {
    firstName: parts[0] ?? "",
    lastName: parts.length > 1 ? parts.slice(1).join(" ") : null,
  };
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function exactErrorResponse<TResponse>(
  request: AdminProfileRequest,
  status: 400 | 401 | 403 | 404 | 500,
  message: string,
  jsonResponse: AdminProfileJsonResponse<TResponse>,
  getRequestId: AdminProfileDependencies["getRequestId"],
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

function logProfileError(
  request: AdminProfileRequest,
  event: string,
  error: unknown,
  userId: number | null,
  logServerError: AdminProfileDependencies["logServerError"],
) {
  logServerError(event, error, {
    request,
    userId,
  });
}

export function createAdminProfileHandlers<TResponse>(
  jsonResponse: AdminProfileJsonResponse<TResponse>,
  dependencies: AdminProfileDependencies,
) {
  return {
    GET: async (request: AdminProfileRequest): Promise<TResponse> => {
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

        const [rows] = await dependencies.query<ProfileRow>(
          `
            SELECT id, first_name, last_name, email, profile_image_url
            FROM users
            WHERE id = ?
            LIMIT 1
          `,
          [authUser.id],
        );

        const typedRows = rows as ProfileRow[];

        if (!typedRows.length) {
          return exactErrorResponse(
            request,
            404,
            "Perfil no encontrado",
            jsonResponse,
            dependencies.getRequestId,
          );
        }

        const user = typedRows[0];

        return jsonResponse(
          {
            success: true,
            profile: {
              id: user.id,
              name: `${user.first_name ?? ""} ${user.last_name ?? ""}`.trim(),
              email: user.email ?? "",
              imageUrl: user.profile_image_url ?? null,
            },
          },
          { status: 200 },
        );
      } catch (error) {
        logProfileError(
          request,
          "admin.profile_get_error",
          error,
          userId,
          dependencies.logServerError,
        );
        return exactErrorResponse(
          request,
          500,
          "No fue posible obtener la información del perfil",
          jsonResponse,
          dependencies.getRequestId,
        );
      }
    },
    PATCH: async (request: AdminProfileRequest): Promise<TResponse> => {
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

        const body = await request.json?.();
        const name = String((body as { name?: unknown })?.name ?? "").trim();
        const email = String((body as { email?: unknown })?.email ?? "")
          .trim()
          .toLowerCase();

        if (!name) {
          return exactErrorResponse(
            request,
            400,
            "El nombre es obligatorio",
            jsonResponse,
            dependencies.getRequestId,
          );
        }

        if (!email || !isValidEmail(email)) {
          return exactErrorResponse(
            request,
            400,
            "El correo no es válido",
            jsonResponse,
            dependencies.getRequestId,
          );
        }

        const { firstName, lastName } = normalizeNameParts(name);

        if (!firstName) {
          return exactErrorResponse(
            request,
            400,
            "El nombre es obligatorio",
            jsonResponse,
            dependencies.getRequestId,
          );
        }

        await dependencies.query(
          `
            UPDATE users
            SET
              first_name = ?,
              last_name = ?,
              email = ?,
              updated_at = NOW()
            WHERE id = ?
          `,
          [firstName, lastName, email, authUser.id],
        );

        return jsonResponse(
          {
            success: true,
            message: "Perfil actualizado",
            profile: {
              id: authUser.id,
              name,
              email,
              imageUrl: null,
            },
          },
          { status: 200 },
        );
      } catch (error) {
        logProfileError(
          request,
          "admin.profile_update_error",
          error,
          userId,
          dependencies.logServerError,
        );
        return exactErrorResponse(
          request,
          500,
          "No fue posible obtener la información del perfil",
          jsonResponse,
          dependencies.getRequestId,
        );
      }
    },
  };
}
