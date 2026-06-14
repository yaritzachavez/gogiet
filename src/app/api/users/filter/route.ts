import { NextResponse } from "next/server";

import { createUsersFilterHandler } from "./handler";

const handler = createUsersFilterHandler(NextResponse.json);

export const GET = (): Promise<Response> => handler() as Promise<Response>;
