const STAGING_QA_TAG = "QA-STAGING";
const QA_EMAIL_DOMAIN = "gogieats.test";

const STAGING_QA_FIXTURES = {
  users: {
    customer: {
      key: "customer",
      email: `qa.customer@${QA_EMAIL_DOMAIN}`,
      firstName: "QA Cliente",
      lastName: "Staging",
      phone: "5550001001",
      roles: ["cliente"],
    },
    owner: {
      key: "owner",
      email: `qa.owner@${QA_EMAIL_DOMAIN}`,
      firstName: "QA Negocio",
      lastName: "Staging",
      phone: "5550001002",
      roles: ["cliente", "business_admin"],
    },
    seller: {
      key: "seller",
      email: `qa.seller@${QA_EMAIL_DOMAIN}`,
      firstName: "QA Vendedor",
      lastName: "Staging",
      phone: "5550001003",
      roles: ["vendedor", "business_staff"],
    },
    courier: {
      key: "courier",
      email: `qa.courier@${QA_EMAIL_DOMAIN}`,
      firstName: "QA Repartidor",
      lastName: "Staging",
      phone: "5550001004",
      roles: ["repartidor"],
    },
    admin: {
      key: "admin",
      email: `qa.admin@${QA_EMAIL_DOMAIN}`,
      firstName: "QA Admin",
      lastName: "Staging",
      phone: "5550001005",
      roles: ["admin_general"],
    },
  },
  business: {
    name: "QA Staging Market",
    email: `qa.business@${QA_EMAIL_DOMAIN}`,
    phone: "5550001100",
    city: "Mazamitla QA",
    address: "Avenida QA 123",
    district: "Centro QA",
    notes: STAGING_QA_TAG,
  },
  product: {
    sku: "QA-STAGING-BURGER-001",
    name: "Hamburguesa QA Staging",
    descriptionShort: "Producto ficticio para pruebas seguras",
    price: "99.00",
    thumbnailUrl: "https://res.cloudinary.com/demo/image/upload/sample",
  },
  shippingZone: {
    nombre: "QA STAGING ZONE",
    tipo: "zona",
    distanciaKm: "5.00",
  },
  address: {
    label: "Casa QA",
    recipientName: "QA Cliente Staging",
    phone: "5550001001",
    street: "Calle Ficticia 456",
    neighborhood: "Colonia QA",
    city: "Mazamitla QA",
    state: "Jalisco QA",
    postalCode: "49500",
    referenceNotes: STAGING_QA_TAG,
  },
};

function buildStagingQaManifest() {
  return {
    tag: STAGING_QA_TAG,
    users: Object.values(STAGING_QA_FIXTURES.users).map((user) => ({
      key: user.key,
      email: user.email,
      roles: user.roles,
    })),
    business: {
      name: STAGING_QA_FIXTURES.business.name,
      email: STAGING_QA_FIXTURES.business.email,
    },
    product: {
      sku: STAGING_QA_FIXTURES.product.sku,
      name: STAGING_QA_FIXTURES.product.name,
    },
    shippingZone: {
      nombre: STAGING_QA_FIXTURES.shippingZone.nombre,
    },
    address: {
      label: STAGING_QA_FIXTURES.address.label,
      postalCode: STAGING_QA_FIXTURES.address.postalCode,
    },
  };
}

module.exports = {
  QA_EMAIL_DOMAIN,
  STAGING_QA_FIXTURES,
  STAGING_QA_TAG,
  buildStagingQaManifest,
};
