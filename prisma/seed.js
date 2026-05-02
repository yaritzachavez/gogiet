const bcrypt = require("bcrypt");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

const ROLE_SEEDS = [
  {
    name: "admin_general",
    description: "Administrador general de la plataforma",
  },
  { name: "repartidor", description: "Usuario repartidor" },
  { name: "business_admin", description: "Administrador o dueno de tienda" },
  { name: "business_staff", description: "Vendedor o personal del negocio" },
  { name: "cliente", description: "Cliente de la plataforma" },
];

async function ensureRole(role) {
  return prisma.roles.upsert({
    where: { name: role.name },
    update: { description: role.description, updated_at: new Date() },
    create: role,
  });
}

async function ensureActiveStatus() {
  return prisma.status_catalog.upsert({
    where: { name: "activo" },
    update: { description: "Registro activo", updated_at: new Date() },
    create: {
      name: "activo",
      description: "Registro activo",
    },
  });
}

async function main() {
  for (const role of ROLE_SEEDS) {
    await ensureRole(role);
  }

  const activeStatus = await ensureActiveStatus();
  const adminRole = await prisma.roles.findUnique({
    where: { name: "admin_general" },
    select: { id: true },
  });

  if (!adminRole) {
    throw new Error("No se pudo crear el rol admin_general.");
  }

  const adminEmail = (
    process.env.ADMIN_INITIAL_EMAIL || "admin@gogieats.local"
  )
    .trim()
    .toLowerCase();
  const adminPassword = process.env.ADMIN_INITIAL_PASSWORD || "Admin12345!";
  const adminFirstName = process.env.ADMIN_INITIAL_FIRST_NAME || "Admin";
  const adminLastName = process.env.ADMIN_INITIAL_LAST_NAME || "General";
  const adminPhone = process.env.ADMIN_INITIAL_PHONE || null;

  const pepper = process.env.PASSWORD_PEPPER || "";
  const saltRounds = Number(process.env.SALT_ROUNDS || 12);
  const passwordHash = await bcrypt.hash(adminPassword + pepper, saltRounds);

  const existingAdmin = await prisma.user.findUnique({
    where: { email: adminEmail },
    select: { id: true },
  });

  const adminUser = existingAdmin
    ? await prisma.user.update({
        where: { id: existingAdmin.id },
        data: {
          firstName: adminFirstName,
          lastName: adminLastName,
          phone: adminPhone,
          passwordHash,
          statusId: activeStatus.id,
        },
        select: { id: true, email: true },
      })
    : await prisma.user.create({
        data: {
          firstName: adminFirstName,
          lastName: adminLastName,
          email: adminEmail,
          phone: adminPhone,
          passwordHash,
          statusId: activeStatus.id,
        },
        select: { id: true, email: true },
      });

  await prisma.user_roles.upsert({
    where: {
      user_id_role_id: {
        user_id: adminUser.id,
        role_id: adminRole.id,
      },
    },
    update: {
      assigned_at: new Date(),
    },
    create: {
      user_id: adminUser.id,
      role_id: adminRole.id,
    },
  });

  console.log("Admin general inicial listo:", {
    email: adminUser.email,
    password: adminPassword,
  });
}

main()
  .catch((error) => {
    console.error("Error en prisma seed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
