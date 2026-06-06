#!/usr/bin/env node

const bcrypt = require("bcrypt");

const {
  assertSafeWriteTarget,
  buildSanitizedDbOperationSummary,
} = require("./lib/db-write-guard");
const {
  STAGING_QA_FIXTURES,
  STAGING_QA_TAG,
  buildStagingQaManifest,
} = require("./lib/staging-qa-fixtures");
const { prisma } = require("./prisma-runtime");

const WRITE_OPERATION = "scripts/seed-staging-qa.js --write";

function getCliArgs(argv = process.argv.slice(2)) {
  return {
    write: argv.includes("--write"),
  };
}

function buildDryRunPreview(env = process.env) {
  return {
    mode: "dry-run",
    operation: WRITE_OPERATION,
    guard: buildSanitizedDbOperationSummary({
      operation: WRITE_OPERATION,
      mode: "read",
      env,
    }),
    manifest: buildStagingQaManifest(),
    writesExecuted: false,
  };
}

async function getRequiredStatusId(statusName) {
  const status = await prisma.status_catalog.findUnique({
    where: {
      name: statusName,
    },
    select: {
      id: true,
    },
  });

  if (!status) {
    throw new Error(
      `Missing required status_catalog row: ${statusName}. Run the base seed before the QA staging seed.`,
    );
  }

  return status.id;
}

async function getRequiredRoleIds(roleNames) {
  const rows = await prisma.roles.findMany({
    where: {
      name: {
        in: roleNames,
      },
    },
    select: {
      id: true,
      name: true,
    },
  });

  const roleMap = new Map(rows.map((row) => [row.name, row.id]));

  for (const roleName of roleNames) {
    if (!roleMap.has(roleName)) {
      throw new Error(
        `Missing required role: ${roleName}. Run the base seed before the QA staging seed.`,
      );
    }
  }

  return roleMap;
}

async function upsertUser({ fixture, activeStatusId, passwordHash, roleIds }) {
  const user = await prisma.user.upsert({
    where: {
      email: fixture.email,
    },
    update: {
      firstName: fixture.firstName,
      lastName: fixture.lastName,
      phone: fixture.phone,
      password: passwordHash,
      emailVerified: true,
      statusId: activeStatusId,
      notes: STAGING_QA_TAG,
    },
    create: {
      firstName: fixture.firstName,
      lastName: fixture.lastName,
      email: fixture.email,
      phone: fixture.phone,
      password: passwordHash,
      emailVerified: true,
      statusId: activeStatusId,
      notes: STAGING_QA_TAG,
    },
    select: {
      id: true,
      email: true,
    },
  });

  for (const roleName of fixture.roles) {
    await prisma.user_roles.upsert({
      where: {
        user_id_role_id: {
          user_id: user.id,
          role_id: roleIds.get(roleName),
        },
      },
      update: {},
      create: {
        user_id: user.id,
        role_id: roleIds.get(roleName),
      },
    });
  }

  return user;
}

async function upsertBusiness({
  fixture,
  ownerUserId,
  sellerUserId,
  activeStatusId,
}) {
  const existingBusiness = await prisma.business.findFirst({
    where: {
      name: fixture.name,
      email: fixture.email,
    },
    select: {
      id: true,
    },
  });

  const business = existingBusiness
    ? await prisma.business.update({
        where: {
          id: existingBusiness.id,
        },
        data: {
          name: fixture.name,
          city: fixture.city,
          district: fixture.district,
          address: fixture.address,
          phone: fixture.phone,
          email: fixture.email,
          status_id: activeStatusId,
          address_notes: fixture.notes,
        },
        select: {
          id: true,
          name: true,
        },
      })
    : await prisma.business.create({
        data: {
          name: fixture.name,
          city: fixture.city,
          district: fixture.district,
          address: fixture.address,
          phone: fixture.phone,
          email: fixture.email,
          status_id: activeStatusId,
          address_notes: fixture.notes,
        },
        select: {
          id: true,
          name: true,
        },
      });

  await prisma.business_owners.upsert({
    where: {
      business_id_user_id: {
        business_id: business.id,
        user_id: ownerUserId,
      },
    },
    update: {
      notes: STAGING_QA_TAG,
    },
    create: {
      business_id: business.id,
      user_id: ownerUserId,
      notes: STAGING_QA_TAG,
    },
  });

  await prisma.business_managers.upsert({
    where: {
      business_id_user_id: {
        business_id: business.id,
        user_id: sellerUserId,
      },
    },
    update: {
      position: "QA Seller",
      is_active: true,
    },
    create: {
      business_id: business.id,
      user_id: sellerUserId,
      position: "QA Seller",
      is_active: true,
    },
  });

  return business;
}

