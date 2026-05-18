"use client";

import Link from "next/link";
import {
  type ChangeEvent,
  type FormEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useState,
} from "react";
import { AppImage } from "@/components/ui/app-image";
import { compressImageFile } from "@/lib/client-image";
import { uploadImageAsset } from "@/lib/client-upload";

export default function NewProductClient({
  businessId,
}: {
  businessId: number;
}) {
  const businessIdNumber = Number(businessId);

  console.log("businessId:", businessIdNumber);
  // ============================
  // 📌 Estados principales
  // ============================

  // Identidad del producto
  const [sku, setSku] = useState("");
  const [barcode, setBarcode] = useState("");

  const [name, setName] = useState("");
  const [descriptionShort, setDescriptionShort] = useState("");
  const [descriptionLong, setDescriptionLong] = useState("");

  // Categorías
  const [categories, setCategories] = useState<{ id: number; name: string }[]>(
    [],
  );
  const [isLoadingCategories, setIsLoadingCategories] = useState(true);
  const [categoriesError, setCategoriesError] = useState("");

  const [categoryId, setCategoryId] = useState<number | null>(null);

  // Precios
  const [price, setPrice] = useState<number>(0);
  const [discountPrice, setDiscountPrice] = useState<number | null>(null);
  const [currency, setCurrency] = useState("MXN");

  const [saleFormat, setSaleFormat] = useState("pieza");
  const [pricePerUnit, setPricePerUnit] = useState<number | null>(null);

  // Impuestos
  const [taxIncluded, setTaxIncluded] = useState(true);
  const [taxRate, setTaxRate] = useState<number>(16);
  const [commissionRate, setCommissionRate] = useState<number | null>(null);

  // Stock
  const [isStockAvailable, setIsStockAvailable] = useState(true);
  const [stockAverage, setStockAverage] = useState<number>(0);
  const [stockDanger, setStockDanger] = useState<number>(0);

  // Restricciones por pedido
  const [maxPerOrder, setMaxPerOrder] = useState<number>(10);
  const [minPerOrder, setMinPerOrder] = useState<number>(1);

  // Promociones
  const [promotionId, setPromotionId] = useState<number | null>(null);

  // Imagen
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageFileName, setImageFileName] = useState<string | null>(null);
  const [imageError, setImageError] = useState("");
  const [uploadingImage, setUploadingImage] = useState(false);

  // Fechas
  const [expiresAt, setExpiresAt] = useState<string | null>(null);

  // Status
  const [statusId] = useState<number>(1); // activo

  // ============================
  // 📌 Clases de input
  // ============================

  const inputClass =
    "w-full min-w-0 rounded-2xl border border-white/16 bg-white/[0.07] px-4 py-3 text-sm text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] transition [color-scheme:dark] placeholder:text-neutral-400 focus:border-orange-400/80 focus:bg-[#151515] focus:outline-none focus:ring-4 focus:ring-orange-500/15 disabled:cursor-not-allowed disabled:opacity-60";
  const selectClass = `${inputClass} pr-10 [&>option]:bg-[#111111] [&>option]:text-white`;
  const cardClass =
    "rounded-[24px] border border-white/14 bg-[linear-gradient(180deg,rgba(25,25,25,0.94)_0%,rgba(15,15,15,0.96)_100%)] p-4 shadow-[0_22px_60px_rgba(0,0,0,0.3)] ring-1 ring-white/8 backdrop-blur-xl sm:p-5";
  const sectionTitleClass = "text-base font-semibold text-white";
  const sectionDescriptionClass = "text-xs leading-5 text-neutral-400";

  // ============================
  // 📌 Cargar categorías dinámicas
  // ============================
  useEffect(() => {
    async function loadCategories() {
      setIsLoadingCategories(true);
      setCategoriesError("");

      try {
        const query = businessIdNumber
          ? `?business_id=${businessIdNumber}`
          : "";
        const res = await fetch(`/api/product/categories${query}`, {
          cache: "no-store",
        });

        const data = await res.json();

        if (!res.ok || !Array.isArray(data.categories)) {
          setCategories([]);
          setCategoryId(null);
          setCategoriesError(
            data?.error || "No se pudieron cargar las categorías.",
          );
          return;
        }

        const nextCategories = data.categories
          .map((category: { id: number; name: string }) => ({
            id: Number(category.id),
            name: String(category.name ?? ""),
          }))
          .filter((category: { id: number; name: string }) =>
            Number.isFinite(category.id),
          );

        setCategories(nextCategories);

        if (nextCategories.length > 0) {
          setCategoryId(nextCategories[0].id);
        } else {
          setCategoryId(null);
        }
      } catch (err) {
        console.error("Error cargando categorías:", err);
        setCategories([]);
        setCategoryId(null);
        setCategoriesError("No se pudieron cargar las categorías.");
      } finally {
        setIsLoadingCategories(false);
      }
    }

    loadCategories();
  }, [businessIdNumber]);

  // ============================
  // 📌 Manejo de imagen
  // ============================

  function clearSelectedImage() {
    if (imagePreview?.startsWith("blob:")) {
      URL.revokeObjectURL(imagePreview);
    }

    setImageFile(null);
    setImageUrl(null);
    setImagePreview(null);
    setImageFileName(null);
    setImageError("");
  }

  async function handleImageChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;

    if (!file) {
      return;
    }

    const validMimeTypes = [
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/webp",
    ];

    if (!validMimeTypes.includes(file.type)) {
      setImageError("Solo se permiten imágenes JPG, JPEG, PNG o WEBP.");
      event.target.value = "";
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setImageError("La imagen no debe superar 5 MB.");
      event.target.value = "";
      return;
    }

    if (imagePreview?.startsWith("blob:")) {
      URL.revokeObjectURL(imagePreview);
    }

    try {
      const processedFile = await compressImageFile(file, {
        maxWidth: 1200,
        maxHeight: 1200,
        quality: 0.82,
        outputType: "image/jpeg",
      });
      const localPreview = URL.createObjectURL(processedFile);
      setImageUrl(null);
      setUploadingImage(true);
      setImagePreview(localPreview);
      setImageFile(processedFile);
      setImageFileName(file.name);

      const uploadedImage = await uploadImageAsset({
        file: processedFile,
        kind: "product",
      });

      URL.revokeObjectURL(localPreview);
      setImageUrl(uploadedImage.imageUrl);
      setImagePreview(uploadedImage.imageUrl);
      setImageError("");
    } catch (error) {
      setImageUrl(null);
      setImageError(
        error instanceof Error
          ? error.message
          : "No se pudo procesar la imagen seleccionada.",
      );
    } finally {
      setUploadingImage(false);
    }

    event.target.value = "";
  }

  // ============================
  // 📌 Validación mínima para permitir submit
  // ============================

  const canSubmit = useMemo(() => {
    const hasValidUploadedImage = !imageFile || Boolean(imageUrl);

    return (
      name.trim().length > 0 &&
      categoryId !== null &&
      price > 0 &&
      hasValidUploadedImage
    );
  }, [categoryId, imageFile, imageUrl, name, price]);

  // ============================
  // 📌 Envío a API
  // ============================

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (uploadingImage) {
      alert("Espera a que termine la subida de la imagen.");
      return;
    }

    // Generar SKU automático más corto y legible
    const skuValue =
      sku.trim() ||
      `PROD-${Math.random().toString(36).substring(2, 9).toUpperCase()}`;

    try {
      const payload = {
        product: {
          business_id: businessId,
          sku: skuValue,
          barcode: barcode || null,
          name,
          description_long: descriptionLong || null,
          description_short: descriptionShort || null,
          product_category_id: categoryId,
          price,
          discount_price: discountPrice || null,
          currency: currency || "MXN",
          sale_format: saleFormat || "UNIDAD",
          price_per_unit: pricePerUnit || null,
          tax_included: taxIncluded ? 1 : 0,
          tax_rate: taxRate || 0,
          commission_rate: commissionRate || 0,
          is_stock_available: isStockAvailable ? 1 : 0,
          max_per_order: maxPerOrder || null,
          min_per_order: minPerOrder || null,
          promotion_id: promotionId || null,
          thumbnail_url: imageUrl,
          image_url: imageUrl,
          stock_average: stockAverage || 0, // ← 0 en lugar de null
          stock_danger: stockDanger || 0, // ← 0 en lugar de null
          created_at: new Date(),
          updated_at: new Date(),
          expires_at: expiresAt || null,
          status_id: statusId,
        },
      };

      const token =
        typeof window !== "undefined" ? localStorage.getItem("token") : null;

      const res = await fetch("/api/business/products", {
        method: "POST",
        headers: {
          Authorization: token ? `Bearer ${token}` : "",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        alert(`❌ Error al guardar: ${JSON.stringify(data)}`);
        return;
      }

      if (!imageFile) {
        alert(
          "✅ Producto creado correctamente. Advertencia: el producto quedó sin imagen.",
        );
        return;
      }

      alert("✅ Producto creado correctamente.");
      // Opcional: redirigir al panel
      // window.location.href = `/business`;
    } catch (err) {
      console.error(err);
      alert("❌ Error inesperado.");
    }
  }

  // ============================
  // 📌 Layout del formulario (empieza aquí)
  // ============================

  return (
    <main className="relative min-h-screen overflow-x-clip bg-[#08110c] text-white">
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[url('/fondo.png')] bg-cover bg-center opacity-20"
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[linear-gradient(180deg,rgba(5,10,8,0.5)_0%,rgba(6,11,9,0.76)_20%,rgba(8,10,10,0.9)_100%)]"
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,132,40,0.18),transparent_28%),radial-gradient(circle_at_top_right,rgba(76,149,108,0.18),transparent_24%)] backdrop-blur-[2px]"
      />
      <div className="relative mx-auto max-w-7xl px-4 py-6 sm:px-5 md:px-6 md:py-8 lg:px-8 lg:py-10">
        {/* ============================
              🏆 Header Principal
              ============================ */}
        <section className="relative overflow-hidden rounded-[28px] border border-white/12 bg-[linear-gradient(135deg,rgba(28,39,33,0.94)_0%,rgba(48,70,56,0.92)_45%,rgba(73,95,68,0.9)_100%)] p-5 text-white shadow-[0_28px_80px_rgba(0,0,0,0.34)] ring-1 ring-white/8 backdrop-blur-xl sm:rounded-[32px] sm:p-6 md:p-8 lg:p-10">
          {/* Elementos de fondo decorativos - totalmente responsivos */}
          <div
            aria-hidden="true"
            className="absolute -left-10 top-8 size-32 rounded-full bg-white/10 blur-xl sm:-left-16 sm:size-48 sm:blur-2xl md:-left-20 md:top-10 md:size-56 lg:-left-28 lg:size-64 lg:blur-3xl"
          />
          <div
            aria-hidden="true"
            className="absolute -right-8 -top-12 size-32 rounded-full bg-white/15 blur-xl sm:-right-12 sm:-top-16 sm:size-48 sm:blur-2xl md:-right-16 md:-top-20 md:size-56 lg:-right-24 lg:-top-24 lg:size-64 lg:blur-3xl"
          />

          <div className="relative grid gap-6 md:gap-8 lg:grid-cols-[1.5fr,1fr] lg:items-center">
            {/* Columna izquierda: Contenido principal */}
            <div className="space-y-4 md:space-y-6 lg:order-1">
              {/* Breadcrumb + Etiqueta */}
              <div className="flex flex-wrap items-center gap-3">
                <Link
                  href="/business"
                  className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/5 px-3 py-1 text-xs font-medium text-white/90 backdrop-blur-sm transition hover:bg-white/10"
                >
                  ← Panel
                </Link>

                <span className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs uppercase tracking-[0.3em]">
                  Nuevo producto
                </span>
              </div>

              {/* Títulos */}
              <div className="space-y-3 md:space-y-4">
                <h1 className="text-2xl font-semibold sm:text-3xl md:text-4xl lg:text-5xl">
                  Agregar producto al catálogo
                </h1>

                <p className="text-sm text-white/90 sm:text-base md:text-lg lg:max-w-2xl">
                  Completa la ficha del producto para publicarlo en el menú del
                  negocio.
                </p>
              </div>

              {/* Badge del sistema */}
              <div className="grid gap-3 rounded-2xl border border-white/12 bg-black/20 p-4 text-xs uppercase tracking-[0.2em] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-sm">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-sm font-bold text-orange-800 shadow-inner">
                    FG
                  </div>
                  <div className="space-y-1">
                    <span className="text-white/80">SISTEMA</span>
                    <p className="text-sm normal-case tracking-normal text-white">
                      GogiEats · Panel de administrador
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Columna derecha: Espacio para contenido adicional */}
          </div>
        </section>

        {/* ============================
              📋 Formulario Principal - Layout compacto
              ============================ */}
        <form
          className="mt-5 grid gap-5 md:mt-6 md:gap-6 xl:grid-cols-[minmax(0,1fr),380px]"
          onSubmit={handleSubmit}
        >
          {/* ============================
                📝 ÁREA PRINCIPAL DEL FORMULARIO
                ============================ */}
          <div className="grid gap-4 sm:gap-5 md:gap-6">
            {/* Grupo 1: Información básica y precio */}
            <div className="grid gap-5 lg:grid-cols-2">
              {/* Columna izquierda: Información básica */}
              <section className={cardClass}>
                <header className="space-y-0.5 pb-2 sm:pb-3">
                  <h2 className={sectionTitleClass}>Información básica</h2>
                  <p className={sectionDescriptionClass}>
                    Datos principales del producto
                  </p>
                </header>

                <div className="grid gap-3">
                  <FieldCompact
                    label="Nombre del producto"
                    htmlFor="name"
                    required
                  >
                    <input
                      id="name"
                      type="text"
                      required
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      placeholder="Ej. Latte con almendra"
                      className={inputClass}
                    />
                  </FieldCompact>

                  <FieldCompact
                    label="Descripción corta"
                    htmlFor="descriptionShort"
                  >
                    <input
                      id="descriptionShort"
                      type="text"
                      required
                      value={descriptionShort}
                      onChange={(event) =>
                        setDescriptionShort(event.target.value)
                      }
                      placeholder="Café latte con leche de almendra..."
                      className={inputClass}
                    />
                  </FieldCompact>

                  <div className="grid gap-2 sm:grid-cols-2">
                    <FieldCompact label="SKU" htmlFor="sku" required>
                      <input
                        id="sku"
                        type="text"
                        value={sku}
                        onChange={(event) => setSku(event.target.value)}
                        placeholder="CAF-001"
                        className={inputClass}
                      />
                    </FieldCompact>

                    <FieldCompact label="Código de barras" htmlFor="barcode">
                      <input
                        id="barcode"
                        type="text"
                        value={barcode}
                        onChange={(event) => setBarcode(event.target.value)}
                        placeholder="7501234567890"
                        className={inputClass}
                      />
                    </FieldCompact>
                  </div>

                  <FieldCompact label="Categoría" htmlFor="category">
                    <select
                      id="category"
                      value={categoryId ?? ""}
                      onChange={(e) => setCategoryId(Number(e.target.value))}
                      disabled={isLoadingCategories || categories.length === 0}
                      className={selectClass}
                      required
                    >
                      {isLoadingCategories ? (
                        <option value="">Cargando...</option>
                      ) : categoriesError ? (
                        <option value="">
                          No se pudieron cargar las categorías
                        </option>
                      ) : categories.length === 0 ? (
                        <option value="">Sin categorías disponibles</option>
                      ) : (
                        categories.map((cat) => (
                          <option key={cat.id} value={cat.id}>
                            {cat.name}
                          </option>
                        ))
                      )}
                    </select>
                  </FieldCompact>
                </div>
              </section>

              {/* Columna derecha: Precio y presentación */}
              <section className={cardClass}>
                <header className="space-y-0.5 pb-2 sm:pb-3">
                  <h2 className={sectionTitleClass}>Precio y presentación</h2>
                  <p className={sectionDescriptionClass}>
                    Costo y cómo se vende
                  </p>
                </header>

                <div className="grid gap-3">
                  <div className="grid gap-2 sm:grid-cols-2">
                    {/* Precio (MXN) */}
                    <FieldCompact label="Precio (MXN)" htmlFor="price" required>
                      <div className="relative">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-medium text-orange-200/85">
                          $
                        </span>
                        <input
                          id="price"
                          type="number"
                          min={0}
                          step="0.01"
                          required
                          value={price}
                          onChange={(event) =>
                            setPrice(Number(event.target.value))
                          }
                          className={`${inputClass} pl-8`}
                        />
                      </div>
                    </FieldCompact>

                    {/* Precio oferta */}
                    <FieldCompact label="Precio oferta" htmlFor="discountPrice">
                      <div className="relative">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-medium text-orange-200/85">
                          $
                        </span>
                        <input
                          id="discountPrice"
                          type="number"
                          min={0}
                          step="0.01"
                          value={discountPrice ?? ""}
                          onChange={(event) =>
                            setDiscountPrice(
                              event.target.value
                                ? Number(event.target.value)
                                : null,
                            )
                          }
                          placeholder="Opcional"
                          className={`${inputClass} pl-8`}
                        />
                      </div>
                    </FieldCompact>
                  </div>

                  <div className="grid gap-2 sm:grid-cols-2">
                    <FieldCompact label="Formato de venta" htmlFor="saleFormat">
                      <select
                        id="saleFormat"
                        value={saleFormat}
                        onChange={(event) => setSaleFormat(event.target.value)}
                        className={selectClass}
                      >
                        <option value="pieza">Pieza</option>
                        <option value="kg">Kilogramo</option>
                        <option value="lt">Litro</option>
                        <option value="paquete">Paquete</option>
                      </select>
                    </FieldCompact>

                    <FieldCompact
                      label="Precio por unidad"
                      htmlFor="pricePerUnit"
                    >
                      <div className="relative">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-medium text-orange-200/85">
                          $
                        </span>
                        <input
                          id="pricePerUnit"
                          type="number"
                          min={0}
                          step="0.01"
                          value={pricePerUnit ?? ""}
                          onChange={(event) =>
                            setPricePerUnit(
                              event.target.value
                                ? Number(event.target.value)
                                : null,
                            )
                          }
                          placeholder="Opcional"
                          className={`${inputClass} pl-8`}
                        />
                      </div>
                    </FieldCompact>
                  </div>

                  <FieldCompact label="Moneda" htmlFor="currency">
                    <select
                      id="currency"
                      value={currency}
                      onChange={(event) => setCurrency(event.target.value)}
                      className={selectClass}
                    >
                      <option value="MXN">MXN (Peso mexicano)</option>
                    </select>
                  </FieldCompact>
                </div>
              </section>
            </div>

            {/* Grupo 2: Detalles adicionales */}
            <div className="grid gap-5 lg:grid-cols-2">
              {/* Columna izquierda: Impuestos y comisiones */}
              <section className={cardClass}>
                <header className="space-y-0.5 pb-2 sm:pb-3">
                  <h2 className={sectionTitleClass}>Impuestos</h2>
                  <p className={sectionDescriptionClass}>
                    Configuración fiscal
                  </p>
                </header>

                <div className="grid gap-3">
                  <div className="flex items-center gap-2">
                    <input
                      id="taxIncluded"
                      type="checkbox"
                      checked={taxIncluded}
                      onChange={(e) => setTaxIncluded(e.target.checked)}
                      className="size-4 rounded border-white/20 bg-white/10 text-orange-400 focus:ring-2 focus:ring-orange-500/20"
                    />
                    <label
                      htmlFor="taxIncluded"
                      className="text-sm font-medium text-neutral-100"
                    >
                      Precio incluye impuestos
                    </label>
                  </div>

                  <FieldCompact label="Tasa de impuesto (%)" htmlFor="taxRate">
                    <input
                      id="taxRate"
                      type="number"
                      min={0}
                      step="0.01"
                      value={taxRate}
                      onChange={(event) =>
                        setTaxRate(Number(event.target.value))
                      }
                      className={inputClass}
                    />
                  </FieldCompact>

                  <FieldCompact
                    label="Comisión interna (%)"
                    htmlFor="commissionRate"
                  >
                    <input
                      id="commissionRate"
                      type="number"
                      min={0}
                      step="0.01"
                      value={commissionRate ?? ""}
                      onChange={(event) =>
                        setCommissionRate(
                          event.target.value
                            ? Number(event.target.value)
                            : null,
                        )
                      }
                      placeholder="Opcional"
                      className={inputClass}
                    />
                  </FieldCompact>
                </div>
              </section>

              {/* Columna derecha: Inventario */}
              <section className={cardClass}>
                <header className="space-y-0.5 pb-2 sm:pb-3">
                  <h2 className={sectionTitleClass}>Inventario</h2>
                  <p className={sectionDescriptionClass}>
                    Control de stock y disponibilidad
                  </p>
                </header>

                <div className="grid gap-3">
                  <div className="flex items-center gap-2">
                    <input
                      id="isStockAvailable"
                      type="checkbox"
                      checked={isStockAvailable}
                      onChange={(event) =>
                        setIsStockAvailable(event.target.checked)
                      }
                      className="size-4 rounded border-white/20 bg-white/10 text-orange-400 focus:ring-2 focus:ring-orange-500/20"
                    />
                    <label
                      htmlFor="isStockAvailable"
                      className="text-sm font-medium text-neutral-100"
                    >
                      Mostrar como disponible
                    </label>
                  </div>

                  <div className="grid gap-2 sm:grid-cols-2">
                    <FieldCompact label="Stock promedio" htmlFor="stockAverage">
                      <input
                        id="stockAverage"
                        type="number"
                        min={0}
                        value={stockAverage}
                        onChange={(event) =>
                          setStockAverage(Number(event.target.value))
                        }
                        className={inputClass}
                      />
                    </FieldCompact>

                    <FieldCompact label="Stock de alerta" htmlFor="stockDanger">
                      <input
                        id="stockDanger"
                        type="number"
                        min={0}
                        value={stockDanger}
                        onChange={(event) =>
                          setStockDanger(Number(event.target.value))
                        }
                        className={inputClass}
                      />
                    </FieldCompact>
                  </div>
                </div>
              </section>
            </div>

            <section className={cardClass}>
              <header className="space-y-0.5 pb-2 sm:pb-3">
                <h2 className={sectionTitleClass}>Imagen del producto</h2>
                <p className={sectionDescriptionClass}>
                  Foto visible para los clientes
                </p>
              </header>

              <div className="grid gap-4 lg:grid-cols-[minmax(0,0.95fr),minmax(0,1.05fr)]">
                <div className="space-y-3">
                  <label
                    htmlFor="product-image"
                    className="grid min-h-40 cursor-pointer place-content-center gap-2 rounded-2xl border-2 border-dashed border-white/18 bg-white/[0.04] p-5 text-center text-sm font-semibold text-white transition hover:border-orange-300/65 hover:bg-white/[0.07]"
                  >
                    <span className="text-base font-semibold">
                      Subir imagen
                    </span>
                    <span className="text-xs text-neutral-400">
                      JPG, JPEG, PNG o WEBP · Máximo 5 MB
                    </span>
                    <input
                      id="product-image"
                      type="file"
                      accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                      onChange={handleImageChange}
                      className="hidden"
                    />
                  </label>

                  <div className="flex flex-wrap gap-2">
                    <label
                      htmlFor="product-image"
                      className="inline-flex cursor-pointer items-center rounded-xl border border-white/14 bg-white/[0.06] px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-white/[0.12]"
                    >
                      {imageFile ? "Cambiar imagen" : "Seleccionar imagen"}
                    </label>
                    {imageFile ? (
                      <button
                        type="button"
                        onClick={clearSelectedImage}
                        className="inline-flex items-center rounded-xl border border-rose-300/35 bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-200 transition hover:bg-rose-500/15"
                      >
                        Eliminar
                      </button>
                    ) : null}
                  </div>

                  {imageError ? (
                    <p className="rounded-xl border border-rose-300/35 bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-200">
                      {imageError}
                    </p>
                  ) : null}

                  {!imageFile ? (
                    <p className="rounded-xl border border-amber-300/35 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-100">
                      Producto sin imagen. Puedes guardarlo así, pero se verá
                      mejor con foto.
                    </p>
                  ) : null}
                </div>

                <div className="rounded-2xl border border-white/12 bg-black/35 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-400">
                    Vista previa
                  </p>

                  {imagePreview ? (
                    <div className="mt-3 overflow-hidden rounded-2xl border border-white/12 bg-black/25">
                      <AppImage
                        src={imagePreview}
                        alt="Vista previa del producto"
                        width={1200}
                        height={900}
                        aspectClassName="aspect-[4/3]"
                        className="h-64 w-full"
                        imageClassName="object-cover"
                        allowObjectUrl
                        optimize={false}
                        fallbackLabel="Vista previa"
                      />
                      {imageFileName ? (
                        <p className="truncate border-t border-white/10 px-3 py-2 text-xs font-medium text-neutral-300">
                          {imageFileName}
                        </p>
                      ) : null}
                    </div>
                  ) : (
                    <div className="mt-3 grid min-h-64 place-content-center rounded-2xl border border-dashed border-white/14 bg-white/[0.04] px-4 text-center text-sm font-medium text-neutral-400">
                      Aún no has seleccionado una imagen.
                    </div>
                  )}
                </div>
              </div>
            </section>

            {/* Grupo 3: Límites y descripción larga */}
            <div className="grid gap-5 lg:grid-cols-2">
              {/* Columna izquierda: Límites y promoción */}
              <section className={cardClass}>
                <header className="space-y-0.5 pb-2 sm:pb-3">
                  <h2 className={sectionTitleClass}>Límites y promoción</h2>
                  <p className={sectionDescriptionClass}>
                    Restricciones por pedido
                  </p>
                </header>

                <div className="grid gap-3">
                  <div className="grid gap-2 sm:grid-cols-2">
                    <FieldCompact
                      label="Mínimo por pedido"
                      htmlFor="minPerOrder"
                    >
                      <input
                        id="minPerOrder"
                        type="number"
                        min={1}
                        value={minPerOrder}
                        onChange={(event) =>
                          setMinPerOrder(Number(event.target.value))
                        }
                        className={inputClass}
                      />
                    </FieldCompact>

                    <FieldCompact
                      label="Máximo por pedido"
                      htmlFor="maxPerOrder"
                    >
                      <input
                        id="maxPerOrder"
                        type="number"
                        min={1}
                        value={maxPerOrder}
                        onChange={(event) =>
                          setMaxPerOrder(Number(event.target.value))
                        }
                        className={inputClass}
                      />
                    </FieldCompact>
                  </div>

                  <FieldCompact label="ID Promoción" htmlFor="promotionId">
                    <input
                      id="promotionId"
                      type="number"
                      min={0}
                      value={promotionId ?? ""}
                      onChange={(event) =>
                        setPromotionId(
                          event.target.value
                            ? Number(event.target.value)
                            : null,
                        )
                      }
                      placeholder="Opcional"
                      className={inputClass}
                    />
                  </FieldCompact>

                  <FieldCompact label="Fecha de expiración" htmlFor="expiresAt">
                    <input
                      id="expiresAt"
                      type="datetime-local"
                      value={expiresAt ?? ""}
                      onChange={(event) =>
                        setExpiresAt(
                          event.target.value ? event.target.value : null,
                        )
                      }
                      className={inputClass}
                    />
                  </FieldCompact>
                </div>
              </section>

              {/* Columna derecha: Descripción larga y subcategoría */}
              <section className={cardClass}>
                <header className="space-y-0.5 pb-2 sm:pb-3">
                  <h2 className={sectionTitleClass}>Detalles adicionales</h2>
                  <p className={sectionDescriptionClass}>
                    Información complementaria
                  </p>
                </header>

                <div className="grid gap-3">
                  <FieldCompact
                    label="Descripción larga"
                    htmlFor="descriptionLong"
                  >
                    <textarea
                      id="descriptionLong"
                      rows={4}
                      value={descriptionLong}
                      onChange={(event) =>
                        setDescriptionLong(event.target.value)
                      }
                      placeholder="Describe ingredientes, tamaño, notas especiales, preparación..."
                      className={`${inputClass} min-h-[80px] resize-y`}
                    />
                  </FieldCompact>
                </div>
              </section>
            </div>
          </div>

          {/* ============================
                📍 BARRA LATERAL DERECHA - Siempre visible
                ============================ */}
          <aside className="space-y-4 sm:space-y-5 xl:sticky xl:top-6 xl:self-start">
            {/* Sección de Resumen y Guardar */}
            <section className={cardClass}>
              <header className="space-y-0.5 pb-2 sm:pb-3">
                <p className="text-base font-semibold text-white">Resumen</p>
                <p className="text-xs text-neutral-400">
                  Verifica antes de guardar
                </p>
              </header>

              <ul className="space-y-2 text-sm text-neutral-300">
                <li className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.05] px-3 py-3">
                  <span className="font-medium text-neutral-100">Precio</span>
                  <span className="font-semibold text-white">
                    {new Intl.NumberFormat("es-MX", {
                      style: "currency",
                      currency: "MXN",
                    }).format(price || 0)}
                  </span>
                </li>

                <li className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.05] px-3 py-3">
                  <span className="font-medium text-neutral-100">SKU</span>
                  <span className="text-right font-mono text-xs text-white">
                    {sku || (
                      <span className="text-amber-200 italic">
                        (auto-generado)
                      </span>
                    )}
                  </span>
                </li>

                <li className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.05] px-3 py-3">
                  <span className="font-medium text-neutral-100">
                    IVA incluido
                  </span>
                  <span className="text-white">
                    {taxIncluded ? "Sí" : "No"}
                  </span>
                </li>

                <li className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.05] px-3 py-3">
                  <span className="font-medium text-neutral-100">Stock</span>
                  <span className="text-white">
                    {isStockAvailable ? "Disponible" : "No disponible"}
                  </span>
                </li>

                <li className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.05] px-3 py-3">
                  <span className="font-medium text-neutral-100">
                    Categoría
                  </span>
                  <span className="text-right text-white">
                    {categories.find((c) => c.id === categoryId)?.name ??
                      "Sin categoría"}
                  </span>
                </li>
              </ul>

              <div className="mt-5">
                <button
                  type="submit"
                  disabled={!canSubmit || uploadingImage}
                  className="w-full rounded-2xl bg-gradient-to-r from-orange-500 via-orange-500 to-emerald-500 px-4 py-3.5 text-sm font-semibold text-white shadow-[0_18px_40px_rgba(249,115,22,0.26)] transition hover:-translate-y-0.5 hover:brightness-105 disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Guardar producto
                </button>

                {!canSubmit && (
                  <p className="mt-2 text-center text-[11px] text-rose-300">
                    Completa los campos requeridos
                  </p>
                )}
                {uploadingImage ? (
                  <p className="mt-2 text-center text-[11px] text-emerald-300">
                    Subiendo imagen del producto...
                  </p>
                ) : null}
              </div>

              <div className="mt-4 border-t border-white/10 pt-4">
                <p className="text-[11px] leading-5 text-neutral-400">
                  <span className="font-semibold">Nota:</span>{" "}
                  {imageFile
                    ? "La imagen ya quedó subida y se guardará junto con el producto."
                    : "Puedes guardar el producto sin imagen y agregarla después."}
                </p>
              </div>
            </section>

            {/* Información rápida del negocio */}
            <section className={cardClass}>
              <header className="space-y-0.5 pb-2 sm:pb-3">
                <p className="text-base font-semibold text-white">
                  Negocio actual
                </p>
                <p className="text-xs text-neutral-400">ID: {businessId}</p>
              </header>

              <div className="space-y-2 text-sm text-neutral-300">
                <p className="flex items-center gap-1.5">
                  <span className="text-emerald-300">✓</span>
                  Producto se agregará a este negocio
                </p>
                <p className="flex items-center gap-1.5">
                  <span className="text-emerald-300">✓</span>
                  Disponible en app y web
                </p>
                <p className="flex items-center gap-1.5">
                  <span className="text-emerald-300">✓</span>
                  Gestión de inventario activa
                </p>
              </div>
            </section>
          </aside>
        </form>
      </div>
    </main>
  );
}

/* =======================================
   📦 Componentes auxiliares compactos
   ======================================= */
function FieldCompact({
  label,
  htmlFor,
  required = false,
  children,
}: {
  label: string;
  htmlFor?: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <label htmlFor={htmlFor} className="grid gap-1.5">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-neutral-100">{label}</span>
        {required && <span className="text-[11px] text-rose-300">*</span>}
      </div>
      {children}
    </label>
  );
}
