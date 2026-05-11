/* ENDPOINT TEMPORAL - BORRAR ANTES DE PRODUCCIÓN */

import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";

const DEVELOPMENT_ADMIN_EMAIL = "yaritzachavezc@gmail.com";
const ADMIN_ROLE_CANDIDATES = [
  "admin_general",
  "super_admin",
  "admin",
  "administrador_general",
  "Administrador General",
] as const;

export async function POST() {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json(
      {
        success: false,
        error: "Solo disponible en desarrollo",
      },
      { status: 403 },
    );
  }

  try {
    const user = await prisma.user.findUnique({
      where: {
        email: DEVELOPMENT_ADMIN_EMAIL,
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
      },
    });

    if (!user) {
      return NextResponse.json(
        {
          success: false,
          error: "No encontramos el usuario de desarrollo.",
        },
        { status: 404 },
      );
    }

    let role = await prisma.roles.findFirst({
      where: {
        name: {
          in: [...ADMIN_ROLE_CANDIDATES],
        },
      },
      select: {
        id: true,
        name: true,
      },
      orderBy: {
        id: "asc",
      },
    });

    if (!role) {
      role = await prisma.roles.create({
        data: {
          name: "admin_general",
        },
        select: {
          id: true,
          name: true,
        },
      });
    }

    const existingRelation = await prisma.user_roles.findUnique({
      where: {
        user_id_role_id: {
          user_id: user.id,
          role_id: role.id,
        },
      },
      select: {
        user_id: true,
        role_id: true,
      },
    });

    if (!existingRelation) {
      await prisma.user_roles.create({
        data: {
          user_id: user.id,
          role_id: role.id,
        },
      });
    }

    return NextResponse.json({
      success: true,
      user,
      role,
      alreadyHadRole: Boolean(existingRelation),
      message: "Usuario asignado como Administradora General",
    });
  } catch (error) {
    console.error("DEV MAKE ADMIN ERROR:", error);

    return NextResponse.json(
      {
        success: false,
        error: "No se pudo asignar el rol de Administradora General.",
      },
      { status: 500 },
    );
  }
}
