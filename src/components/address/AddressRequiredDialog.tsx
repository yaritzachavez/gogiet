"use client";

import { useEffect, useState } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { DeliveryZoneOption } from "@/lib/shipping";

export type SavedAddress = {
  id: number;
  placeType: string;
  placeName: string | null;
  street: string;
  externalNumber: string | null;
  internalNumber: string | null;
  neighborhood: string;
  city: string;
  state: string;
  phone: string;
  references: string;
  deliveryInstructions: string;
  fullAddress: string;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (address: SavedAddress) => void;
};

const PLACE_TYPES = [
  "Casa",
  "Departamento",
  "Cabaña",
  "Hotel",
  "Edificio",
  "Otro",
];

const USER_UPDATED_EVENT = "gogi-user-updated";

export default function AddressRequiredDialog({
  open,
  onOpenChange,
  onSaved,
}: Props) {
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [zones, setZones] = useState<DeliveryZoneOption[]>([]);
  const [loadingZones, setLoadingZones] = useState(false);
  const [placeType, setPlaceType] = useState("");
  const [placeName, setPlaceName] = useState("");
  const [street, setStreet] = useState("");
  const [externalNumber, setExternalNumber] = useState("");
  const [internalNumber, setInternalNumber] = useState("");
  const [neighborhood, setNeighborhood] = useState("");
  const [references, setReferences] = useState("");
  const [phone, setPhone] = useState("");
  const [deliveryInstructions, setDeliveryInstructions] = useState("");
  const [withoutExternalNumber, setWithoutExternalNumber] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) {
      setFieldErrors({});
      setErrorMessage("");
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const loadZones = async () => {
      try {
        setLoadingZones(true);
        const response = await fetch("/api/shipping-zones", {
          cache: "no-store",
        });
        const data = await response.json();

        if (!response.ok || !data.success) {
          throw new Error(data?.error || "No pudimos cargar las zonas.");
        }

        setZones(
          Array.isArray(data.zones) ? (data.zones as DeliveryZoneOption[]) : [],
        );
      } catch (error) {
        console.error(error);
        setZones([]);
        setErrorMessage(
          "No pudimos cargar las zonas por ahora. Intenta de nuevo en unos minutos.",
        );
      } finally {
        setLoadingZones(false);
      }
    };

    loadZones();
  }, [open]);

  const validateForm = () => {
    const nextErrors: Record<string, string> = {};

    if (!placeType.trim()) {
      nextErrors.placeType = "Selecciona el tipo de lugar.";
    }

    if (!street.trim()) {
      nextErrors.street = "La calle es obligatoria.";
    }

    if (!withoutExternalNumber && !externalNumber.trim()) {
      nextErrors.externalNumber = "El número exterior es obligatorio.";
    }

    if (!neighborhood.trim()) {
      nextErrors.neighborhood = "La colonia o zona es obligatoria.";
    }

    if (!phone.trim()) {
      nextErrors.phone = "El teléfono es obligatorio.";
    }

    const needsReferences =
      ["cabaña", "hotel"].includes(placeType.toLowerCase()) ||
      /rancher|comunidad|zona rural|cabaña/i.test(neighborhood);

    if (needsReferences && !references.trim()) {
      nextErrors.references =
        "Las referencias son obligatorias para cabañas, hoteles o zonas rurales.";
    }

    setFieldErrors(nextErrors);
    return {
      isValid: Object.keys(nextErrors).length === 0,
      needsReferences,
    };
  };

  const handleSave = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage("");
    const { isValid } = validateForm();

    if (!isValid) {
      return;
    }

    try {
      setSaving(true);

      const token = window.localStorage.getItem("token");

      const response = await fetch("/api/account/address", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          placeType,
          placeName,
          street,
          externalNumber,
          internalNumber,
          neighborhood,
          references,
          phone,
          deliveryInstructions,
          withoutExternalNumber,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        const apiError = String(data?.error ?? "");

        if (apiError.includes("Tipo de lugar")) {
          setFieldErrors((prev) => ({
            ...prev,
            placeType: prev.placeType || "Selecciona el tipo de lugar.",
            street: prev.street || "La calle es obligatoria.",
            neighborhood:
              prev.neighborhood || "La colonia o zona es obligatoria.",
            phone: prev.phone || "El teléfono es obligatorio.",
          }));
        } else if (apiError.includes("número exterior")) {
          setFieldErrors((prev) => ({
            ...prev,
            externalNumber:
              prev.externalNumber || "El número exterior es obligatorio.",
          }));
        } else if (apiError.includes("referencias")) {
          setFieldErrors((prev) => ({
            ...prev,
            references:
              prev.references ||
              "Las referencias son obligatorias para esta dirección.",
          }));
        } else if (apiError.includes("zona de envío válida")) {
          setFieldErrors((prev) => ({
            ...prev,
            neighborhood:
              prev.neighborhood || "Selecciona una zona de envío válida.",
          }));
        } else {
          setErrorMessage(apiError || "No pudimos guardar tu dirección.");
        }

        return;
      }

      const storedUser = window.localStorage.getItem("user");

      if (storedUser) {
        const parsedUser = JSON.parse(storedUser) as Record<string, unknown>;
        parsedUser.address = data.address;
        window.localStorage.setItem("user", JSON.stringify(parsedUser));
        window.dispatchEvent(new Event(USER_UPDATED_EVENT));
      }

      onSaved(data.address as SavedAddress);
      onOpenChange(false);
    } catch (error) {
      console.error(error);
      setErrorMessage("No pudimos guardar tu dirección.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] max-w-2xl flex-col overflow-hidden rounded-3xl border-slate-200 bg-white p-0 shadow-xl">
        <DialogHeader className="border-b border-slate-100 px-6 py-5">
          <DialogTitle className="text-slate-950">
            Agrega tu dirección de entrega
          </DialogTitle>
          <DialogDescription className="text-slate-500">
            Necesitamos tu dirección guardada para calcular el envío antes de
            agregar productos al carrito.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSave} className="flex min-h-0 flex-1 flex-col">
          <div className="grid flex-1 gap-4 overflow-y-auto px-6 py-5 md:grid-cols-2">
            <label className="space-y-2 text-sm text-slate-700">
              <span className="font-semibold">Tipo de lugar</span>
              <select
                value={placeType}
                onChange={(event) => {
                  setPlaceType(event.target.value);
                  setFieldErrors((prev) => ({ ...prev, placeType: "" }));
                }}
                className={`w-full rounded-2xl border px-4 py-3 outline-none focus:border-slate-400 ${
                  fieldErrors.placeType ? "border-red-300" : "border-slate-200"
                }`}
              >
                <option value="">Selecciona una opción</option>
                {PLACE_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
              {fieldErrors.placeType ? (
                <p className="text-xs text-red-600">{fieldErrors.placeType}</p>
              ) : null}
            </label>

            <label className="space-y-2 text-sm text-slate-700">
              <span className="font-semibold">Nombre del lugar</span>
              <input
                value={placeName}
                onChange={(event) => setPlaceName(event.target.value)}
                placeholder="Ej. Cabaña Río de la Montaña"
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:border-slate-400"
              />
            </label>

            <label className="space-y-2 text-sm text-slate-700">
              <span className="font-semibold">Calle</span>
              <input
                value={street}
                onChange={(event) => {
                  setStreet(event.target.value);
                  setFieldErrors((prev) => ({ ...prev, street: "" }));
                }}
                placeholder="Calle o camino principal"
                className={`w-full rounded-2xl border px-4 py-3 outline-none focus:border-slate-400 ${
                  fieldErrors.street ? "border-red-300" : "border-slate-200"
                }`}
              />
              {fieldErrors.street ? (
                <p className="text-xs text-red-600">{fieldErrors.street}</p>
              ) : null}
            </label>

            <label className="space-y-2 text-sm text-slate-700">
              <span className="font-semibold">Número exterior</span>
              <input
                value={externalNumber}
                onChange={(event) => {
                  setExternalNumber(event.target.value);
                  setFieldErrors((prev) => ({ ...prev, externalNumber: "" }));
                }}
                placeholder="Ej. 14"
                disabled={withoutExternalNumber}
                className={`w-full rounded-2xl border px-4 py-3 outline-none focus:border-slate-400 disabled:bg-slate-100 ${
                  fieldErrors.externalNumber
                    ? "border-red-300"
                    : "border-slate-200"
                }`}
              />
              {fieldErrors.externalNumber ? (
                <p className="text-xs text-red-600">
                  {fieldErrors.externalNumber}
                </p>
              ) : null}
            </label>

            <label className="space-y-2 text-sm text-slate-700">
              <span className="font-semibold">Número interior</span>
              <input
                value={internalNumber}
                onChange={(event) => setInternalNumber(event.target.value)}
                placeholder="Opcional"
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:border-slate-400"
              />
            </label>

            <label className="space-y-2 text-sm text-slate-700">
              <span className="font-semibold">Colonia, ranchería o zona</span>
              <select
                value={neighborhood}
                onChange={(event) => {
                  setNeighborhood(event.target.value);
                  setFieldErrors((prev) => ({
                    ...prev,
                    neighborhood: "",
                    references: "",
                  }));
                }}
                disabled={loadingZones}
                className={`w-full rounded-2xl border px-4 py-3 outline-none focus:border-slate-400 disabled:bg-slate-100 ${
                  fieldErrors.neighborhood
                    ? "border-red-300"
                    : "border-slate-200"
                }`}
              >
                <option value="">
                  {loadingZones
                    ? "Cargando zonas..."
                    : "Selecciona una zona de envío"}
                </option>
                {zones.map((zone) => (
                  <option key={zone.id} value={zone.nombre}>
                    {zone.nombre} ({zone.tipo})
                  </option>
                ))}
              </select>
              {fieldErrors.neighborhood ? (
                <p className="text-xs text-red-600">
                  {fieldErrors.neighborhood}
                </p>
              ) : null}
              {!fieldErrors.neighborhood && neighborhood ? (
                <p className="text-xs text-slate-500">
                  {(() => {
                    const selectedZone = zones.find(
                      (zone) => zone.nombre === neighborhood,
                    );

                    if (!selectedZone) return null;

                    return `Distancia estimada: ${selectedZone.distanciaKm.toFixed(1)} km`;
                  })()}
                </p>
              ) : null}
            </label>

            <label className="space-y-2 text-sm text-slate-700 md:col-span-2">
              <span className="font-semibold">Referencias</span>
              <textarea
                value={references}
                onChange={(event) => {
                  setReferences(event.target.value);
                  setFieldErrors((prev) => ({ ...prev, references: "" }));
                }}
                placeholder="Ej. portón negro, junto a la iglesia, frente a la tienda"
                className={`min-h-24 w-full rounded-2xl border px-4 py-3 outline-none focus:border-slate-400 ${
                  fieldErrors.references ? "border-red-300" : "border-slate-200"
                }`}
              />
              {fieldErrors.references ? (
                <p className="text-xs text-red-600">{fieldErrors.references}</p>
              ) : null}
            </label>

            <label className="space-y-2 text-sm text-slate-700">
              <span className="font-semibold">Teléfono de contacto</span>
              <input
                value={phone}
                onChange={(event) => {
                  setPhone(event.target.value);
                  setFieldErrors((prev) => ({ ...prev, phone: "" }));
                }}
                placeholder="Ej. 3312345678"
                className={`w-full rounded-2xl border px-4 py-3 outline-none focus:border-slate-400 ${
                  fieldErrors.phone ? "border-red-300" : "border-slate-200"
                }`}
              />
              {fieldErrors.phone ? (
                <p className="text-xs text-red-600">{fieldErrors.phone}</p>
              ) : null}
            </label>

            <label className="flex items-center gap-3 rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={withoutExternalNumber}
                onChange={(event) => {
                  setWithoutExternalNumber(event.target.checked);
                  setFieldErrors((prev) => ({ ...prev, externalNumber: "" }));
                }}
                className="h-4 w-4 rounded border-slate-300"
              />
              Cabaña o lugar sin número exterior
            </label>

            <label className="space-y-2 text-sm text-slate-700 md:col-span-2">
              <span className="font-semibold">
                Indicaciones adicionales para el repartidor
              </span>
              <textarea
                value={deliveryInstructions}
                onChange={(event) =>
                  setDeliveryInstructions(event.target.value)
                }
                placeholder="Ej. tocar el timbre 2, llamar al llegar, subir por el sendero"
                className="min-h-24 w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:border-slate-400"
              />
            </label>

            {errorMessage ? (
              <p className="text-sm text-red-600 md:col-span-2">
                {errorMessage}
              </p>
            ) : null}
          </div>

          <DialogFooter className="sticky bottom-0 border-t border-slate-100 bg-white px-6 pb-4 pt-5 sm:justify-end">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="inline-flex h-11 items-center justify-center rounded-2xl border border-slate-200 px-5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex h-11 items-center justify-center rounded-2xl bg-orange-500 px-5 text-sm font-semibold text-white transition hover:bg-orange-600 disabled:opacity-60"
            >
              {saving ? "Guardando..." : "Guardar dirección"}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
