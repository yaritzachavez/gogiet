import type { RowDataPacket } from "mysql2/promise";
import { type NextRequest, NextResponse } from "next/server";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";

import { getAuthUser, isAdminGeneral } from "@/lib/admin-security";
import pool from "@/lib/db";

const COMPLETED_STATUSES = ["entregado", "completado", "completed"];

type BusinessRow = RowDataPacket & {
  id: number;
  name: string;
  city: string | null;
  category_name: string | null;
};

type OrderRow = RowDataPacket & {
  id: number;
  created_at: Date | string;
  delivered_at: Date | string | null;
  subtotal: string | number | null;
  service_fee: string | number | null;
  platform_fee: string | number | null;
  terminal_fee: string | number | null;
  delivery_fee: string | number | null;
  total_amount: string | number | null;
  payment_method: string | null;
  payment_status: string | null;
  payment_amount: string | number | null;
};

type OrderItemRow = RowDataPacket & {
  order_id: number;
  product_name_snapshot: string;
  quantity: number;
  unit_price: string | number | null;
  subtotal: string | number | null;
};

type WeeklyBucket = {
  key: string;
  start: Date;
  end: Date;
  orders: Array<{
    id: number;
    orderDate: Date;
    totalAmount: number;
    subtotal: number;
    deliveryFee: number;
    serviceFee: number;
    platformFee: number;
    terminalFee: number;
    commissionTotal: number;
    paymentMethod: string | null;
    paymentStatus: string | null;
    paymentAmount: number | null;
    items: Array<{
      name: string;
      quantity: number;
      unitPrice: number;
      subtotal: number;
    }>;
  }>;
};

function toNumber(value: string | number | null | undefined) {
  return Number(value ?? 0);
}

function toDate(value: Date | string | null | undefined) {
  if (!value) {
    return null;
  }

  return value instanceof Date ? value : new Date(value);
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("es-MX", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(value);
}

function formatDateTime(value: Date) {
  return new Intl.DateTimeFormat("es-MX", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
}

function slugifyFileName(value: string) {
  const normalized = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || "negocio";
}

function getWeekRange(date: Date) {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);

  const day = start.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  start.setDate(start.getDate() + diff);

  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);

  return { start, end };
}

function buildWeeklyBuckets(
  orders: OrderRow[],
  itemsByOrderId: Map<number, OrderItemRow[]>,
) {
  const weeklyMap = new Map<string, WeeklyBucket>();

  for (const order of orders) {
    const orderDate = toDate(order.delivered_at) ?? toDate(order.created_at);

    if (!orderDate) {
      continue;
    }

    const { start, end } = getWeekRange(orderDate);
    const key = `${start.toISOString()}-${end.toISOString()}`;
    const subtotal = toNumber(order.subtotal);
    const deliveryFee = toNumber(order.delivery_fee);
    const serviceFee = toNumber(order.service_fee);
    const platformFee = toNumber(order.platform_fee);
    const terminalFee = toNumber(order.terminal_fee);
    const totalAmount = toNumber(order.total_amount);
    const commissionTotal = serviceFee + platformFee + terminalFee;

    if (!weeklyMap.has(key)) {
      weeklyMap.set(key, {
        key,
        start,
        end,
        orders: [],
      });
    }

    weeklyMap.get(key)?.orders.push({
      id: Number(order.id),
      orderDate,
      totalAmount,
      subtotal,
      deliveryFee,
      serviceFee,
      platformFee,
      terminalFee,
      commissionTotal,
      paymentMethod: order.payment_method,
      paymentStatus: order.payment_status,
      paymentAmount:
        order.payment_amount === null ? null : toNumber(order.payment_amount),
      items: (itemsByOrderId.get(Number(order.id)) ?? []).map((item) => ({
        name: item.product_name_snapshot,
        quantity: Number(item.quantity ?? 0),
        unitPrice: toNumber(item.unit_price),
        subtotal: toNumber(item.subtotal),
      })),
    });
  }

  return Array.from(weeklyMap.values())
    .sort((a, b) => b.start.getTime() - a.start.getTime())
    .map((bucket) => ({
      ...bucket,
      orders: [...bucket.orders].sort(
        (a, b) => b.orderDate.getTime() - a.orderDate.getTime(),
      ),
    }));
}

