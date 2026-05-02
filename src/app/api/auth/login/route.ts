import bcrypt from "bcrypt";
import jwt, { type SignOptions } from "jsonwebtoken";
import { NextResponse } from "next/server";

import {
  createUserSession,
  getDeviceName,
  getLocationLabel,
} from "@/lib/admin-security";
import pool, { logDbUsage } from "@/lib/db";
import { mapDbRolesToPublicRoles } from "@/lib/role-utils";

type UserRow = {
  id: number;
  first_name: string;
  last_name: string | null;
  email: string;
  password_hash: string;
  status_id: number;
};

export async function POST(req: Request) {
  try {
    const { email, password } = await req.json();
    const normalizedEmail = String(email ?? "")
      .trim()
      .toLowerCase();

    console.log("POST /api/auth/login email recibido:", normalizedEmail);
    logDbUsage("/api/auth/login", {
      email: normalizedEmail,
    });

    if (!normalizedEmail || !password) {
      return NextResponse.json(
        { success: false, error: "Faltan datos" },
        { status: 400 },
      );
    }

    const [rows] = await pool.query(
      `
      SELECT id, first_name, last_name, email, password_hash, status_id
      FROM users
      WHERE email = ?
      `,
      [normalizedEmail],
    );
    const users = rows as UserRow[];

    console.log(
      "POST /api/auth/login encontro usuario:",
      users.length > 0 ? users[0].id : null,
    );

    if (users.length === 0) {
      return NextResponse.json(
        { success: false, error: "Correo o contraseña incorrectos" },
        { status: 401 },
      );
    }

    const user = users[0];

    if (!user.password_hash) {
      console.error("POST /api/auth/login usuario sin password_hash:", user.id);
      return NextResponse.json(
        { success: false, error: "El usuario no tiene contraseña configurada" },
        { status: 500 },
      );
    }

    const pepper = process.env.PASSWORD_PEPPER ?? "";
    const passwordMatch = await bcrypt.compare(
      password + pepper,
      user.password_hash,
    );

    console.log("POST /api/auth/login password valida:", passwordMatch);

    if (!passwordMatch) {
      return NextResponse.json(
        { success: false, error: "Correo o contraseña incorrectos" },
        { status: 401 },
      );
    }

    const [roleRows] = await pool.query(
      `
      SELECT r.id, r.name
      FROM user_roles ur
      INNER JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id = ?
      `,
      [user.id],
    );

    const roles = roleRows as { id: number; name: string }[];
    const dbRoles = roles.map((role) => role.name);
    const publicRoles = mapDbRolesToPublicRoles(dbRoles);
    const primaryRole = publicRoles[0] ?? null;

    console.log("POST /api/auth/login role del usuario:", {
      dbRoles,
      publicRoles,
    });
    logDbUsage("/api/auth/login", {
      userId: user.id,
      email: user.email,
      role: publicRoles,
    });

    const hasRoles = roles.length > 0;
    const redirectTo = hasRoles ? "/pickdash" : "/";

    const secret: jwt.Secret =
      (process.env.JWT_SECRET as string) || "gogi-dev-secret";
    const expiresIn = (process.env.JWT_EXPIRES_IN ??
      "9h") as unknown as SignOptions["expiresIn"];

    const options: SignOptions = {
      expiresIn,
    };

    const token = jwt.sign(
      {
        id: user.id,
        name: `${user.first_name} ${user.last_name ?? ""}`.trim(),
        roles: dbRoles,
      },
      secret,
      options,
    );

    const deviceName = getDeviceName(req.headers.get("user-agent"));
    const forwardedFor =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
    const realIp = req.headers.get("x-real-ip");

    await createUserSession({
      userId: user.id,
      token,
      deviceName,
      location: getLocationLabel(forwardedFor || realIp),
    });

    return NextResponse.json({
      success: true,
      message: "Login exitoso",
      token,
      redirectTo,
      user: {
        id: user.id,
        name: `${user.first_name} ${user.last_name ?? ""}`.trim(),
        email: user.email,
        role: primaryRole,
        roles: publicRoles,
      },
    });
  } catch (error) {
    console.error("POST /api/auth/login error exacto:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Error en el servidor",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
