"use client";

import { AlertTriangle, Bell, CheckCircle2, MessageCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import type { DeliveryNotification } from "./types";

type SupportMode = "support" | "incident";

type SupportMessage = {
  id: number;
  senderId: number | null;
  senderType: string;
  message: string;
  fileUrl: string | null;
  messageType: string;
  createdAt: string;
};

interface NotificationsCardProps {
  notifications: DeliveryNotification[];
  isLoading?: boolean;
  error?: string;
  supportOrderId?: string | null;
}

function formatRelativeTime(value?: string) {
  if (!value) return "Hace un momento";

  const target = new Date(value).getTime();
  if (Number.isNaN(target)) return "Hace un momento";

  const diffMs = target - Date.now();
  const diffMinutes = Math.round(diffMs / (1000 * 60));
  const rtf = new Intl.RelativeTimeFormat("es-MX", { numeric: "auto" });

  if (Math.abs(diffMinutes) < 1) return "Hace un momento";
  if (Math.abs(diffMinutes) < 60) return rtf.format(diffMinutes, "minute");

  const diffHours = Math.round(diffMinutes / 60);
  if (Math.abs(diffHours) < 24) return rtf.format(diffHours, "hour");

  const diffDays = Math.round(diffHours / 24);
  return rtf.format(diffDays, "day");
}

function getNotificationTone(type: string) {
  if (type === "pago") return "text-emerald-700";
  if (type === "soporte" || type === "incidencia") return "text-sky-700";
  if (type === "pedido") return "text-orange-900";
  return "text-orange-900";
}

export function NotificationsCard({
  notifications,
  isLoading = false,
  error = "",
  supportOrderId = null,
}: NotificationsCardProps) {
  const [dialogMode, setDialogMode] = useState<SupportMode | null>(null);
  const [threadMessages, setThreadMessages] = useState<SupportMessage[]>([]);
  const [threadLoading, setThreadLoading] = useState(false);
  const [threadError, setThreadError] = useState("");
  const [draftMessage, setDraftMessage] = useState("");
  const [sendingMessage, setSendingMessage] = useState(false);

  const supportOrderNumericId = useMemo(() => {
    const parsed = Number(supportOrderId);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  }, [supportOrderId]);

  useEffect(() => {
    if (!dialogMode || typeof window === "undefined") return;

    async function fetchSupportThread() {
      const token =
        window.localStorage.getItem("token") ||
        window.localStorage.getItem("authToken") ||
        window.localStorage.getItem("accessToken");

      if (!token) {
        setThreadMessages([]);
        setThreadError("Debes iniciar sesión nuevamente.");
        return;
      }

      try {
        setThreadLoading(true);
        setThreadError("");

        const query = supportOrderNumericId
          ? `?order_id=${encodeURIComponent(String(supportOrderNumericId))}`
          : "";
        const response = await fetch(`/api/delivery/support${query}`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        const responseText = await response.text();
        let data: Record<string, unknown> = {};

        try {
          data = responseText ? JSON.parse(responseText) : {};
        } catch {
          data = { raw: responseText };
        }

        if (!response.ok || data.success === false) {
          console.error("Error cargando soporte del repartidor:", {
            status: response.status,
            statusText: response.statusText,
            responseText,
            data,
          });
          setThreadMessages([]);
          setThreadError(
            (typeof data.error === "string" && data.error) ||
              "No se pudo abrir el chat de soporte.",
          );
          return;
        }

        setThreadMessages(
          Array.isArray(data.messages)
            ? (data.messages as SupportMessage[])
            : [],
        );
      } catch (fetchError) {
        console.error("Error abriendo soporte del repartidor:", fetchError);
        setThreadMessages([]);
        setThreadError("No se pudo abrir el chat de soporte.");
      } finally {
        setThreadLoading(false);
      }
    }

    fetchSupportThread();
  }, [dialogMode, supportOrderNumericId]);

  async function handleSendMessage() {
    if (typeof window === "undefined") return;

    const token =
      window.localStorage.getItem("token") ||
      window.localStorage.getItem("authToken") ||
      window.localStorage.getItem("accessToken");

    if (!token) {
      setThreadError("Debes iniciar sesión nuevamente.");
      return;
    }

    const message = draftMessage.trim();
    if (!message) {
      setThreadError("Escribe un mensaje antes de enviarlo.");
      return;
    }

    try {
      setSendingMessage(true);
      setThreadError("");

      const response = await fetch("/api/delivery/support", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          order_id: supportOrderNumericId,
          message,
          mode: dialogMode ?? "support",
        }),
      });

      const responseText = await response.text();
      let data: Record<string, unknown> = {};

      try {
        data = responseText ? JSON.parse(responseText) : {};
      } catch {
        data = { raw: responseText };
      }

      if (!response.ok || data.success === false) {
        console.error("Error enviando mensaje de soporte:", {
          status: response.status,
          statusText: response.statusText,
          responseText,
          data,
        });
        setThreadError(
          (typeof data.error === "string" && data.error) ||
            "No se pudo enviar tu mensaje.",
        );
        return;
      }

      setThreadMessages((current) => [
        ...current,
        {
          id: Date.now(),
          senderId: null,
          senderType: "user",
          message,
          fileUrl: null,
          messageType: "text",
          createdAt: new Date().toISOString(),
        },
      ]);
      setDraftMessage("");
    } catch (sendError) {
      console.error("Error enviando soporte del repartidor:", sendError);
      setThreadError("No se pudo enviar tu mensaje.");
    } finally {
      setSendingMessage(false);
    }
  }

  const dialogTitle =
    dialogMode === "incident" ? "Incidencia en entrega" : "Chat con soporte";
  const dialogDescription =
    dialogMode === "incident"
      ? "Reporta un problema real de la entrega para que el equipo de soporte lo revise."
      : "Envía mensajes reales al equipo de soporte sobre tu entrega actual.";

  return (
    <>
      <Card className="overflow-hidden rounded-[26px] border border-white/20 bg-white/10 text-[#1f2d27] shadow-xl backdrop-blur-lg">
        <CardHeader className="border-b border-white/10 bg-gradient-to-r from-orange-400/30 via-orange-600/25 to-orange-900/25 pb-6 text-white">
          <CardTitle className="flex items-center gap-2 text-lg font-semibold">
            <Bell className="h-5 w-5" />
            Notificaciones
          </CardTitle>
          <CardDescription className="text-sm text-white/80">
            Actualizaciones importantes de tus pedidos y recordatorios del
            turno.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 pt-6">
          {isLoading ? (
            <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-orange-300/60 bg-orange-50/60 p-6 text-center text-sm text-orange-800/80 shadow-inner">
              <CheckCircle2 className="h-5 w-5" />
              Cargando notificaciones...
            </div>
          ) : error ? (
            <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-amber-300/60 bg-amber-50/70 p-6 text-center text-sm text-amber-900 shadow-inner">
              <AlertTriangle className="h-5 w-5" />
              {error}
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-orange-300/60 bg-orange-50/60 p-6 text-center text-sm text-orange-800/80 shadow-inner">
              <CheckCircle2 className="h-5 w-5" />
              No tienes notificaciones por ahora.
            </div>
          ) : (
            <ul className="space-y-3">
              {notifications.map((notification) => (
                <li
                  key={notification.id}
                  className="flex items-start gap-3 rounded-2xl border border-white/40 bg-white/70 p-4 shadow-lg backdrop-blur"
                >
                  <span
                    className={`mt-1 h-2 w-2 rounded-full ${
                      notification.unread ? "bg-orange-500" : "bg-slate-300"
                    }`}
                  />
                  <div className="flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p
                        className={`text-sm font-semibold ${getNotificationTone(notification.type)}`}
                      >
                        {notification.title}
                      </p>
                      {notification.unread ? (
                        <Badge
                          variant="outline"
                          className="border-orange-200/70 bg-orange-50/60 text-[10px] font-semibold uppercase tracking-[0.2em] text-orange-700"
                        >
                          Nuevo
                        </Badge>
                      ) : null}
                    </div>
                    <p className="text-xs text-orange-800/70">
                      {notification.message}
                    </p>
                    <p className="text-[10px] uppercase tracking-[0.3em] text-orange-900/50">
                      {notification.createdAt
                        ? formatRelativeTime(notification.createdAt)
                        : notification.timestamp}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <div className="grid gap-3 border-t border-dashed border-white/30 pt-4 text-sm text-orange-900/80">
            <button
              type="button"
              onClick={() => {
                setDraftMessage("");
                setDialogMode("support");
              }}
              className="flex items-center justify-center gap-2 rounded-xl border border-orange-400/60 bg-white/70 px-4 py-2 font-semibold text-orange-700 shadow hover:bg-white"
            >
              <MessageCircle className="h-4 w-4" />
              Abrir chat con soporte
            </button>
            <button
              type="button"
              onClick={() => {
                setDraftMessage("Incidencia en entrega: ");
                setDialogMode("incident");
              }}
              className="flex items-center justify-center gap-2 rounded-xl border border-amber-400/60 bg-white/70 px-4 py-2 font-semibold text-amber-700 shadow hover:bg-white"
            >
              <AlertTriangle className="h-4 w-4" />
              Incidencia en entrega
            </button>
            <p className="text-xs text-orange-900/60">
              Activa las notificaciones push para recibir nuevas órdenes y
              mensajes del administrador al instante.
            </p>
          </div>
        </CardContent>
      </Card>

      <Dialog
        open={dialogMode !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDialogMode(null);
            setThreadError("");
          }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{dialogTitle}</DialogTitle>
            <DialogDescription>{dialogDescription}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="max-h-64 space-y-3 overflow-y-auto rounded-2xl border border-slate-200 bg-slate-50 p-4">
              {threadLoading ? (
                <p className="text-sm text-slate-500">
                  Cargando conversación...
                </p>
              ) : threadMessages.length === 0 ? (
                <p className="text-sm text-slate-500">
                  Aún no hay mensajes en esta conversación.
                </p>
              ) : (
                threadMessages.map((message) => (
                  <div
                    key={message.id}
                    className={`rounded-2xl px-4 py-3 text-sm shadow-sm ${
                      message.senderType === "user"
                        ? "ml-8 bg-orange-100 text-orange-900"
                        : "mr-8 bg-white text-slate-700"
                    }`}
                  >
                    <p>{message.message}</p>
                    <p className="mt-2 text-[10px] uppercase tracking-[0.2em] text-slate-400">
                      {formatRelativeTime(message.createdAt)}
                    </p>
                  </div>
                ))
              )}
            </div>

            <div className="space-y-2">
              <textarea
                value={draftMessage}
                onChange={(event) => setDraftMessage(event.target.value)}
                rows={4}
                placeholder={
                  dialogMode === "incident"
                    ? "Describe claramente la incidencia de la entrega..."
                    : "Escribe tu mensaje para soporte..."
                }
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none ring-0 transition placeholder:text-slate-400 focus:border-orange-300"
              />
              {threadError ? (
                <p className="text-sm text-rose-600">{threadError}</p>
              ) : null}
            </div>
          </div>

          <DialogFooter>
            <button
              type="button"
              onClick={() => setDialogMode(null)}
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
            >
              Cerrar
            </button>
            <button
              type="button"
              onClick={handleSendMessage}
              disabled={sendingMessage}
              className="rounded-xl bg-orange-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {sendingMessage ? "Enviando..." : "Enviar mensaje"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
