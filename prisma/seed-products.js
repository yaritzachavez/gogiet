const CLOUDINARY_BASE = "https://res.cloudinary.com/demo/image/upload";

const IMAGE_POOLS = {
  restaurante: [
    `${CLOUDINARY_BASE}/samples/food/spices`,
    `${CLOUDINARY_BASE}/samples/food/fish-vegetables`,
    `${CLOUDINARY_BASE}/samples/food/dessert`,
    `${CLOUDINARY_BASE}/samples/food/pot-mussels`,
    `${CLOUDINARY_BASE}/sample`,
  ],
  supermercado: [
    `${CLOUDINARY_BASE}/samples/ecommerce/accessories-bag`,
    `${CLOUDINARY_BASE}/samples/ecommerce/leather-bag-gray`,
    `${CLOUDINARY_BASE}/samples/ecommerce/analog-classic`,
    `${CLOUDINARY_BASE}/samples/ecommerce/shoes`,
    `${CLOUDINARY_BASE}/samples/coffee`,
  ],
  farmacia: [
    `${CLOUDINARY_BASE}/samples/people/bicycle`,
    `${CLOUDINARY_BASE}/samples/animals/reindeer`,
    `${CLOUDINARY_BASE}/samples/cloudinary-group`,
    `${CLOUDINARY_BASE}/sample`,
    `${CLOUDINARY_BASE}/samples/landscapes/nature-mountains`,
  ],
  regalos: [
    `${CLOUDINARY_BASE}/samples/ecommerce/accessories-bag`,
    `${CLOUDINARY_BASE}/samples/ecommerce/leather-bag-gray`,
    `${CLOUDINARY_BASE}/samples/balloons`,
    `${CLOUDINARY_BASE}/samples/people/jazz`,
    `${CLOUDINARY_BASE}/sample`,
  ],
};

