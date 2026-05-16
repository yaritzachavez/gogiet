import type {
  Pool,
  PoolConnection,
  ResultSetHeader,
  RowDataPacket,
} from "mysql2/promise";

type Queryable = Pool | PoolConnection;

export async function assignBusinessOwnerSafely(
  executor: Queryable,
  businessId: number,
  userId: number,
) {
  const normalizedBusinessId = Number(businessId);
  const normalizedUserId = Number(userId);

  if (
    !Number.isFinite(normalizedBusinessId) ||
    normalizedBusinessId <= 0 ||
    !Number.isFinite(normalizedUserId) ||
    normalizedUserId <= 0
  ) {
    throw new Error(
      "business_id y user_id deben ser validos para asignar dueño",
    );
  }

  const [businessRows] = await executor.query<RowDataPacket[]>(
    `
      SELECT id
      FROM business
      WHERE id = ?
      LIMIT 1
    `,
    [normalizedBusinessId],
  );

  if (!businessRows[0]?.id) {
    throw new Error("Negocio no encontrado");
  }

  const [result] = await executor.query<ResultSetHeader>(
    `
      INSERT IGNORE INTO business_owners (business_id, user_id)
      VALUES (?, ?)
    `,
    [normalizedBusinessId, normalizedUserId],
  );

  return {
    alreadyAssigned: result.affectedRows === 0,
  };
}

export async function syncBusinessOwnerSafely(
  executor: Queryable,
  businessId: number,
  userId: number,
) {
  const normalizedBusinessId = Number(businessId);
  const normalizedUserId = Number(userId);

  if (
    !Number.isFinite(normalizedBusinessId) ||
    normalizedBusinessId <= 0 ||
    !Number.isFinite(normalizedUserId) ||
    normalizedUserId <= 0
  ) {
    throw new Error(
      "business_id y user_id deben ser validos para sincronizar dueño",
    );
  }

  const [userRows] = await executor.query<RowDataPacket[]>(
    `
      SELECT id
      FROM users
      WHERE id = ?
      LIMIT 1
    `,
    [normalizedUserId],
  );

  if (!userRows[0]?.id) {
    throw new Error("Usuario propietario no encontrado");
  }

  const [existingOwnerRows] = await executor.query<RowDataPacket[]>(
    `
      SELECT business_id, user_id
      FROM business_owners
      WHERE business_id = ?
    `,
    [normalizedBusinessId],
  );

  const currentOwnerIds = existingOwnerRows
    .map((row) => Number(row.user_id))
    .filter((ownerId) => Number.isFinite(ownerId) && ownerId > 0);

  const alreadyAssigned =
    currentOwnerIds.length === 1 && currentOwnerIds[0] === normalizedUserId;

  if (currentOwnerIds.length > 0) {
    await executor.query(
      `
        DELETE FROM business_owners
        WHERE business_id = ?
          AND user_id <> ?
      `,
      [normalizedBusinessId, normalizedUserId],
    );
  }

  const assignmentResult = await assignBusinessOwnerSafely(
    executor,
    normalizedBusinessId,
    normalizedUserId,
  );

  return {
    alreadyAssigned: alreadyAssigned || assignmentResult.alreadyAssigned,
    previousOwnerIds: currentOwnerIds.filter(
      (ownerId) => ownerId !== normalizedUserId,
    ),
  };
}