function splitTextIntoLines(
  text: string,
  maxWidth: number,
  font: Awaited<ReturnType<PDFDocument["embedFont"]>>,
  fontSize: number,
) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    const nextLine = currentLine ? `${currentLine} ${word}` : word;
    const width = font.widthOfTextAtSize(nextLine, fontSize);

    if (width <= maxWidth || !currentLine) {
      currentLine = nextLine;
      continue;
    }

    lines.push(currentLine);
    currentLine = word;
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines.length > 0 ? lines : [text];
}

async function buildSalesReportPdf(
  business: BusinessRow,
  weeklyBuckets: WeeklyBucket[],
) {
  const pdfDoc = await PDFDocument.create();
  const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const pageSize = { width: 612, height: 792 };
  const marginX = 44;
  const marginTop = 48;
  const marginBottom = 42;
  let page = pdfDoc.addPage([pageSize.width, pageSize.height]);
  let cursorY = pageSize.height - marginTop;

  const ensureSpace = (requiredHeight: number) => {
    if (cursorY - requiredHeight >= marginBottom) {
      return;
    }

    page = pdfDoc.addPage([pageSize.width, pageSize.height]);
    cursorY = pageSize.height - marginTop;
  };

  const drawLine = (
    text: string,
    options?: {
      font?: typeof regularFont;
      size?: number;
      color?: ReturnType<typeof rgb>;
      indent?: number;
      gapAfter?: number;
    },
  ) => {
    const size = options?.size ?? 10;
    const font = options?.font ?? regularFont;
    const indent = options?.indent ?? 0;
    const lineHeight = size + 4;
    const maxWidth = pageSize.width - marginX * 2 - indent;
    const lines = splitTextIntoLines(text, maxWidth, font, size);

    ensureSpace(lines.length * lineHeight + (options?.gapAfter ?? 0));

    for (const line of lines) {
      page.drawText(line, {
        x: marginX + indent,
        y: cursorY,
        size,
        font,
        color: options?.color ?? rgb(0.18, 0.13, 0.1),
      });
      cursorY -= lineHeight;
    }

    cursorY -= options?.gapAfter ?? 0;
  };

  const drawDivider = () => {
    ensureSpace(12);
    page.drawLine({
      start: { x: marginX, y: cursorY },
      end: { x: pageSize.width - marginX, y: cursorY },
      thickness: 1,
      color: rgb(0.93, 0.45, 0.18),
      opacity: 0.35,
    });
    cursorY -= 12;
  };

  const totalOrders = weeklyBuckets.reduce(
    (sum, bucket) => sum + bucket.orders.length,
    0,
  );
  const totalSales = weeklyBuckets.reduce(
    (sum, bucket) =>
      sum +
      bucket.orders.reduce(
        (bucketSum, order) => bucketSum + order.totalAmount,
        0,
      ),
    0,
  );
  const totalCommissions = weeklyBuckets.reduce(
    (sum, bucket) =>
      sum +
      bucket.orders.reduce(
        (bucketSum, order) => bucketSum + order.commissionTotal,
        0,
      ),
    0,
  );
  const averageOrderValue = totalOrders > 0 ? totalSales / totalOrders : 0;
  const generatedAt = new Date();

  drawLine("Gogi Eats", {
    font: boldFont,
    size: 20,
    color: rgb(0.86, 0.29, 0.14),
    gapAfter: 2,
  });
  drawLine("Reporte semanal de ventas por negocio", {
    font: boldFont,
    size: 14,
    color: rgb(0.34, 0.18, 0.14),
    gapAfter: 10,
  });

  drawLine(`Negocio: ${business.name}`, { size: 11, font: boldFont });
  drawLine(`Ciudad: ${business.city ?? "Sin ciudad"}`);
  drawLine(`Categoría: ${business.category_name ?? "Sin categoría"}`);
  drawLine(`Fecha de generación: ${formatDateTime(generatedAt)}`, {
    gapAfter: 8,
  });

  drawDivider();

  drawLine("Resumen general", {
    font: boldFont,
    size: 13,
    color: rgb(0.34, 0.18, 0.14),
    gapAfter: 4,
  });
  drawLine(`Total general vendido: ${formatCurrency(totalSales)}`);
  drawLine(`Total de pedidos: ${totalOrders}`);
  drawLine(
    `Promedio de venta por pedido: ${formatCurrency(averageOrderValue)}`,
  );
  drawLine(`Comisiones acumuladas: ${formatCurrency(totalCommissions)}`, {
    gapAfter: 8,
  });

  if (weeklyBuckets.length === 0) {
    drawDivider();
    drawLine("Este negocio aun no tiene historial de ventas registrado.", {
      font: boldFont,
      size: 12,
      color: rgb(0.45, 0.2, 0.16),
      gapAfter: 6,
    });

    return pdfDoc.save();
  }

  for (const [index, bucket] of weeklyBuckets.entries()) {
    const weekSales = bucket.orders.reduce(
      (sum, order) => sum + order.totalAmount,
      0,
    );
    const weekCommissions = bucket.orders.reduce(
      (sum, order) => sum + order.commissionTotal,
      0,
    );
    const weekAverage =
      bucket.orders.length > 0 ? weekSales / bucket.orders.length : 0;

    drawDivider();
    drawLine(
      `Semana ${weeklyBuckets.length - index}: ${formatDate(bucket.start)} - ${formatDate(bucket.end)}`,
      {
        font: boldFont,
        size: 12,
        color: rgb(0.86, 0.29, 0.14),
        gapAfter: 2,
      },
    );
    drawLine(`Pedidos realizados: ${bucket.orders.length}`);
    drawLine(`Total de ventas: ${formatCurrency(weekSales)}`);
    drawLine(`Promedio por pedido: ${formatCurrency(weekAverage)}`);
    drawLine(`Comisiones de la semana: ${formatCurrency(weekCommissions)}`, {
      gapAfter: 6,
    });

    drawLine("Detalle semanal", {
      font: boldFont,
      size: 11,
      color: rgb(0.34, 0.18, 0.14),
      gapAfter: 2,
    });

    for (const order of bucket.orders) {
      drawLine(
        `Pedido #${order.id} | ${formatDateTime(order.orderDate)} | ${formatCurrency(order.totalAmount)}`,
        {
          font: boldFont,
          size: 10,
        },
      );
      drawLine(
        `Metodo de pago: ${order.paymentMethod ?? "Sin definir"} | Estado pago: ${order.paymentStatus ?? "Sin definir"}`,
        {
          indent: 8,
        },
      );
      drawLine(
        `Subtotal: ${formatCurrency(order.subtotal)} | Envio: ${formatCurrency(order.deliveryFee)} | Comision: ${formatCurrency(order.commissionTotal)}`,
        {
          indent: 8,
        },
      );

      if (order.paymentAmount !== null) {
        drawLine(
          `Monto registrado en pagos: ${formatCurrency(order.paymentAmount)}`,
          {
            indent: 8,
          },
        );
      }

      if (order.items.length > 0) {
        drawLine("Productos vendidos:", {
          indent: 8,
          font: boldFont,
        });

        for (const item of order.items) {
          drawLine(
            `- ${item.quantity} x ${item.name} | ${formatCurrency(item.unitPrice)} | ${formatCurrency(item.subtotal)}`,
            {
              indent: 18,
            },
          );
        }
      } else {
        drawLine("Productos vendidos: Sin detalle disponible.", {
          indent: 8,
        });
      }

      cursorY -= 4;
    }
  }

  return pdfDoc.save();
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ businessId: string }> },
) {
  try {
    const { user: authUser } = getAuthUser(req);

    if (!authUser) {
      return NextResponse.json(
        { success: false, error: "Token invalido o faltante" },
        { status: 401 },
      );
    }

    if (!(await isAdminGeneral(authUser.id))) {
      return NextResponse.json(
        { success: false, error: "No autorizado" },
        { status: 403 },
      );
    }

    const params = await context.params;
    const businessId = Number(params.businessId);

    if (!Number.isFinite(businessId) || businessId <= 0) {
      return NextResponse.json(
        { success: false, error: "ID de negocio invalido" },
        { status: 400 },
      );
    }

    const [businessRows] = await pool.query<BusinessRow[]>(
      `
        SELECT
          b.id,
          b.name,
          b.city,
          bc.name AS category_name
        FROM business b
        LEFT JOIN business_category_map bcm ON bcm.business_id = b.id
        LEFT JOIN business_categories bc ON bc.id = bcm.category_id
        WHERE b.id = ?
        LIMIT 1
      `,
      [businessId],
    );

    const business = businessRows[0];

    if (!business) {
      return NextResponse.json(
        { success: false, error: "Negocio no encontrado" },
        { status: 404 },
      );
    }

    const [orders] = await pool.query<OrderRow[]>(
      `
        SELECT
          o.id,
          o.created_at,
          o.delivered_at,
          o.subtotal,
          o.service_fee,
          o.platform_fee,
          o.terminal_fee,
          o.delivery_fee,
          o.total_amount,
          COALESCE(o.payment_method, pm.name, latest_payment.payment_method_name) AS payment_method,
          COALESCE(latest_payment.payment_status, o.payment_status, latest_payment.status) AS payment_status,
          latest_payment.amount AS payment_amount
        FROM orders o
        INNER JOIN order_status_catalog osc ON osc.id = o.order_status_id
        LEFT JOIN payment_methods pm ON pm.id = o.payment_method_id
        LEFT JOIN (
          SELECT
            p.order_id,
            p.amount,
            p.payment_status,
            p.status,
            pm2.name AS payment_method_name
          FROM payments p
          LEFT JOIN payment_methods pm2 ON pm2.id = p.payment_method_id
          INNER JOIN (
            SELECT order_id, MAX(id) AS latest_payment_id
            FROM payments
            GROUP BY order_id
          ) latest ON latest.latest_payment_id = p.id
        ) latest_payment ON latest_payment.order_id = o.id
        WHERE o.business_id = ?
          AND LOWER(osc.name) IN (${COMPLETED_STATUSES.map(() => "?").join(", ")})
        ORDER BY COALESCE(o.delivered_at, o.created_at) DESC, o.id DESC
      `,
      [businessId, ...COMPLETED_STATUSES],
    );

    const orderIds = orders.map((order) => Number(order.id));
    const itemsByOrderId = new Map<number, OrderItemRow[]>();

    if (orderIds.length > 0) {
      const placeholders = orderIds.map(() => "?").join(", ");
      const [items] = await pool.query<OrderItemRow[]>(
        `
          SELECT
            order_id,
            product_name_snapshot,
            quantity,
            unit_price,
            subtotal
          FROM order_items
          WHERE order_id IN (${placeholders})
          ORDER BY order_id ASC, id ASC
        `,
        orderIds,
      );

      for (const item of items) {
        const orderId = Number(item.order_id);
        const existing = itemsByOrderId.get(orderId) ?? [];
        existing.push(item);
        itemsByOrderId.set(orderId, existing);
      }
    }

    const weeklyBuckets = buildWeeklyBuckets(orders, itemsByOrderId);
    const pdfBytes = await buildSalesReportPdf(business, weeklyBuckets);
    const pdfArrayBuffer = new Uint8Array(pdfBytes).buffer;
    const pdfBlob = new Blob([pdfArrayBuffer], { type: "application/pdf" });
    const fileName = `ventas-${slugifyFileName(business.name)}.pdf`;

    return new NextResponse(pdfBlob, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error(
      "Error GET /api/admin/businesses/[businessId]/sales-report/pdf:",
      error,
    );
    return NextResponse.json(
      {
        success: false,
        error: "No se pudo generar el PDF de ventas.",
        debug:
          process.env.NODE_ENV === "production"
            ? undefined
            : error instanceof Error
              ? error.message
              : String(error),
      },
      { status: 500 },
    );
  }
}