const PRODUCT_CATALOGS = {
  restaurante: [
    { name: "Hamburguesa BBQ", categoryName: "hamburguesas", price: 189, discountPrice: 159, stock: 30, badge: "Mas vendido", description: "Carne al carbon, tocino crujiente, aros de cebolla y salsa BBQ." },
    { name: "Hamburguesa doble queso", categoryName: "hamburguesas", price: 179, stock: 26, description: "Doble carne, cheddar fundido, pepinillos y mayonesa de la casa." },
    { name: "Pizza Pepperoni", categoryName: "pizzas", price: 229, discountPrice: 199, stock: 18, badge: "Mas vendido", description: "Pizza familiar con pepperoni premium y mezcla de quesos." },
    { name: "Pizza Hawaiana", categoryName: "pizzas", price: 239, stock: 16, description: "Jamon de pavo, pina dorada y queso mozzarella." },
    { name: "Sushi Roll California", categoryName: "platillos", price: 165, stock: 20, badge: "Nuevo", description: "Rollo fresco con kanikama, pepino, aguacate y ajonjoli." },
    { name: "Sushi Roll spicy tuna", categoryName: "platillos", price: 179, stock: 18, description: "Atun picante con topping de cebollin y salsa especial." },
    { name: "Tacos al pastor", categoryName: "platillos", price: 99, stock: 32, badge: "Mas vendido", description: "Orden de cinco tacos con pastor, pina y salsa verde." },
    { name: "Tacos de bistec", categoryName: "platillos", price: 109, stock: 28, description: "Orden de cinco tacos con bistec, cebolla y cilantro." },
    { name: "Boneless buffalo", categoryName: "platillos", price: 149, stock: 22, description: "Boneless dorados con salsa buffalo y aderezo ranch." },
    { name: "Burrito norteño", categoryName: "platillos", price: 139, stock: 21, description: "Tortilla grande con arrachera, frijoles y queso gratinado." },
    { name: "Hot Dog Sonora", categoryName: "hamburguesas", price: 89, stock: 24, description: "Salchicha jumbo con tocino, frijoles y vegetales frescos." },
    { name: "Ensalada Cesar", categoryName: "platillos", price: 125, stock: 17, badge: "Nuevo", description: "Lechuga romana, pollo a la plancha, crutones y parmesano." },
    { name: "Pasta Alfredo", categoryName: "platillos", price: 159, stock: 19, description: "Pasta cremosa con pollo, champinones y parmesano." },
    { name: "Ramen de cerdo", categoryName: "platillos", price: 179, stock: 15, description: "Caldo profundo con noodles, pork belly y huevo marinado." },
    { name: "Alitas mango habanero", categoryName: "platillos", price: 169, stock: 21, description: "Doce alitas glaseadas con un toque picosito y dulce." },
    { name: "Papas gajo", categoryName: "papas", price: 79, stock: 35, description: "Papas sazonadas al horno con dip de chipotle." },
    { name: "Aros de cebolla", categoryName: "complementos", price: 69, stock: 33, description: "Aros crujientes con empanizado dorado y aderezo." },
    { name: "Nachos supremos", categoryName: "entradas", price: 129, stock: 18, description: "Totopos con queso, frijol, jalapeno y carne sazonada." },
    { name: "Dedos de queso", categoryName: "entradas", price: 99, stock: 24, description: "Orden de seis dedos de mozzarella con salsa marinara." },
    { name: "Combo burger clasica", categoryName: "combos", price: 229, discountPrice: 205, stock: 20, badge: "Mas vendido", description: "Hamburguesa, papas y refresco de 600 ml." },
    { name: "Combo pizza personal", categoryName: "combos", price: 199, stock: 18, description: "Pizza personal pepperoni, dip y bebida." },
    { name: "Limonada mineral", categoryName: "bebidas", price: 45, stock: 40, description: "Limonada burbujeante con hojas de menta." },
    { name: "Refresco 600 ml", categoryName: "bebidas", price: 35, stock: 45, description: "Refresco helado en presentacion de 600 ml." },
    { name: "Te helado de durazno", categoryName: "bebidas", price: 49, stock: 28, description: "Te helado artesanal con durazno natural." },
    { name: "Malteada de vainilla", categoryName: "postres", price: 79, stock: 25, description: "Malteada cremosa con helado de vainilla." },
    { name: "Brownie con helado", categoryName: "postres", price: 89, stock: 22, badge: "Mas vendido", description: "Brownie tibio con helado de vainilla y fudge." },
    { name: "Churros rellenos", categoryName: "postres", price: 75, stock: 20, description: "Churros azucarados rellenos de cajeta." },
    { name: "Chilaquiles rojos", categoryName: "desayunos", price: 119, stock: 16, description: "Totopos con salsa roja, crema, queso y huevo." },
    { name: "Molletes gratinados", categoryName: "desayunos", price: 109, stock: 16, description: "Pan artesanal con frijoles, pico de gallo y queso." },
    { name: "Sopa del dia", categoryName: "comida corrida", price: 69, stock: 14, badge: "Nuevo", description: "Sopa casera recien preparada con ingredientes frescos." },
  ],
  supermercado: [
    { name: "Coca Cola 600 ml", categoryName: "bebidas", price: 22, stock: 90, badge: "Mas vendido", description: "Refresco clasico bien frio para cualquier comida." },
    { name: "Leche Lala entera 1L", categoryName: "lacteos", price: 31, stock: 70, description: "Leche pasteurizada para desayuno y cocina diaria." },
    { name: "Pan Bimbo blanco", categoryName: "abarrotes", price: 49, stock: 38, description: "Pan de caja suave y fresco en presentacion familiar." },
    { name: "Sabritas original 45 g", categoryName: "botanas", price: 21, stock: 65, description: "Papas clasicas para antojo rapido." },
    { name: "Huevo rojo 12 pzas", categoryName: "abarrotes", price: 47, stock: 40, badge: "Mas vendido", description: "Docena de huevo fresco para tu despensa." },
    { name: "Atun Dolores en agua", categoryName: "abarrotes", price: 28, stock: 50, description: "Lata practica para ensaladas y comidas ligeras." },
    { name: "Shampoo Pantene 400 ml", categoryName: "limpieza", price: 98, discountPrice: 84, stock: 28, description: "Limpieza y brillo para uso diario." },
    { name: "Papel higienico Regio 4 rollos", categoryName: "limpieza", price: 56, stock: 34, description: "Papel suave y rendidor para el hogar." },
    { name: "Agua Ciel 1.5 L", categoryName: "bebidas", price: 19, stock: 95, description: "Agua natural purificada para el dia a dia." },
    { name: "Galletas Oreo 154 g", categoryName: "snacks", price: 28, stock: 44, description: "Galletas rellenas ideales para compartir." },
    { name: "Arroz SOS 900 g", categoryName: "abarrotes", price: 39, stock: 36, description: "Arroz de grano largo de coccion uniforme." },
    { name: "Frijol negro 1 kg", categoryName: "abarrotes", price: 44, stock: 33, description: "Frijol seleccionado para guisos y olla de casa." },
    { name: "Aceite vegetal 900 ml", categoryName: "abarrotes", price: 58, stock: 31, description: "Aceite multiuso para freir y cocinar." },
    { name: "Pechuga de pollo 500 g", categoryName: "carnes", price: 87, stock: 22, badge: "Nuevo", description: "Corte fresco y practico para tus recetas." },
    { name: "Manzana roja por kg", categoryName: "frutas", price: 42, stock: 25, description: "Manzana firme y dulce de temporada." },
    { name: "Platano Chiapas por kg", categoryName: "frutas", price: 28, stock: 29, description: "Platano maduro ideal para lunch y smoothies." },
    { name: "Tomate saladet por kg", categoryName: "verduras", price: 34, stock: 26, description: "Tomate fresco para ensaladas y guisos." },
    { name: "Cebolla blanca por kg", categoryName: "verduras", price: 29, stock: 27, description: "Basico de cocina con buen rendimiento." },
    { name: "Queso panela 400 g", categoryName: "lacteos", price: 68, stock: 24, description: "Queso fresco de textura suave y ligera." },
    { name: "Yogurt natural 900 g", categoryName: "lacteos", price: 49, stock: 22, description: "Yogurt cremoso ideal para desayunos." },
    { name: "Helado de vainilla 1L", categoryName: "congelados", price: 79, stock: 18, description: "Helado clasico para postres y antojos." },
    { name: "Nuggets de pollo 500 g", categoryName: "congelados", price: 92, stock: 20, description: "Congelado listo para freidora o horno." },
    { name: "Detergente Ariel 850 g", categoryName: "limpieza", price: 55, stock: 30, badge: "Mas vendido", description: "Detergente en polvo para ropa blanca y de color." },
    { name: "Cloro Cloralex 950 ml", categoryName: "limpieza", price: 24, stock: 37, description: "Desinfectante esencial para el hogar." },
    { name: "Croquetas perro adulto 2 kg", categoryName: "mascotas", price: 129, stock: 16, description: "Alimento balanceado para perro adulto." },
    { name: "Arena para gato 5 kg", categoryName: "mascotas", price: 119, stock: 15, description: "Arena absorbente con control de olor." },
    { name: "Vitamina C efervescente", categoryName: "farmacia basica", price: 76, stock: 14, description: "Suplemento practico para la rutina diaria." },
    { name: "Cereal Zucaritas 730 g", categoryName: "abarrotes", price: 88, stock: 19, description: "Cereal crocante para desayunos completos." },
    { name: "Jamon de pavo 250 g", categoryName: "carnes", price: 52, stock: 21, description: "Rebanado listo para sandwiches y lunch." },
    { name: "Topo Chico 600 ml", categoryName: "bebidas", price: 26, stock: 33, badge: "Nuevo", description: "Agua mineral con burbuja intensa y refrescante." },
  ],
  farmacia: [
    { name: "Paracetamol 500 mg", categoryName: "medicamentos", price: 39, stock: 45, badge: "Mas vendido", description: "Tabletas para alivio de dolor y fiebre." },
    { name: "Ibuprofeno 400 mg", categoryName: "medicamentos", price: 49, stock: 40, description: "Antiinflamatorio de uso comun para malestar." },
    { name: "Vitamina C 1 g", categoryName: "medicamentos", price: 85, discountPrice: 72, stock: 24, description: "Suplemento efervescente para apoyo diario." },
    { name: "Curitas 20 pzas", categoryName: "primeros auxilios", price: 32, stock: 50, description: "Curacion rapida para cortadas pequenas." },
    { name: "Alcohol antiseptico 250 ml", categoryName: "primeros auxilios", price: 28, stock: 38, description: "Antiseptico esencial para limpieza de heridas." },
    { name: "Jarabe para tos", categoryName: "medicamentos", price: 96, stock: 22, description: "Jarabe calmante para garganta y tos seca." },
    { name: "Termometro digital", categoryName: "primeros auxilios", price: 149, stock: 18, badge: "Nuevo", description: "Lectura rapida y facil para casa." },
    { name: "Gel antibacterial 250 ml", categoryName: "higiene personal", price: 34, stock: 41, description: "Limpieza practica sin enjuague." },
    { name: "Omeprazol 20 mg", categoryName: "medicamentos", price: 68, stock: 26, description: "Capsulas para malestar estomacal frecuente." },
    { name: "Loratadina 10 mg", categoryName: "medicamentos", price: 57, stock: 28, description: "Alivio para sintomas comunes de alergia." },
    { name: "Aspirina protect", categoryName: "medicamentos", price: 74, stock: 21, description: "Tabletas en presentacion practica." },
    { name: "VapoRub ungueento", categoryName: "cuidado personal", price: 63, stock: 25, badge: "Mas vendido", description: "Ungueento reconfortante para noches frias." },
    { name: "Sales de rehidratacion", categoryName: "medicamentos", price: 29, stock: 34, description: "Solucion practica para hidratacion." },
    { name: "Gasas esteriles", categoryName: "primeros auxilios", price: 27, stock: 35, description: "Gasas esteriles para curacion y limpieza." },
    { name: "Cinta micropore", categoryName: "primeros auxilios", price: 31, stock: 28, description: "Cinta suave para fijacion de curaciones." },
    { name: "Agua oxigenada 100 ml", categoryName: "primeros auxilios", price: 24, stock: 31, description: "Solucion basica para el botiquin." },
    { name: "Crema de arnica", categoryName: "cuidado personal", price: 77, stock: 19, description: "Crema de masaje con sensacion fresca." },
    { name: "Pomada antibiotica", categoryName: "primeros auxilios", price: 69, stock: 18, description: "Apoyo topico para cuidado de la piel." },
    { name: "Suero fisiologico", categoryName: "primeros auxilios", price: 36, stock: 24, description: "Solucion util para limpieza y cuidado." },
    { name: "Pastillas para garganta", categoryName: "medicamentos", price: 42, stock: 37, description: "Caramelos balsamicos de alivio suave." },
    { name: "Toallitas humedas bebe", categoryName: "bebes", price: 53, stock: 20, description: "Toallitas suaves para piel sensible." },
    { name: "Panales etapa 4", categoryName: "bebes", price: 189, stock: 14, description: "Paquete practico para uso diario." },
    { name: "Protector solar FPS 50", categoryName: "cuidado personal", price: 159, stock: 12, description: "Proteccion alta para rostro y cuerpo." },
    { name: "Shampoo baby", categoryName: "bebes", price: 72, stock: 16, description: "Formula suave para el bano diario." },
    { name: "Jabon antibacterial", categoryName: "higiene personal", price: 34, stock: 29, description: "Jabon de uso diario con limpieza profunda." },
    { name: "Cepillo dental suave", categoryName: "higiene personal", price: 26, stock: 40, description: "Cepillo ergonomico de cerdas suaves." },
    { name: "Pasta dental triple accion", categoryName: "higiene personal", price: 39, stock: 36, badge: "Mas vendido", description: "Proteccion integral para tu sonrisa." },
    { name: "Preservativos 3 pack", categoryName: "cuidado personal", price: 68, stock: 18, description: "Presentacion discreta y segura." },
    { name: "Multivitaminico diario", categoryName: "medicamentos", price: 129, stock: 17, description: "Suplemento completo para rutina diaria." },
    { name: "Monitor de presion compacto", categoryName: "cuidado personal", price: 549, stock: 8, badge: "Nuevo", description: "Equipo digital practico para monitoreo en casa." },
  ],
  regalos: [
    { name: "Peluche abrazo grande", categoryName: "regalos", price: 249, stock: 18, badge: "Mas vendido", description: "Peluche suave en tamano ideal para sorprender." },
    { name: "Taza personalizada", categoryName: "detalles", price: 139, stock: 20, description: "Taza ceramica con mensaje especial y acabado premium." },
    { name: "Set de globos cromados", categoryName: "globos", price: 129, stock: 16, description: "Kit de globos elegantes para celebracion." },
    { name: "Ramo de flores pastel", categoryName: "flores", price: 289, stock: 10, badge: "Mas vendido", description: "Arreglo floral delicado en tonos pastel." },
    { name: "Caja de chocolates", categoryName: "regalos", price: 179, stock: 22, description: "Seleccion de chocolates finos lista para regalar." },
    { name: "Carta decorativa", categoryName: "detalles", price: 79, stock: 30, description: "Carta escrita a mano con diseno artesanal." },
    { name: "Caja sorpresa deluxe", categoryName: "regalos", price: 399, discountPrice: 349, stock: 12, badge: "Nuevo", description: "Caja completa con dulces, globo y detalle especial." },
    { name: "Vela aromatica premium", categoryName: "accesorios", price: 159, stock: 18, description: "Aroma suave con envase elegante para decorar." },
    { name: "Marco de fotos dorado", categoryName: "accesorios", price: 169, stock: 15, description: "Marco decorativo para tu recuerdo favorito." },
    { name: "Llaveros de pareja", categoryName: "detalles", price: 119, stock: 24, description: "Set de llaveros con grabado especial." },
    { name: "Bouquet mini rosas", categoryName: "flores", price: 219, stock: 11, description: "Ramo compacto ideal para sorpresa espontanea." },
    { name: "Globo feliz cumple", categoryName: "globos", price: 89, stock: 19, description: "Globo metalico para celebraciones memorables." },
    { name: "Desayuno sorpresa", categoryName: "regalos", price: 459, stock: 9, badge: "Mas vendido", description: "Caja con cafe, pan dulce, fruta y detalles." },
    { name: "Album de recuerdos", categoryName: "accesorios", price: 199, stock: 14, description: "Album con hojas gruesas para fotos y notas." },
    { name: "Cojin personalizado", categoryName: "regalos", price: 229, stock: 13, description: "Cojin suave con frase o nombre especial." },
    { name: "Set spa regalo", categoryName: "regalos", price: 319, stock: 10, description: "Kit con jabon, vela y sales aromaticas." },
    { name: "Ramo de girasoles", categoryName: "flores", price: 329, stock: 8, description: "Arreglo vibrante y luminoso para cualquier ocasion." },
    { name: "Chocolates premium", categoryName: "regalos", price: 209, stock: 17, description: "Caja con seleccion gourmet envuelta para regalo." },
    { name: "Tarjeta pop-up", categoryName: "detalles", price: 95, stock: 28, description: "Tarjeta con ilustracion en relieve al abrir." },
    { name: "Caja de macarons", categoryName: "regalos", price: 189, stock: 12, badge: "Nuevo", description: "Seis macarons artesanales en caja elegante." },
    { name: "Set de velas romanticas", categoryName: "accesorios", price: 149, stock: 16, description: "Set de velas decorativas para ambientar." },
    { name: "Oso con rosas", categoryName: "regalos", price: 379, stock: 7, description: "Figura decorativa con rosas sinteticas premium." },
    { name: "Mini bocina regalo", categoryName: "accesorios", price: 299, stock: 11, description: "Bocina compacta ideal para regalar en pareja." },
    { name: "Pulsera grabada", categoryName: "detalles", price: 189, stock: 13, description: "Pulsera fina con mensaje grabado." },
    { name: "Kit de globos fiesta", categoryName: "globos", price: 149, stock: 18, description: "Kit completo para decorar una celebracion especial." },
    { name: "Taza te quiero", categoryName: "detalles", price: 149, stock: 20, description: "Taza lista para sorprender con mensaje romantico." },
    { name: "Suculenta decorativa", categoryName: "accesorios", price: 129, stock: 15, description: "Planta pequeña en maceta minimalista." },
    { name: "Set de stickers cute", categoryName: "accesorios", price: 69, stock: 26, description: "Set decorativo para cartas, journals y regalos." },
    { name: "Bolsa regalo elegante", categoryName: "accesorios", price: 59, stock: 30, description: "Bolsa premium con liston y acabado satinado." },
    { name: "Caja aniversario", categoryName: "regalos", price: 429, stock: 9, badge: "Mas vendido", description: "Caja tematica con chocolates, tarjeta y detalle premium." },
  ],
};

