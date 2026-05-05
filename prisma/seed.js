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
    name: "Abarrotes",
    description: "Abarrotes y productos basicos",
    icon: "shopping-basket",
  },
  {
    name: "Cafe y postres",
    description: "Cafeterias, panaderias y reposteria",
    icon: "coffee",
  },
  {
    name: "Carnes",
    description: "Carniceria y productos de origen animal",
    icon: "beef",
  },
  {
    name: "Congelados",
    description: "Productos congelados y refrigerados",
    icon: "snowflake",
  },
  {
    name: "Farmacia",
    description: "Medicamentos y articulos de farmacia",
    icon: "pill",
  },
  {
    name: "Frutas",
    description: "Frutas frescas y de temporada",
    icon: "apple",
  },
  {
    name: "Hamburguesas",
    description: "Hamburguesas, hot dogs y comida rapida",
    icon: "burger",
  },
  {
    name: "Lacteos",
    description: "Leche, quesos, yogurt y derivados",
    icon: "milk",
  },
  {
    name: "Mariscos",
    description: "Ceviches, cocteles y marisqueria",
    icon: "fish",
  },
  {
    name: "Mascotas",
    description: "Alimentos y accesorios para mascotas",
    icon: "paw-print",
  },
  {
    name: "Organicos",
    description: "Productos organicos y naturales",
    icon: "leaf",
  },
  {
    name: "Panaderia",
    description: "Pan fresco, bolleria y reposteria",
    icon: "bread",
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
    name: "Regalos",
    description: "Tienda de regalos y detalles",
    icon: "gift",
  },
  {
    name: "Restaurante",
    description: "Comida preparada y menu general",
    icon: "store",
  },
  {
    name: "Supermercado",
    description: "Abarrotes, despensa y articulos del hogar",
    icon: "shopping-cart",
  },
  {
    name: "Sushi",
    description: "Sushi, ramen y comida asiatica",
    icon: "fish",
  },
  {
    name: "Tacos",
    description: "Taquerias y antojitos mexicanos",
    icon: "utensils-crossed",
  },
  {
    name: "Verduras",
    description: "Verduras frescas y de temporada",
    icon: "carrot",
  },
  {
    name: "Bebidas",
    description: "Jugos, licuados y bebidas preparadas",
    icon: "cup-soda",
  },
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

  await prisma.business_categories.createMany({
    data: BUSINESS_CATEGORY_SEEDS,
    skipDuplicates: true,
  });

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
      { name: "abarrotes", description: "Abarrotes y productos básicos" },
      { name: "accesorios", description: "Accesorios y complementos" },
      { name: "bebidas", description: "Bebidas frías o calientes" },
      { name: "bebidas frias", description: "Bebidas frías y refrescantes" },
      { name: "bebes", description: "Productos para bebés" },
      { name: "botanas", description: "Botanas y antojos" },
      { name: "cafe", description: "Café y bebidas calientes" },
      { name: "cafeteria", description: "Bebidas y snacks" },
      { name: "carnes", description: "Carnes frescas y productos cárnicos" },
      { name: "combos", description: "Promociones y combos" },
      { name: "comida corrida", description: "Comida corrida y menús del día" },
      { name: "complementos", description: "Complementos y acompañamientos" },
      { name: "congelados", description: "Productos congelados y refrigerados" },
      { name: "cuidado personal", description: "Cuidado personal y belleza" },
      { name: "desayunos", description: "Desayunos y brunch" },
      { name: "detalles", description: "Detalles y obsequios" },
      { name: "entradas", description: "Entradas y aperitivos" },
      { name: "farmacia", description: "Medicamentos y productos de farmacia" },
      { name: "farmacia basica", description: "Productos básicos de farmacia" },
      { name: "flores", description: "Flores y arreglos" },
      { name: "frutas", description: "Frutas frescas y de temporada" },
      { name: "globos", description: "Globos y decoración" },
      { name: "hamburguesas", description: "Productos tipo hamburguesa" },
      { name: "higiene personal", description: "Higiene y cuidado diario" },
      { name: "lacteos", description: "Leche, quesos, yogurt y derivados" },
      { name: "limpieza", description: "Productos de limpieza para el hogar" },
      { name: "mascotas", description: "Productos para mascotas" },
      { name: "medicamentos", description: "Medicamentos y tratamiento general" },
      { name: "organicos", description: "Productos orgánicos y naturales" },
      { name: "panaderia", description: "Pan fresco y productos de panadería" },
      { name: "papas", description: "Papas, aros y acompañamientos" },
      { name: "pizzas", description: "Productos tipo pizza" },
      { name: "platillos", description: "Platillos fuertes y especialidades" },
      { name: "postres", description: "Pasteles, pays y dulces" },
      { name: "primeros auxilios", description: "Curación y primeros auxilios" },
      { name: "regalos", description: "Regalos y obsequios" },
      { name: "restaurante", description: "Venta de comida preparada" },
      { name: "snacks", description: "Botanas y acompañamientos" },
      { name: "supermercado", description: "Abarrotes y productos básicos" },
      { name: "verduras", description: "Verduras frescas y de temporada" },
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
