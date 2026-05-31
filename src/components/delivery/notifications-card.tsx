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
import { fetchWithSession } from "@/lib/client-auth";

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
      try {
        setThreadLoading(true);
        setThreadError("");

        const query = supportOrderNumericId
          ? `?order_id=${encodeURIComponent(String(supportOrderNumericId))}`
          : "";
        const response = await fetchWithSession(
          `/api/delivery/support${query}`,
          {
            headers: {
              "Content-Type": "application/json",
            },
          },
        );
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

    const message = draftMessage.trim();
    if (!message) {
      setThreadError("Escribe un mensaje antes de enviarlo.");
      return;
    }

    try {
      setSendingMessage(true);
      setThreadError("");

      const response = await fetchWithSession("/api/delivery/support", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
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
      <Card className="gap-0 overflow-hidden rounded-[24px] border border-[#E8DCCB] bg-[#FFF9F2] py-0 text-[#3B2D25] shadow-[0_8px_30px_rgba(0,0,0,0.04)]">
        <CardHeader className="border-b border-[#E8DCCB] bg-[#FFF9F2] pb-6 text-[#3B2D25]">
          <CardTitle className="flex items-center gap-2 text-lg font-semibold">
            <Bell className="h-5 w-5" />
            Notificaciones
          </CardTitle>
          <CardDescription className="text-sm text-[#6f5d4c]">
            Actualizaciones reales de tus pedidos y mensajes de soporte.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 bg-[#F7F1E8] pt-6">
          {isLoading ? (
            <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-[#E8DCCB] bg-[#FCF6EE] p-6 text-center text-sm text-[#6d5945] shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]">
              <CheckCircle2 className="h-5 w-5" />
              Cargando notificaciones...
            </div>
          ) : error ? (
            <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-[#EDCDB4] bg-[#FFF3E9] p-6 text-center text-sm text-[#9a5b36] shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]">
              <AlertTriangle className="h-5 w-5" />
              {error}
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-[#E8DCCB] bg-[#FCF6EE] p-6 text-center text-sm text-[#6d5945] shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]">
              <CheckCircle2 className="h-5 w-5" />
              No tienes notificaciones nuevas.
            </div>
          ) : (
            <ul className="space-y-3">
              {notifications.map((notification) => (
                <li
                  key={notification.id}
                  className="flex items-start gap-3 rounded-2xl border border-[#E8DCCB] bg-[#FFFDF9] p-4 shadow-[0_8px_24px_rgba(0,0,0,0.03)]"
                >
                  <span
                    className={`mt-1 h-2 w-2 rounded-full ${
                      notification.unread ? "bg-[#FF6A00]" : "bg-[#F3D6B8]"
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
                    <p className="text-xs text-[#7c654f]">
                      {notification.message}
                    </p>
                    <p className="text-[10px] uppercase tracking-[0.3em] text-[#a1866f]">
                      {notification.createdAt
                        ? formatRelativeTime(notification.createdAt)
                        : notification.timestamp}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <div className="grid gap-3 border-t border-dashed border-[#E8DCCB] pt-4 text-sm text-[#6F5D4C]">
            <button
              type="button"
              onClick={() => {
                setDraftMessage("");
                setDialogMode("support");
              }}
              className="flex items-center justify-center gap-2 rounded-xl border border-[#E8DCCB] bg-[#FFFDF9] px-4 py-2 font-semibold text-orange-700 shadow-[0_6px_18px_rgba(0,0,0,0.03)] hover:bg-white"
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
              className="flex items-center justify-center gap-2 rounded-xl border border-[#E8DCCB] bg-[#FFFDF9] px-4 py-2 font-semibold text-[#b36a2b] shadow-[0_6px_18px_rgba(0,0,0,0.03)] hover:bg-white"
            >
              <AlertTriangle className="h-4 w-4" />
              Incidencia en entrega
            </button>
            <p className="text-xs text-[#8d755b]">
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
        <DialogContent className="max-w-lg border-[#E8DCCB] bg-[#FFF9F2] text-[#3B2D25] shadow-[0_8px_30px_rgba(0,0,0,0.04)]">
          <DialogHeader>
            <DialogTitle>{dialogTitle}</DialogTitle>
            <DialogDescription>{dialogDescription}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="max-h-64 space-y-3 overflow-y-auto rounded-2xl border border-[#E8DCCB] bg-[#FCF6EE] p-4">
              {threadLoading ? (
                <p className="text-sm text-[#8d755b]">
                  Cargando conversación...
                </p>
              ) : threadMessages.length === 0 ? (
                <p className="text-sm text-[#8d755b]">
                  Aún no hay mensajes en esta conversación.
                </p>
              ) : (
                threadMessages.map((message) => (
                  <div
                    key={message.id}
                    className={`rounded-2xl px-4 py-3 text-sm shadow-sm ${
                      message.senderType === "user"
                        ? "ml-8 border border-[#EDCDB4] bg-[#FFF3E9] text-[#9a5b36]"
                        : "mr-8 border border-[#E8DCCB] bg-[#FFFDF9] text-[#6F5D4C]"
                    }`}
                  >
                    <p>{message.message}</p>
                    <p className="mt-2 text-[10px] uppercase tracking-[0.2em] text-[#a1866f]">
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
                className="w-full rounded-2xl border border-[#E8DCCB] bg-[#FFFDF9] px-4 py-3 text-sm text-[#3B2D25] outline-none ring-0 transition placeholder:text-[#a1866f] focus:border-orange-300"
              />
              {threadError ? (
                <p className="text-sm text-[#9a5b36]">{threadError}</p>
              ) : null}
            </div>
          </div>

          <DialogFooter>
            <button
              type="button"
              onClick={() => setDialogMode(null)}
              className="rounded-xl border border-[#E8DCCB] px-4 py-2 text-sm font-semibold text-[#6F5D4C] transition hover:bg-[#FCF6EE]"
            >
              Cerrar
            </button>
            <button
              type="button"
              onClick={handleSendMessage}
              disabled={sendingMessage}
              className="rounded-xl bg-[#FF6A00] px-4 py-2 text-sm font-semibold text-[#FFFDF8] transition hover:bg-[#EA580C] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {sendingMessage ? "Enviando..." : "Enviar mensaje"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