function slugify(value) {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function getCatalogKey(businessName, categoryNames) {
  const normalizedName = slugify(businessName);
  const normalizedCategories = categoryNames.map(slugify);

  if (
    normalizedCategories.some((category) =>
      ["regalos"].includes(category),
    ) ||
    normalizedName.includes("store") ||
    normalizedName.includes("regalo")
  ) {
    return "regalos";
  }

  if (
    normalizedCategories.some((category) =>
      ["farmacia"].includes(category),
    ) ||
    normalizedName.includes("farmacia")
  ) {
    return "farmacia";
  }

  if (
    normalizedCategories.some((category) =>
      ["supermercado", "abarrotes"].includes(category),
    ) ||
    normalizedName.includes("super")
  ) {
    return "supermercado";
  }

  if (
    normalizedCategories.some((category) =>
      [
        "restaurante",
        "hamburguesas",
        "pizza",
        "tacos",
        "sushi",
        "cafe-y-postres",
      ].includes(category),
    ) ||
    normalizedName.includes("comida") ||
    normalizedName.includes("food")
  ) {
    return "restaurante";
  }

  return null;
}

function formatDescription(product) {
  const labels = [];

  if (product.badge === "Mas vendido") {
    labels.push("Mas vendido");
  }

  if (product.badge === "Nuevo") {
    labels.push("Nuevo");
  }

  return labels.length > 0
    ? `${labels.join(" · ")}. ${product.description}`
    : product.description;
}

async function ensureProductCategories(prisma) {
  const categoryNames = Array.from(
    new Set(
      Object.values(PRODUCT_CATALOGS).flatMap((products) =>
        products.map((product) => product.categoryName),
      ),
    ),
  );

  await prisma.product_categories.createMany({
    data: categoryNames.map((name) => ({
      name,
      description: `Categoria demo para ${name}`,
    })),
    skipDuplicates: true,
  });

  const categories = await prisma.product_categories.findMany({
    where: { name: { in: categoryNames } },
    select: { id: true, name: true },
  });

  return new Map(categories.map((category) => [category.name, category.id]));
}

async function seedProductsForBusiness(
  prisma,
  business,
  catalogKey,
  activeStatusId,
  productCategoryByName,
) {
  const products = PRODUCT_CATALOGS[catalogKey];
  const imagePool = IMAGE_POOLS[catalogKey];
  let createdCount = 0;
  let updatedCount = 0;

  for (const [index, product] of products.entries()) {
    const sku = `${catalogKey.toUpperCase()}-${String(business.id).padStart(3, "0")}-${String(index + 1).padStart(3, "0")}`;
    const imageUrl = imagePool[index % imagePool.length];
    const existingProduct = await prisma.products.findUnique({
      where: { sku },
      select: { id: true },
    });

    const savedProduct = existingProduct
      ? await prisma.products.update({
          where: { sku },
          data: {
            business_id: business.id,
            name: product.name,
            description_short: formatDescription(product),
            description_long: `${product.description} Disponible para entrega rapida en Gogi Eats.`,
            price: product.price,
            discount_price: product.discountPrice ?? null,
            sale_format: "UNIDAD",
            thumbnail_url: imageUrl,
            is_stock_available: true,
            stock_average: product.stock,
            stock_danger: Math.max(3, Math.floor(product.stock * 0.2)),
            status_id: activeStatusId,
          },
          select: { id: true },
        })
      : await prisma.products.create({
          data: {
            business_id: business.id,
            sku,
            name: product.name,
            description_short: formatDescription(product),
            description_long: `${product.description} Disponible para entrega rapida en Gogi Eats.`,
            price: product.price,
            discount_price: product.discountPrice ?? null,
            sale_format: "UNIDAD",
            thumbnail_url: imageUrl,
            is_stock_available: true,
            stock_average: product.stock,
            stock_danger: Math.max(3, Math.floor(product.stock * 0.2)),
            status_id: activeStatusId,
          },
          select: { id: true },
        });

    if (existingProduct) {
      updatedCount += 1;
    } else {
      createdCount += 1;
    }

    const categoryId = productCategoryByName.get(product.categoryName);
    if (categoryId) {
      await prisma.product_category_map.upsert({
        where: {
          product_id_category_id: {
            product_id: savedProduct.id,
            category_id: categoryId,
          },
        },
        update: {},
        create: {
          product_id: savedProduct.id,
          category_id: categoryId,
        },
      });
    }

    const primaryImage = await prisma.product_images.findFirst({
      where: { product_id: savedProduct.id, sort_order: 1 },
      select: { id: true },
    });

    if (primaryImage) {
      await prisma.product_images.update({
        where: { id: primaryImage.id },
        data: {
          image_url: imageUrl,
          alt_text: product.name,
          is_primary: true,
        },
      });
    } else {
      await prisma.product_images.create({
        data: {
          product_id: savedProduct.id,
          image_url: imageUrl,
          alt_text: product.name,
          sort_order: 1,
          is_primary: true,
        },
      });
    }
  }

  return { createdCount, updatedCount, total: products.length };
}

async function seedMarketplaceProducts(prisma, activeStatusId) {
  const productCategoryByName = await ensureProductCategories(prisma);
  const businesses = await prisma.business.findMany({
    include: {
      business_category_map: {
        include: {
          business_categories: {
            select: { name: true },
          },
        },
      },
    },
    orderBy: { id: "asc" },
  });

  const summary = [];

  for (const business of businesses) {
    const categoryNames = business.business_category_map.map(
      (item) => item.business_categories.name,
    );
    const catalogKey = getCatalogKey(business.name, categoryNames);

    if (!catalogKey) {
      continue;
    }

    const result = await seedProductsForBusiness(
      prisma,
      business,
      catalogKey,
      activeStatusId,
      productCategoryByName,
    );

    summary.push({
      businessName: business.name,
      catalogKey,
      ...result,
    });
  }

  return summary;
}

module.exports = {
  PRODUCT_CATALOGS,
  seedMarketplaceProducts,
};
