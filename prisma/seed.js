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

const DEMO_BUSINESS_SEEDS = [
  {
    name: "Gogi Comidas",
    city: "Mazamitla",
    district: "Centro",
    address: "Portal Hidalgo 12",
    address_notes: "Frente a la plaza principal",
    phone: "3820001001",
    email: "comidas@gogieats.local",
    logo_url: "/default-business.png",
    cover_image_url: "/default-business.png",
    estimated_delivery_minutes: 28,
    min_order_amount: 120,
    categoryName: "Restaurante",
    description_long: "Comida casera y antojitos listos para entrega.",
    slogan: "Sabor de casa en cada pedido",
    products: [
      {
        sku: "GOGI-COMIDAS-001",
        name: "Comida corrida",
        description_short: "Menú del día con guarniciones",
        price: 95,
        discount_price: 89,
        thumbnail_url: "/placeholder-product.png",
        categoryName: "comida corrida",
      },
      {
        sku: "GOGI-COMIDAS-002",
        name: "Enchiladas rojas",
        description_short: "Orden tradicional con queso y crema",
        price: 110,
        thumbnail_url: "/placeholder-product.png",
        categoryName: "platillos",
      },
      {
        sku: "GOGI-COMIDAS-003",
        name: "Agua fresca",
        description_short: "Sabor natural del día",
        price: 35,
        thumbnail_url: "/placeholder-product.png",
        categoryName: "bebidas",
      },
    ],
  },
  {
    name: "Mini Súper Gogi",
    city: "Mazamitla",
    district: "Barrio Alto",
    address: "Morelos 45",
    address_notes: "A un costado de la capilla",
    phone: "3820001002",
    email: "minisuper@gogieats.local",
    logo_url: "/default-business.png",
    cover_image_url: "/default-business.png",
    estimated_delivery_minutes: 24,
    min_order_amount: 80,
    categoryName: "Supermercado",
    description_long: "Despensa rápida, artículos del hogar y básicos del día.",
    slogan: "Tu despensa cerca de casa",
    products: [
      {
        sku: "GOGI-SUPER-001",
        name: "Canasta de frutas",
        description_short: "Selección fresca de temporada",
        price: 79,
        thumbnail_url: "/placeholder-product.png",
        categoryName: "frutas",
      },
      {
        sku: "GOGI-SUPER-002",
        name: "Leche entera 1L",
        description_short: "Lácteo esencial para tu despensa",
        price: 32,
        thumbnail_url: "/placeholder-product.png",
        categoryName: "lacteos",
      },
      {
        sku: "GOGI-SUPER-003",
        name: "Paquete de limpieza",
        description_short: "Cloro y detergente básicos",
        price: 98,
        thumbnail_url: "/placeholder-product.png",
        categoryName: "limpieza",
      },
    ],
  },
  {
    name: "Dulce Antojo",
    city: "Mazamitla",
    district: "Las Colonias",
    address: "Juárez 88",
    address_notes: "Esquina con mercado",
    phone: "3820001003",
    email: "dulceantojo@gogieats.local",
    logo_url: "/default-business.png",
    cover_image_url: "/default-business.png",
    estimated_delivery_minutes: 20,
    min_order_amount: 70,
    categoryName: "Cafe y postres",
    description_long: "Postres artesanales, café y pan recién horneado.",
    slogan: "Un antojo feliz a cualquier hora",
    products: [
      {
        sku: "GOGI-DULCE-001",
        name: "Cheesecake individual",
        description_short: "Porción cremosa con frutos rojos",
        price: 65,
        thumbnail_url: "/placeholder-product.png",
        categoryName: "postres",
      },
      {
        sku: "GOGI-DULCE-002",
        name: "Café americano",
        description_short: "Café recién molido",
        price: 38,
        thumbnail_url: "/placeholder-product.png",
        categoryName: "cafe",
      },
      {
        sku: "GOGI-DULCE-003",
        name: "Pan dulce surtido",
        description_short: "Selección del día",
        price: 42,
        thumbnail_url: "/placeholder-product.png",
        categoryName: "panaderia",
      },
    ],
  },
  {
    name: "Farmacia Gogi",
    city: "Mazamitla",
    district: "Centro",
    address: "Allende 33",
    address_notes: "Junto a la parada principal",
    phone: "3820001004",
    email: "farmacia@gogieats.local",
    logo_url: "/default-business.png",
    cover_image_url: "/default-business.png",
    estimated_delivery_minutes: 18,
    min_order_amount: 60,
    categoryName: "Farmacia",
    description_long: "Medicamentos, cuidado personal y primeros auxilios.",
    slogan: "Lo esencial cuando más lo necesitas",
    products: [
      {
        sku: "GOGI-FARMA-001",
        name: "Analgésico básico",
        description_short: "Tabletas para dolor común",
        price: 49,
        thumbnail_url: "/placeholder-product.png",
        categoryName: "medicamentos",
      },
      {
        sku: "GOGI-FARMA-002",
        name: "Kit primeros auxilios",
        description_short: "Gasas, cinta y antiséptico",
        price: 129,
        thumbnail_url: "/placeholder-product.png",
        categoryName: "primeros auxilios",
      },
      {
        sku: "GOGI-FARMA-003",
        name: "Jabón neutro",
        description_short: "Higiene personal de uso diario",
        price: 36,
        thumbnail_url: "/placeholder-product.png",
        categoryName: "higiene personal",
      },
    ],
  },
  {
    name: "Regalos Gogi",
    city: "Mazamitla",
    district: "La Cofradía",
    address: "Camino Real 17",
    address_notes: "Frente al jardín vecinal",
    phone: "3820001005",
    email: "regalos@gogieats.local",
    logo_url: "/default-business.png",
    cover_image_url: "/default-business.png",
    estimated_delivery_minutes: 26,
    min_order_amount: 90,
    categoryName: "Regalos",
    description_long: "Detalles, arreglos y regalos para momentos especiales.",
    slogan: "Detalles que sí sorprenden",
    products: [
      {
        sku: "GOGI-REGALOS-001",
        name: "Caja sorpresa",
        description_short: "Detalle listo para regalar",
        price: 149,
        thumbnail_url: "/placeholder-product.png",
        categoryName: "regalos",
      },
      {
        sku: "GOGI-REGALOS-002",
        name: "Bouquet de flores",
        description_short: "Arreglo floral de temporada",
        price: 199,
        thumbnail_url: "/placeholder-product.png",
        categoryName: "flores",
      },
      {
        sku: "GOGI-REGALOS-003",
        name: "Set de globos",
        description_short: "Decoración para celebración",
        price: 89,
        thumbnail_url: "/placeholder-product.png",
        categoryName: "globos",
      },
    ],
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

async function ensureDemoBusinesses(activeStatusId) {
  const businessCategoryNames = Array.from(
    new Set(DEMO_BUSINESS_SEEDS.map((business) => business.categoryName)),
  );
  const productCategoryNames = Array.from(
    new Set(
      DEMO_BUSINESS_SEEDS.flatMap((business) =>
        business.products.map((product) => product.categoryName),
      ),
    ),
  );

  const businessCategories = await prisma.business_categories.findMany({
    where: { name: { in: businessCategoryNames } },
    select: { id: true, name: true },
  });
  const productCategories = await prisma.product_categories.findMany({
    where: { name: { in: productCategoryNames } },
    select: { id: true, name: true },
  });

  const businessCategoryByName = new Map(
    businessCategories.map((category) => [category.name, category.id]),
  );
  const productCategoryByName = new Map(
    productCategories.map((category) => [category.name, category.id]),
  );

  for (const businessSeed of DEMO_BUSINESS_SEEDS) {
    const existingBusiness = await prisma.business.findFirst({
      where: { name: businessSeed.name },
      select: { id: true },
    });

    const business = existingBusiness
      ? await prisma.business.update({
          where: { id: existingBusiness.id },
          data: {
            city: businessSeed.city,
            district: businessSeed.district,
            address: businessSeed.address,
            address_notes: businessSeed.address_notes,
            phone: businessSeed.phone,
            email: businessSeed.email,
            logo_url: businessSeed.logo_url,
            cover_image_url: businessSeed.cover_image_url,
            min_order_amount: businessSeed.min_order_amount,
            estimated_delivery_minutes: businessSeed.estimated_delivery_minutes,
            is_open: true,
            status_id: activeStatusId,
          },
          select: { id: true },
        })
      : await prisma.business.create({
          data: {
            name: businessSeed.name,
            city: businessSeed.city,
            district: businessSeed.district,
            address: businessSeed.address,
            address_notes: businessSeed.address_notes,
            phone: businessSeed.phone,
            email: businessSeed.email,
            logo_url: businessSeed.logo_url,
            cover_image_url: businessSeed.cover_image_url,
            min_order_amount: businessSeed.min_order_amount,
            estimated_delivery_minutes: businessSeed.estimated_delivery_minutes,
            is_open: true,
            status_id: activeStatusId,
          },
          select: { id: true },
        });

    await prisma.business_details.upsert({
      where: { business_id: business.id },
      update: {
        description_long: businessSeed.description_long,
        slogan: businessSeed.slogan,
        accepts_delivery: true,
        accepts_pickup: true,
      },
      create: {
        business_id: business.id,
        description_long: businessSeed.description_long,
        slogan: businessSeed.slogan,
        accepts_delivery: true,
        accepts_pickup: true,
      },
    });

    const businessCategoryId = businessCategoryByName.get(
      businessSeed.categoryName,
    );
    if (businessCategoryId) {
      await prisma.business_category_map.upsert({
        where: {
          business_id_category_id: {
            business_id: business.id,
            category_id: businessCategoryId,
          },
        },
        update: {},
        create: {
          business_id: business.id,
          category_id: businessCategoryId,
        },
      });
    }

    for (const productSeed of businessSeed.products) {
      const product = await prisma.products.upsert({
        where: { sku: productSeed.sku },
        update: {
          business_id: business.id,
          name: productSeed.name,
          description_short: productSeed.description_short,
          price: productSeed.price,
          discount_price: productSeed.discount_price ?? null,
          thumbnail_url: productSeed.thumbnail_url,
          is_stock_available: true,
          stock_average: 25,
          stock_danger: 5,
          status_id: activeStatusId,
        },
        create: {
          business_id: business.id,
          sku: productSeed.sku,
          name: productSeed.name,
          description_short: productSeed.description_short,
          price: productSeed.price,
          discount_price: productSeed.discount_price ?? null,
          thumbnail_url: productSeed.thumbnail_url,
          is_stock_available: true,
          stock_average: 25,
          stock_danger: 5,
          status_id: activeStatusId,
        },
        select: { id: true },
      });

      const productCategoryId = productCategoryByName.get(
        productSeed.categoryName,
      );
      if (productCategoryId) {
        await prisma.product_category_map.upsert({
          where: {
            product_id_category_id: {
              product_id: product.id,
              category_id: productCategoryId,
            },
          },
          update: {},
          create: {
            product_id: product.id,
            category_id: productCategoryId,
          },
        });
      }
    }
  }
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

  const adminEmail = (process.env.ADMIN_INITIAL_EMAIL || "admin@gogieats.local")
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
      {
        name: "congelados",
        description: "Productos congelados y refrigerados",
      },
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
      {
        name: "medicamentos",
        description: "Medicamentos y tratamiento general",
      },
      { name: "organicos", description: "Productos orgánicos y naturales" },
      { name: "panaderia", description: "Pan fresco y productos de panadería" },
      { name: "papas", description: "Papas, aros y acompañamientos" },
      { name: "pizzas", description: "Productos tipo pizza" },
      { name: "platillos", description: "Platillos fuertes y especialidades" },
      { name: "postres", description: "Pasteles, pays y dulces" },
      {
        name: "primeros auxilios",
        description: "Curación y primeros auxilios",
      },
      { name: "regalos", description: "Regalos y obsequios" },
      { name: "restaurante", description: "Venta de comida preparada" },
      { name: "snacks", description: "Botanas y acompañamientos" },
      { name: "supermercado", description: "Abarrotes y productos básicos" },
      { name: "verduras", description: "Verduras frescas y de temporada" },
    ],
    skipDuplicates: true,
  });

  await ensureDemoBusinesses(activeStatus.id);

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
