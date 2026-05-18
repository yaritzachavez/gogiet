const FORBIDDEN_TRANSFER_VALUES = new Set([
  "012345678901234567",
  "0123456789",
  "123456789012345678",
  "1234567890",
  "clabe-aqui",
  "cuenta-aqui",
  "titular-aqui",
  "banco-aqui",
]);

export type TransferAccountConfig = {
  bank: string;
  holder: string;
  clabe: string;
  accountNumber: string | null;
};

function normalizePublicValue(value: string | undefined) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function isForbiddenTransferValue(value: string | null) {
  if (!value) {
    return true;
  }

  return FORBIDDEN_TRANSFER_VALUES.has(value.toLowerCase());
}

export function getTransferAccountConfig(): TransferAccountConfig | null {
  const bank = normalizePublicValue(process.env.NEXT_PUBLIC_TRANSFER_BANK);
  const holder = normalizePublicValue(process.env.NEXT_PUBLIC_TRANSFER_HOLDER);
  const clabe = normalizePublicValue(process.env.NEXT_PUBLIC_TRANSFER_CLABE);
  const accountNumber = normalizePublicValue(
    process.env.NEXT_PUBLIC_TRANSFER_ACCOUNT_NUMBER,
  );

  if (
    !bank ||
    !holder ||
    !clabe ||
    isForbiddenTransferValue(bank) ||
    isForbiddenTransferValue(holder) ||
    isForbiddenTransferValue(clabe)
  ) {
    return null;
  }

  return {
    bank,
    holder,
    clabe,
    accountNumber:
      accountNumber && !isForbiddenTransferValue(accountNumber)
        ? accountNumber
        : null,
  };
}

export function isTransferPaymentEnabled() {
  return getTransferAccountConfig() !== null;
}
