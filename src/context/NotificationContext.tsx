"use client";

import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Info,
  X,
} from "lucide-react";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type NotificationTone = "success" | "error" | "warning" | "info";

type NotificationInput = {
  title?: string;
  message: string;
  tone?: NotificationTone;
  duration?: number;
};

type NotificationItem = NotificationInput & {
  id: string;
};

type NotificationContextValue = {
  notify: (input: NotificationInput | string) => void;
  dismiss: (id: string) => void;
  success: (message: string, title?: string) => void;
  error: (message: string, title?: string) => void;
  warning: (message: string, title?: string) => void;
  info: (message: string, title?: string) => void;
};

const NotificationContext = createContext<NotificationContextValue | undefined>(
  undefined,
);

let globalNotify: ((input: NotificationInput | string) => void) | null = null;

const DEFAULT_DURATION = 3600;

const toneStyles: Record<
  NotificationTone,
  {
    shell: string;
    icon: ReactNode;
    defaultTitle: string;
  }
> = {
  success: {
    shell:
      "border-emerald-400/18 bg-[linear-gradient(180deg,rgba(16,42,31,0.92)_0%,rgba(9,27,20,0.98)_100%)] text-emerald-50 shadow-[0_20px_40px_rgba(6,78,59,0.18)]",
    icon: <CheckCircle2 className="h-4 w-4 text-emerald-300" />,
    defaultTitle: "Listo",
  },
  error: {
    shell:
      "border-rose-400/18 bg-[linear-gradient(180deg,rgba(56,19,28,0.92)_0%,rgba(33,11,17,0.98)_100%)] text-rose-50 shadow-[0_20px_40px_rgba(127,29,29,0.2)]",
    icon: <AlertCircle className="h-4 w-4 text-rose-300" />,
    defaultTitle: "No se pudo completar",
  },
  warning: {
    shell:
      "border-amber-400/18 bg-[linear-gradient(180deg,rgba(63,36,12,0.92)_0%,rgba(39,23,8,0.98)_100%)] text-amber-50 shadow-[0_20px_40px_rgba(120,53,15,0.2)]",
    icon: <AlertTriangle className="h-4 w-4 text-amber-300" />,
    defaultTitle: "Atención",
  },
  info: {
    shell:
      "border-sky-400/18 bg-[linear-gradient(180deg,rgba(18,34,53,0.92)_0%,rgba(10,20,33,0.98)_100%)] text-sky-50 shadow-[0_20px_40px_rgba(30,64,175,0.18)]",
    icon: <Info className="h-4 w-4 text-sky-300" />,
    defaultTitle: "Información",
  },
};

function normalizeNotificationInput(
  input: NotificationInput | string,
): NotificationInput {
  if (typeof input === "string") {
    return {
      message: input,
      tone: inferToneFromMessage(input),
    };
  }

  return {
    ...input,
    tone: input.tone ?? inferToneFromMessage(input.message),
  };
}

function inferToneFromMessage(message: string): NotificationTone {
  const normalized = message.toLowerCase();

  if (
    normalized.includes("error") ||
    normalized.includes("no se pudo") ||
    normalized.includes("inválid") ||
    normalized.includes("incorrect") ||
    normalized.includes("fall")
  ) {
    return "error";
  }

  if (
    normalized.includes("atención") ||
    normalized.includes("advertencia") ||
    normalized.includes("necesitas") ||
    normalized.includes("revisa")
  ) {
    return "warning";
  }

  if (
    normalized.includes("correctamente") ||
    normalized.includes("éxito") ||
    normalized.includes("guardado") ||
    normalized.includes("creada") ||
    normalized.includes("creado")
  ) {
    return "success";
  }

  return "info";
}

function sanitizeNotificationMessage(message: string) {
  return message
    .replace(/^❌\s*/u, "")
    .replace(/^✅\s*/u, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function notify(input: NotificationInput | string) {
  globalNotify?.(input);
}

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const originalAlertRef = useRef<typeof window.alert | null>(null);

  const dismiss = useCallback((id: string) => {
    setItems((current) => current.filter((item) => item.id !== id));
  }, []);

  const notifyValue = useCallback((input: NotificationInput | string) => {
    const normalized = normalizeNotificationInput(input);
    const item: NotificationItem = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      title: normalized.title,
      message: sanitizeNotificationMessage(normalized.message),
      tone: normalized.tone ?? "info",
      duration: normalized.duration ?? DEFAULT_DURATION,
    };

    setItems((current) => [...current, item].slice(-4));
  }, []);

  useEffect(() => {
    globalNotify = notifyValue;
    return () => {
      globalNotify = null;
    };
  }, [notifyValue]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    originalAlertRef.current = window.alert.bind(window);
    window.alert = (message?: string) => {
      notifyValue({
        message: sanitizeNotificationMessage(String(message ?? "")),
        tone: inferToneFromMessage(String(message ?? "")),
      });
    };

    return () => {
      if (originalAlertRef.current) {
        window.alert = originalAlertRef.current;
      }
    };
  }, [notifyValue]);

  useEffect(() => {
    if (items.length === 0) return;

    const timers = items.map((item) =>
      window.setTimeout(() => {
        dismiss(item.id);
      }, item.duration ?? DEFAULT_DURATION),
    );

    return () => {
      timers.forEach((timer) => {
        window.clearTimeout(timer);
      });
    };
  }, [dismiss, items]);

  const value = useMemo<NotificationContextValue>(
    () => ({
      notify: notifyValue,
      dismiss,
      success: (message, title) =>
        notifyValue({ message, title, tone: "success" }),
      error: (message, title) => notifyValue({ message, title, tone: "error" }),
      warning: (message, title) =>
        notifyValue({ message, title, tone: "warning" }),
      info: (message, title) => notifyValue({ message, title, tone: "info" }),
    }),
    [dismiss, notifyValue],
  );

  return (
    <NotificationContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[80] flex justify-center px-3 pb-[calc(env(safe-area-inset-bottom)+0.9rem)] pt-6 sm:px-4">
        <div className="flex w-full max-w-md flex-col gap-2.5">
          {items.map((item) => {
            const tone = toneStyles[item.tone ?? "info"];

            return (
              <output
                key={item.id}
                aria-live="polite"
                className={cn(
                  "pointer-events-auto translate-y-0 rounded-[22px] border px-3.5 py-3 text-left backdrop-blur-xl transition-all duration-300 animate-in slide-in-from-bottom-4 fade-in sm:px-4",
                  tone.shell,
                )}
              >
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/6">
                    {tone.icon}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold leading-5 text-white">
                      {item.title || tone.defaultTitle}
                    </p>
                    <p className="mt-0.5 text-[13px] leading-5 text-white/74">
                      {item.message}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => dismiss(item.id)}
                    className="h-8 w-8 rounded-full p-0 text-white/52 hover:bg-white/8 hover:text-white"
                    aria-label="Cerrar notificación"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </output>
            );
          })}
        </div>
      </div>
    </NotificationContext.Provider>
  );
}

export function useNotify() {
  const context = useContext(NotificationContext);

  if (!context) {
    throw new Error("useNotify debe usarse dentro de un NotificationProvider");
  }

  return context;
}
