"use client";

import {
  AlertTriangle,
  CirclePower,
  LogOut,
  MessageCircle,
  PauseCircle,
  Settings,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { UserAvatar } from "@/components/shared/user-avatar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface DeliveryHeaderProps {
  driverName?: string;
  profileImageUrl?: string | null;
  serviceArea?: string;
  isAvailable?: boolean;
  operationalStatus?: string;
  operationalStatusLabel?: string;
  pendingOrders?: number;
  completedToday?: number;
  lastSync?: string;
  onLogout?: () => void;
  onOpenSettings?: () => void;
  onAvailabilityChange?: (isAvailable: boolean) => void | Promise<void>;
  onGoOffline?: () => void | Promise<void>;
  onReportIncident?: (payload: { type: string; notes: string }) => void;
  onChatMessage?: (message: string) => void;
}

export function DeliveryHeader({
  driverName = "Repartidor",
  profileImageUrl = null,
  serviceArea = "Sin zona configurada",
  isAvailable = true,
  operationalStatus,
  operationalStatusLabel,
  pendingOrders = 0,
  completedToday = 0,
  lastSync = "Actualizado ahora",
  onLogout,
  onOpenSettings,
  onAvailabilityChange,
  onGoOffline,
  onReportIncident,
  onChatMessage,
}: DeliveryHeaderProps) {
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessage, setChatMessage] = useState("");
  const [reportOpen, setReportOpen] = useState(false);
  const [reportType, setReportType] = useState("clima");
  const [reportNotes, setReportNotes] = useState("");
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const normalizedOperationalStatus = String(operationalStatus ?? "")
    .trim()
    .toUpperCase();
  const isOperationalActive =
    normalizedOperationalStatus === "ACTIVE" ||
    (!normalizedOperationalStatus && isAvailable);
  const availabilityLabel = useMemo(
    () =>
      operationalStatusLabel ||
      (isOperationalActive ? "Activo" : "En descanso"),
    [isOperationalActive, operationalStatusLabel],
  );
  const isAdminLocked =
    availabilityLabel === "Suspendido" || availabilityLabel === "Desactivado";

  useEffect(() => {
    if (isOperationalActive) {
      setActionMessage((current) =>
        current ===
        "Pausaste las entregas. Recuerda reanudar cuando estés listo."
          ? null
          : current,
      );
    }
  }, [isOperationalActive]);

  const handleAvailabilityChange = async (nextIsAvailable: boolean) => {
    if (isAdminLocked) {
      setActionMessage(
        "Tu estado operativo requiere revisión del administrador general.",
      );
      return;
    }

    console.log("Estado delivery antes:", normalizedOperationalStatus);
    console.log("Cambiando estado a:", nextIsAvailable ? "ACTIVE" : "RESTING");
    setActionMessage(null);
    try {
      await onAvailabilityChange?.(nextIsAvailable);
      setActionMessage(
        nextIsAvailable
          ? "Ya estás activo para recibir pedidos"
          : "Pausaste las entregas. Recuerda reanudar cuando estés listo.",
      );
    } catch (error) {
      setActionMessage(
        error instanceof Error
          ? error.message
          : "No se pudo actualizar tu estado operativo.",
      );
    }
  };

  const handleReportSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!reportNotes.trim()) {
      setActionMessage("Describe brevemente la incidencia.");
      return;
    }
    onReportIncident?.({ type: reportType, notes: reportNotes.trim() });
    setActionMessage(
      `Incidencia enviada: ${reportType}. Soporte fue notificado.`,
    );
    setReportNotes("");
    setReportOpen(false);
  };

  const handleChatSend = () => {
    if (!chatMessage.trim()) {
      setActionMessage("Escribe un mensaje para soporte.");
      return;
    }
    onChatMessage?.(chatMessage.trim());
    setActionMessage("Mensaje enviado a soporte. Te responderán pronto.");
    setChatMessage("");
    setChatOpen(false);
  };

  return (
    <header className="relative isolate overflow-hidden rounded-[24px] border border-[#E7D8C7] bg-[#FFF9F2] p-4 text-[#4B3425] shadow-[0_8px_30px_rgba(180,140,90,0.08)] sm:p-6">
      <div className="pointer-events-none absolute inset-0 z-0 bg-[radial-gradient(circle_at_top_left,rgba(255,251,245,0.98)_0%,rgba(247,239,228,0.98)_45%,rgba(243,232,218,1)_100%)]" />
      <button
        type="button"
        onClick={onOpenSettings}
        className="absolute right-4 top-4 z-20 inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-[#E7D8C7] bg-[#FFF9F2] text-[#7c5b3c] shadow-[0_8px_30px_rgba(180,140,90,0.08)] transition hover:bg-white sm:h-11 sm:w-11"
        aria-label="Abrir configuración del repartidor"
      >
        <Settings className="h-5 w-5" />
      </button>
      <div className="relative z-10 grid gap-5 lg:grid-cols-[1.25fr,1fr]">
        <div className="space-y-4">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#b36a2b]">
            Repartidor autorizado
          </p>
          <div className="flex items-start justify-between gap-4 pr-12 sm:items-center sm:pr-14">
            <div className="min-w-0">
              <h1 className="fluid-title max-w-3xl font-extrabold text-balance">
                Hola, {driverName}
              </h1>
              <p className="fluid-subtitle mt-2 max-w-2xl text-[#6e5d4b]">
                Revisa entregas asignadas, confirma ubicaciones y mantén tu
                estado de servicio al día durante el turno.
              </p>
            </div>
            <UserAvatar
              name={driverName}
              src={profileImageUrl}
              size={56}
              className="border-2 border-[#e98a4a] !bg-[#f6ebdd] text-[#222222] shadow-[0_8px_24px_rgba(233,138,74,0.18)]"
              textClassName="text-[#222222]"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <div className="rounded-2xl border border-[#E7D8C7] bg-[#F6F0E7] p-4">
              <p className="text-xs font-semibold text-[#8d755b]">
                Entregas actuales
              </p>
              <p className="mt-2 text-3xl font-extrabold text-[#2f2419]">
                {pendingOrders}
              </p>
              <p className="mt-2 text-xs font-semibold text-[#8d755b]">
                Completadas hoy: {completedToday}
              </p>
            </div>
            <div className="rounded-2xl border border-[#E7D8C7] bg-[#F6F0E7] p-4">
              <p className="text-xs font-semibold text-[#8d755b]">Zona</p>
              <p className="mt-2 text-base font-extrabold text-[#2f2419]">
                {serviceArea}
              </p>
              <p className="text-xs text-[#8d755b]">{lastSync}</p>
            </div>
            <div className="rounded-2xl border border-[#E7D8C7] bg-[#F6F0E7] p-4">
              <p className="text-xs font-semibold text-[#8d755b]">Estado</p>
              <p className="mt-2 flex items-center gap-2 text-base font-extrabold text-[#2f2419]">
                <span
                  className={cn(
                    "h-2.5 w-2.5 rounded-full",
                    isOperationalActive ? "bg-[#6e7f52]" : "bg-[#e98a4a]",
                  )}
                />
                {availabilityLabel}
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-col justify-end gap-3 text-sm">
          <Button
            type="button"
            variant="outline"
            disabled={isAdminLocked}
            onClick={() => handleAvailabilityChange(!isOperationalActive)}
            className={cn(
              "flex h-12 items-center justify-center gap-2 rounded-2xl border-0 px-5 text-sm font-extrabold shadow-[0_8px_30px_rgba(180,140,90,0.08)] transition",
              isOperationalActive
                ? "!bg-[#6e7f52] text-[#fffffd] hover:!bg-[#5d6d44]"
                : "!bg-[#e98a4a] text-[#fffffd] hover:!bg-[#d97836]",
              isAdminLocked && "!bg-[#8b8b8b] opacity-80",
            )}
          >
            <CirclePower className="h-4 w-4" />
            {availabilityLabel}
          </Button>

          <div className="grid gap-3 sm:grid-cols-2">
            <Button
              type="button"
              disabled={isAdminLocked}
              className={cn(
                "flex h-12 items-center justify-center gap-2 rounded-2xl border-0 px-4 text-sm font-extrabold text-[#FFFDF8] shadow-[0_8px_30px_rgba(180,140,90,0.08)] transition",
                !isOperationalActive
                  ? "!bg-[#6e7f52] hover:!bg-[#5d6d44]"
                  : "!bg-[#e98a4a] hover:!bg-[#d97836]",
                isAdminLocked && "!bg-[#8b8b8b] opacity-80",
              )}
              onClick={() => handleAvailabilityChange(!isOperationalActive)}
            >
              <PauseCircle className="h-4 w-4" />
              {isOperationalActive ? "Pausar entregas" : "Reanudar entregas"}
            </Button>
            <Button
              type="button"
              className="flex h-12 items-center justify-center gap-2 rounded-2xl border border-[#e98a4a] !bg-[#f6ebdd] px-4 text-sm font-extrabold text-[#222222] shadow-[0_8px_30px_rgba(180,140,90,0.08)] transition hover:!bg-[#fff5ec]"
              onClick={() => {
                setChatOpen((prev) => !prev);
                setReportOpen(false);
              }}
            >
              <MessageCircle className="h-4 w-4" />
              Chat con soporte
            </Button>
            <Button
              type="button"
              className="flex h-12 items-center justify-center gap-2 rounded-2xl border-0 !bg-[#e98a4a] px-4 text-sm font-extrabold text-[#fffffd] shadow-[0_8px_30px_rgba(180,140,90,0.08)] transition hover:!bg-[#d97836]"
              onClick={() => {
                setReportOpen((prev) => !prev);
                setChatOpen(false);
              }}
            >
              <AlertTriangle className="h-4 w-4" />
              Reportar incidencia
            </Button>
            <Button
              variant="destructive"
              className="flex h-12 items-center justify-center gap-2 rounded-2xl border-0 !bg-[#222222] px-5 text-sm font-extrabold text-[#fffffd] shadow-[0_8px_30px_rgba(180,140,90,0.08)] hover:!bg-[#3a3a3a]"
              onClick={async () => {
                await onGoOffline?.();
                onLogout?.();
              }}
            >
              <LogOut className="h-4 w-4" />
              Desconectar
            </Button>
          </div>
        </div>
      </div>

      {actionMessage ? (
        <p className="relative z-20 mt-4 rounded-2xl border border-[#E7D8C7] bg-[#FFF9F2] px-4 py-3 text-xs text-[#6F5D4C] shadow-[0_8px_30px_rgba(180,140,90,0.08)]">
          {actionMessage}
        </p>
      ) : null}

      {chatOpen ? (
        <div className="relative z-20 mt-4 rounded-2xl border border-[#E7D8C7] bg-[#FFF9F2] p-4 text-sm text-[#4B3425] shadow-[0_8px_30px_rgba(180,140,90,0.08)]">
          <p className="font-semibold">Chat con soporte</p>
          <p className="text-xs text-[#8d755b]">
            Soporte Gogi Eats responde en menos de 3 minutos.
          </p>
          <div className="mt-3 space-y-2 rounded-xl border border-[#E7D8C7] bg-[#F6F0E7] p-3 text-xs text-[#4B3425]">
            <p className="font-semibold">Equipo Gogi Eats</p>
            <p>Hola {driverName}, ¿todo bien en tu ruta?</p>
          </div>
          <textarea
            className="mt-3 w-full rounded-xl border border-[#E8DCCB] bg-[#FFFDFD] p-2 text-sm font-semibold text-[#222222] outline-none transition placeholder:text-[#8b8b8b] focus:border-[#e98a4a] focus:ring-2 focus:ring-[#e98a4a]/20 disabled:cursor-not-allowed disabled:bg-[#f6ebdd] disabled:text-[#7A5A45]"
            rows={2}
            placeholder="Escribe un mensaje rápido..."
            value={chatMessage}
            onChange={(event) => setChatMessage(event.target.value)}
          />
          <Button
            type="button"
            className="mt-2 rounded-full bg-[#FF6A00] text-[#FFFDF8] hover:bg-orange-700"
            onClick={handleChatSend}
          >
            Enviar
          </Button>
        </div>
      ) : null}

      {reportOpen ? (
        <form
          onSubmit={handleReportSubmit}
          className="relative z-20 mt-4 space-y-3 rounded-2xl border border-[#E7D8C7] bg-[#FFF9F2] p-4 text-sm text-[#4B3425] shadow-[0_8px_30px_rgba(180,140,90,0.08)]"
        >
          <p className="font-semibold">Reportar incidencia</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="text-xs font-semibold text-[#7c654f]">
              Motivo
              <select
                value={reportType}
                onChange={(event) => setReportType(event.target.value)}
                className="mt-1 w-full rounded-xl border border-[#E8DCCB] bg-[#FFFDFD] p-2 text-sm font-semibold text-[#222222] outline-none transition placeholder:text-[#8b8b8b] focus:border-[#e98a4a] focus:ring-2 focus:ring-[#e98a4a]/20 disabled:cursor-not-allowed disabled:bg-[#f6ebdd] disabled:text-[#7A5A45]"
              >
                <option value="clima">Clima</option>
                <option value="trafico">Tráfico</option>
                <option value="cliente">Cliente</option>
                <option value="vehiculo">Vehículo</option>
                <option value="restaurante">Restaurante / Sucursal</option>
                <option value="cliente-no-quiso">Cliente no recibió</option>
                <option value="otro">Otro</option>
              </select>
            </label>
          </div>
          <label className="text-xs font-semibold text-[#7c654f]">
            Detalles
            <textarea
              value={reportNotes}
              onChange={(event) => setReportNotes(event.target.value)}
              rows={3}
              className="mt-1 w-full rounded-xl border border-[#E8DCCB] bg-[#FFFDFD] p-2 text-sm font-semibold text-[#222222] outline-none transition placeholder:text-[#8b8b8b] focus:border-[#e98a4a] focus:ring-2 focus:ring-[#e98a4a]/20 disabled:cursor-not-allowed disabled:bg-[#f6ebdd] disabled:text-[#7A5A45]"
              placeholder="Describe brevemente la incidencia"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <Button
              type="submit"
              className="rounded-full !bg-[#e98a4a] text-[#fffffd] hover:!bg-[#d97836]"
            >
              Enviar reporte
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="rounded-full text-[#222222] hover:bg-[#fff5ec]"
              onClick={() => setReportOpen(false)}
            >
              Cancelar
            </Button>
          </div>
        </form>
      ) : null}
    </header>
  );
}
