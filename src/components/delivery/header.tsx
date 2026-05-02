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
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface DeliveryHeaderProps {
  driverName?: string;
  serviceArea?: string;
  isAvailable?: boolean;
  pendingOrders?: number;
  completedToday?: number;
  lastSync?: string;
  onLogout?: () => void;
  onOpenSettings?: () => void;
  onReportIncident?: (payload: { type: string; notes: string }) => void;
  onChatMessage?: (message: string) => void;
}

export function DeliveryHeader({
  driverName = "Repartidor",
  serviceArea = "Zona Norte",
  isAvailable = true,
  pendingOrders = 0,
  completedToday = 0,
  lastSync = "Hace 2 min",
  onLogout,
  onOpenSettings,
  onReportIncident,
  onChatMessage,
}: DeliveryHeaderProps) {
  const [isActive, setIsActive] = useState(true);
  const [isPaused, setIsPaused] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessage, setChatMessage] = useState("");
  const [reportOpen, setReportOpen] = useState(false);
  const [reportType, setReportType] = useState("clima");
  const [reportNotes, setReportNotes] = useState("");
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const availabilityLabel = useMemo(
    () => (isActive ? "Activo" : "Inactivo"),
    [isActive],
  );

  useEffect(() => {
    setIsActive(isAvailable);
    setIsPaused(!isAvailable);
  }, [isAvailable]);

  const handlePauseToggle = () => {
    setIsPaused((prev) => !prev);
    setActionMessage(
      !isPaused
        ? "Pausaste las entregas por 10 minutos. Recuerda reanudar cuando estés listo."
        : "Has reanudado tus entregas.",
    );
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
    <header className="relative isolate overflow-hidden rounded-[24px] bg-[#006b3f] p-5 text-white shadow-2xl shadow-emerald-950/20 sm:p-6">
      <div className="pointer-events-none absolute inset-0 z-0 bg-[radial-gradient(circle_at_top_left,rgba(25,190,104,0.5)_0%,rgba(0,107,63,0.82)_42%,rgba(0,75,45,1)_100%)]" />
      <button
        type="button"
        onClick={onOpenSettings}
        className="absolute right-4 top-4 z-20 inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-white/20 bg-white/10 text-white shadow-lg backdrop-blur transition hover:bg-white/20"
        aria-label="Abrir configuración del repartidor"
      >
        <Settings className="h-5 w-5" />
      </button>
      <div className="relative z-10 grid gap-5 lg:grid-cols-[1.25fr,1fr]">
        <div className="space-y-4">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-100/75">
            Repartidor autorizado
          </p>
          <div>
            <h1 className="text-2xl font-extrabold leading-tight sm:text-3xl">
              Hola, {driverName}
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-emerald-50/85 sm:text-base">
              Revisa entregas asignadas, confirma ubicaciones y mantén tu estado
              de servicio al día durante el turno.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl bg-white/12 p-4 backdrop-blur">
              <p className="text-xs font-semibold text-emerald-100/70">
                Entregas actuales
              </p>
              <p className="mt-2 text-3xl font-extrabold">{pendingOrders}</p>
              <p className="mt-2 text-xs font-semibold text-emerald-100/70">
                Completadas hoy: {completedToday}
              </p>
            </div>
            <div className="rounded-2xl bg-white/12 p-4 backdrop-blur">
              <p className="text-xs font-semibold text-emerald-100/70">Zona</p>
              <p className="mt-2 text-base font-extrabold">{serviceArea}</p>
              <p className="text-xs text-emerald-50/65">{lastSync}</p>
            </div>
            <div className="rounded-2xl bg-white/12 p-4 backdrop-blur">
              <p className="text-xs font-semibold text-emerald-100/70">
                Estado
              </p>
              <p className="mt-2 flex items-center gap-2 text-base font-extrabold">
                <span
                  className={cn(
                    "h-2.5 w-2.5 rounded-full",
                    isActive ? "bg-emerald-300" : "bg-rose-300",
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
            onClick={() => setIsActive((prev) => !prev)}
            className={cn(
              "flex h-12 items-center justify-center gap-2 rounded-2xl border-0 px-5 text-sm font-extrabold shadow-lg transition",
              isActive
                ? "bg-[#00c853] text-white hover:bg-[#00b84c]"
                : "bg-rose-500 text-white hover:bg-rose-600",
            )}
          >
            <CirclePower className="h-4 w-4" />
            {availabilityLabel}
          </Button>

          <div className="grid gap-3 sm:grid-cols-2">
            <Button
              type="button"
              className={cn(
                "flex h-12 items-center justify-center gap-2 rounded-2xl border-0 px-4 text-sm font-extrabold text-white shadow-lg transition",
                isPaused
                  ? "bg-amber-500 hover:bg-amber-600"
                  : "bg-amber-400 hover:bg-amber-500",
              )}
              onClick={handlePauseToggle}
            >
              <PauseCircle className="h-4 w-4" />
              {isPaused ? "Reanudar" : "Pausar entregas"}
            </Button>
            <Button
              type="button"
              className="flex h-12 items-center justify-center gap-2 rounded-2xl border-0 bg-blue-500 px-4 text-sm font-extrabold text-white shadow-lg transition hover:bg-blue-600"
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
              className="flex h-12 items-center justify-center gap-2 rounded-2xl border-0 bg-pink-500 px-4 text-sm font-extrabold text-white shadow-lg transition hover:bg-pink-600"
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
              className="flex h-12 items-center justify-center gap-2 rounded-2xl border-0 bg-rose-600 px-5 text-sm font-extrabold text-white shadow-lg hover:bg-rose-700"
              onClick={onLogout}
            >
              <LogOut className="h-4 w-4" />
              Cerrar sesión
            </Button>
          </div>
        </div>
      </div>

      {actionMessage ? (
        <p className="relative z-20 mt-4 rounded-2xl border border-white/20 bg-white/10 px-4 py-3 text-xs text-white/90">
          {actionMessage}
        </p>
      ) : null}

      {chatOpen ? (
        <div className="relative z-20 mt-4 rounded-2xl border border-orange-200/60 bg-white p-4 text-sm text-orange-900 shadow-2xl">
          <p className="font-semibold">Chat con soporte</p>
          <p className="text-xs text-orange-800/70">
            Soporte Gogi Eats responde en menos de 3 minutos.
          </p>
          <div className="mt-3 space-y-2 rounded-xl border border-orange-100 bg-white p-3 text-xs text-orange-900">
            <p className="font-semibold">Equipo Gogi Eats</p>
            <p>Hola {driverName}, ¿todo bien en tu ruta?</p>
          </div>
          <textarea
            className="mt-3 w-full rounded-xl border border-orange-200 bg-white p-2 text-sm text-orange-900 outline-none focus:border-orange-400"
            rows={2}
            placeholder="Escribe un mensaje rápido..."
            value={chatMessage}
            onChange={(event) => setChatMessage(event.target.value)}
          />
          <Button
            type="button"
            className="mt-2 rounded-full bg-orange-600 text-white hover:bg-orange-700"
            onClick={handleChatSend}
          >
            Enviar
          </Button>
        </div>
      ) : null}

      {reportOpen ? (
        <form
          onSubmit={handleReportSubmit}
          className="relative z-20 mt-4 space-y-3 rounded-2xl border border-rose-200/60 bg-white p-4 text-sm text-rose-900 shadow-2xl"
        >
          <p className="font-semibold">Reportar incidencia</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="text-xs font-semibold text-rose-800">
              Motivo
              <select
                value={reportType}
                onChange={(event) => setReportType(event.target.value)}
                className="mt-1 w-full rounded-xl border border-rose-200 bg-white p-2 text-sm text-rose-900 focus:border-rose-400"
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
          <label className="text-xs font-semibold text-rose-800">
            Detalles
            <textarea
              value={reportNotes}
              onChange={(event) => setReportNotes(event.target.value)}
              rows={3}
              className="mt-1 w-full rounded-xl border border-rose-200 bg-white p-2 text-sm text-rose-900 focus:border-rose-400"
              placeholder="Describe brevemente la incidencia"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <Button
              type="submit"
              className="rounded-full bg-rose-600 text-white hover:bg-rose-700"
            >
              Enviar reporte
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="rounded-full text-rose-600 hover:bg-rose-100"
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
