type JsonResponse = {
  status: number;
  json: () => Promise<unknown>;
};

type JsonResponseFactory = (
  body: unknown,
  init: { status: number },
) => JsonResponse;

export function createUsersFilterHandler(jsonResponse: JsonResponseFactory) {
  return async function GET() {
    return jsonResponse(
      {
        success: false,
        error: "Recurso no disponible.",
      },
      { status: 404 },
    );
  };
}