async function upsertProduct({ businessId, activeStatusId }) {
  const fixture = STAGING_QA_FIXTURES.product;

  return prisma.products.upsert({
    where: {
      sku: fixture.sku,
    },
    update: {
      business_id: businessId,
      name: fixture.name,
      description_short: fixture.descriptionShort,
      price: fixture.price,
      status_id: activeStatusId,
      thumbnail_url: fixture.thumbnailUrl,
    },
    create: {
      business_id: businessId,
      name: fixture.name,
      sku: fixture.sku,
      description_short: fixture.descriptionShort,
      price: fixture.price,
      status_id: activeStatusId,
      thumbnail_url: fixture.thumbnailUrl,
    },
    select: {
      id: true,
      sku: true,
    },
  });
}

async function upsertShippingZone() {
  const fixture = STAGING_QA_FIXTURES.shippingZone;

  return prisma.shipping_zones.upsert({
    where: {
      nombre: fixture.nombre,
    },
    update: {
      tipo: fixture.tipo,
      distancia_km: fixture.distanciaKm,
      activo: true,
    },
    create: {
      nombre: fixture.nombre,
      tipo: fixture.tipo,
      distancia_km: fixture.distanciaKm,
      activo: true,
    },
    select: {
      id: true,
      nombre: true,
    },
  });
}

async function upsertAddress({ userId, activeStatusId }) {
  const fixture = STAGING_QA_FIXTURES.address;
  const existingAddress = await prisma.addresses.findFirst({
    where: {
      user_id: userId,
      label: fixture.label,
      street: fixture.street,
    },
    select: {
      id: true,
    },
  });

  return existingAddress
    ? prisma.addresses.update({
        where: {
          id: existingAddress.id,
        },
        data: {
          recipient_name: fixture.recipientName,
          phone: fixture.phone,
          neighborhood: fixture.neighborhood,
          city: fixture.city,
          state: fixture.state,
          postal_code: fixture.postalCode,
          reference_notes: fixture.referenceNotes,
          status_id: activeStatusId,
          is_default: true,
        },
        select: {
          id: true,
          label: true,
        },
      })
    : prisma.addresses.create({
        data: {
          user_id: userId,
          label: fixture.label,
          recipient_name: fixture.recipientName,
          phone: fixture.phone,
          street: fixture.street,
          neighborhood: fixture.neighborhood,
          city: fixture.city,
          state: fixture.state,
          postal_code: fixture.postalCode,
          reference_notes: fixture.referenceNotes,
          status_id: activeStatusId,
          is_default: true,
        },
        select: {
          id: true,
          label: true,
        },
      });
}

async function runStagingQaSeed({ env = process.env, write = false } = {}) {
  if (!write) {
    return buildDryRunPreview(env);
  }

  const guard = assertSafeWriteTarget({
    operation: WRITE_OPERATION,
    env,
  });

  const activeStatusId = await getRequiredStatusId("active");
  const roleNames = [
    ...new Set(
      Object.values(STAGING_QA_FIXTURES.users).flatMap((user) => user.roles),
    ),
  ];
  const roleIds = await getRequiredRoleIds(roleNames);
  const saltRounds = Number(env.SALT_ROUNDS || 12);
  const passwordHash = await bcrypt.hash(
    "Qa-Staging-Password-Only",
    saltRounds,
  );

  const users = {};
  for (const fixture of Object.values(STAGING_QA_FIXTURES.users)) {
    users[fixture.key] = await upsertUser({
      fixture,
      activeStatusId,
      passwordHash,
      roleIds,
    });
  }

  const business = await upsertBusiness({
    fixture: STAGING_QA_FIXTURES.business,
    ownerUserId: users.owner.id,
    sellerUserId: users.seller.id,
    activeStatusId,
  });
  const product = await upsertProduct({
    businessId: business.id,
    activeStatusId,
  });
  const shippingZone = await upsertShippingZone();
  const address = await upsertAddress({
    userId: users.customer.id,
    activeStatusId,
  });

  return {
    mode: "write",
    operation: WRITE_OPERATION,
    guard,
    manifest: buildStagingQaManifest(),
    created: {
      users: Object.values(users).map((user) => ({
        id: user.id,
        email: user.email,
      })),
      business,
      product,
      shippingZone,
      address,
    },
    writesExecuted: true,
  };
}

async function main() {
  const { write } = getCliArgs();
  const result = await runStagingQaSeed({
    write,
  });
  console.info(JSON.stringify(result, null, 2));
  if (!write) {
    console.info("STAGING QA SEED DRY RUN ONLY");
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(
      error instanceof Error ? error.stack || error.message : String(error),
    );
    process.exit(1);
  });
}

module.exports = {
  WRITE_OPERATION,
  buildDryRunPreview,
  getCliArgs,
  runStagingQaSeed,
};
