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

const BUSINESS_CATEGORY_SEEDS = [
  {
    name: "Restaurante",
    description: "Comida preparada y menu general",
    icon: "store",
  },
  {
    name: "Tacos",
    description: "Taquerias y antojitos mexicanos",
    icon: "utensils-crossed",
  },
  {
    name: "Hamburguesas",
    description: "Hamburguesas, hot dogs y comida rapida",
    icon: "burger",
  },
  {
    name: "Pizza",
    description: "Pizzerias y especialidades al horno",
    icon: "pizza",
  },
  {
    name: "Pollo",
    description: "Pollerias, alitas y rostizados",
    icon: "drumstick",
  },
  {
    name: "Mariscos",
    description: "Ceviches, cocteles y marisqueria",
    icon: "fish",
  },
  {
    name: "Sushi",
    description: "Sushi, ramen y comida asiatica",
    icon: "fish",
  },
  {
    name: "Cafe y postres",
    description: "Cafeterias, panaderias y reposteria",
    icon: "coffee",
  },
  {
    name: "Bebidas",
    description: "Jugos, licuados y bebidas preparadas",
    icon: "cup-soda",
  },
  {
    name: "Farmacia",
    description: "Medicamentos y articulos de farmacia",
    icon: "pill",
  },
  {
    name: "Supermercado",
    description: "Abarrotes, despensa y articulos del hogar",
    icon: "shopping-cart",
  },
  {
    name: "Mascotas",
    description: "Alimentos y accesorios para mascotas",
    icon: "paw-print",
  },
];

async function ensureRole(role) {
  return prisma.roles.upsert({
    where: { name: role.name },
    update: { description: role.description, updated_at: new Date() },
    create: role,
  });
}

async function ensureBusinessCategory(category) {
  return prisma.business_categories.upsert({
    where: { name: category.name },
    update: {
      description: category.description,
      icon: category.icon,
      updated_at: new Date(),
    },
    create: category,
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

  for (const category of BUSINESS_CATEGORY_SEEDS) {
    await ensureBusinessCategory(category);
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

  await prisma.product_categories.createMany({
    data: [
      { name: "hamburguesas", description: "Productos tipo hamburguesa" },
      { name: "pizzas", description: "Productos tipo pizza" },
      { name: "bebidas", description: "Bebidas frías o calientes" },
      { name: "postres", description: "Pasteles, pays y dulces" },
      { name: "snacks", description: "Botanas y acompañamientos" },
      { name: "restaurante", description: "Venta de comida preparada" },
      { name: "cafeteria", description: "Bebidas y snacks" },
      { name: "farmacia", description: "Medicamentos y productos de farmacia" },
      { name: "supermercado", description: "Abarrotes y productos básicos" },
    ],
    skipDuplicates: true,
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
