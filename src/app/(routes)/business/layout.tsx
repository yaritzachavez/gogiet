import jwt from "jsonwebtoken";
import { Building2, LockKeyhole, ShieldAlert } from "lucide-react";
import type { RowDataPacket } from "mysql2/promise";
import { cookies } from "next/headers";
import Link from "next/link";

import { isSessionTokenActive } from "@/lib/auth-security";
import pool from "@/lib/db";

type BusinessLayoutProps = {
  children: React.ReactNode;
};

type RoleRow = RowDataPacket & {
  role_name: string;
};

type CountRow = RowDataPacket & {
  total: number;
};

type BusinessAccessState =
  | { kind: "allowed" }
  | { kind: "guest" }
  | { kind: "forbidden" };

function BusinessAccessCard(props: {
  icon: React.ReactNode;
  eyebrow: string;
  title: string;
  description: string;
  primaryHref: string;
  primaryLabel: string;
  secondaryHref: string;
  secondaryLabel: string;
}) {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(251,146,60,0.14),transparent_28%),linear-gradient(180deg,#0b0b0b_0%,#111111_48%,#151515_100%)] px-4 py-12 text-white sm:px-6 lg:px-8">
      <div className="mx-auto flex min-h-[72vh] max-w-3xl items-center">
        <section className="w-full overflow-hidden rounded-[28px] border border-white/10 bg-[#121212]/92 shadow-[0_28px_90px_rgba(0,0,0,0.38)] backdrop-blur-xl sm:rounded-[34px]">
          <div className="border-b border-white/10 bg-[linear-gradient(135deg,rgba(255,115,0,0.18),rgba(255,115,0,0.04)_55%,transparent)] px-5 py-6 sm:px-8">
            <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl border border-orange-400/25 bg-orange-500/10 text-orange-200 shadow-[0_12px_35px_rgba(255,115,0,0.18)]">
              {props.icon}
            </div>
            <p className="mt-4 text-xs font-extrabold uppercase tracking-[0.26em] text-orange-200/90">
              {props.eyebrow}
            </p>
            <h1 className="mt-3 text-3xl font-black tracking-tight text-white sm:text-4xl">
              {props.title}
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-neutral-300 sm:text-base">
              {props.description}
            </p>
          </div>

          <div className="flex flex-col gap-3 px-5 py-5 sm:flex-row sm:px-8 sm:py-7">
            <Link
              href={props.primaryHref}
              className="inline-flex min-h-12 items-center justify-center rounded-2xl bg-gradient-to-r from-orange-500 via-orange-500 to-orange-400 px-5 text-center text-sm font-bold text-white shadow-[0_18px_45px_rgba(255,115,0,0.24)] transition hover:scale-[1.01] hover:from-orange-400 hover:to-orange-500"
            >
              {props.primaryLabel}
            </Link>
            <Link
              href={props.secondaryHref}
              className="inline-flex min-h-12 items-center justify-center rounded-2xl border border-white/12 bg-white/5 px-5 text-center text-sm font-semibold text-neutral-100 transition hover:border-orange-300/30 hover:bg-orange-500/8"
            >
              {props.secondaryLabel}
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}

async function getBusinessPanelAccessState(): Promise<BusinessAccessState> {
  const cookieStore = await cookies();
  const token = cookieStore.get("authToken")?.value ?? null;

  if (!token) {
    return { kind: "guest" };
  }

  const secret = process.env.JWT_SECRET || "gogi-dev-secret";
  let userId: number | null = null;

  try {
    const payload = jwt.verify(token, secret) as { id?: unknown };
    const parsedUserId = Number(payload.id ?? 0);
    userId =
      Number.isFinite(parsedUserId) && parsedUserId > 0 ? parsedUserId : null;
  } catch {
    return { kind: "guest" };
  }

  if (!userId) {
    return { kind: "guest" };
  }

  const activeSession = await isSessionTokenActive(token);

  if (!activeSession) {
    return { kind: "guest" };
  }

  const [roleRows] = await pool.query<RoleRow[]>(
    `
      SELECT r.name AS role_name
      FROM user_roles ur
      INNER JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id = ?
    `,
    [userId],
  );

  const roleNames = new Set(
    roleRows.map((row) => String(row.role_name ?? "").trim()),
  );

  if (roleNames.has("admin_general")) {
    return { kind: "allowed" };
  }

  const hasBusinessAdminRole = roleNames.has("business_admin");
  const hasBusinessStaffRole = roleNames.has("business_staff");

  if (!hasBusinessAdminRole && !hasBusinessStaffRole) {
    return { kind: "forbidden" };
  }

  const [ownerRows] = hasBusinessAdminRole
    ? await pool.query<CountRow[]>(
        `
          SELECT COUNT(*) AS total
          FROM business_owners
          WHERE user_id = ?
        `,
        [userId],
      )
    : [[{ total: 0 }] as CountRow[]];

  const [managerRows] = hasBusinessStaffRole
    ? await pool.query<CountRow[]>(
        `
          SELECT COUNT(*) AS total
          FROM business_managers
          WHERE user_id = ? AND COALESCE(is_active, 1) = 1
        `,
        [userId],
      )
    : [[{ total: 0 }] as CountRow[]];

  const ownerAssignments = Number(ownerRows[0]?.total ?? 0);
  const managerAssignments = Number(managerRows[0]?.total ?? 0);

  if (
    (hasBusinessAdminRole && ownerAssignments > 0) ||
    (hasBusinessStaffRole && managerAssignments > 0)
  ) {
    return { kind: "allowed" };
  }

  return { kind: "forbidden" };
}

export default async function BusinessLayout({
  children,
}: BusinessLayoutProps) {
  const accessState = await getBusinessPanelAccessState();

  if (accessState.kind === "guest") {
    return (
      <BusinessAccessCard
        icon={<LockKeyhole className="h-6 w-6" />}
        eyebrow="Panel de Negocio"
        title="Acceso exclusivo para negocios"
        description="Para entrar a este panel necesitas iniciar sesión con una cuenta de negocio autorizada. Así protegemos la información operativa y evitamos accesos incorrectos."
        primaryHref="/login"
        primaryLabel="Iniciar sesión"
        secondaryHref="mailto:soporte@gogieats.shop?subject=Solicitud%20de%20acceso%20para%20mi%20negocio"
        secondaryLabel="Solicitar acceso para mi negocio"
      />
    );
  }

  if (accessState.kind === "forbidden") {
    return (
      <BusinessAccessCard
        icon={<ShieldAlert className="h-6 w-6" />}
        eyebrow="Acceso restringido"
        title="Tu cuenta no tiene acceso a este panel"
        description="Este apartado es exclusivo para negocios registrados y vendedores autorizados dentro de Gogi Eats. Si necesitas acceso, podemos revisarlo contigo por soporte."
        primaryHref="mailto:soporte@gogieats.shop?subject=Soporte%20de%20acceso%20al%20panel%20de%20negocio"
        primaryLabel="Contactar soporte"
        secondaryHref="/"
        secondaryLabel="Volver al inicio"
      />
    );
  }

  return (
    <>
      <div className="border-b border-white/5 bg-[#0f0f10] px-4 py-3 text-center text-[11px] font-semibold uppercase tracking-[0.24em] text-neutral-400 sm:px-6">
        <span className="inline-flex items-center gap-2 rounded-full border border-orange-400/15 bg-orange-500/8 px-3 py-1 text-orange-200/90">
          <Building2 className="h-3.5 w-3.5" />
          Panel de negocio protegido
        </span>
      </div>
      {children}
    </>
  );
}
