"use client";

import { usePathname, useRouter } from "next/navigation";
import { useMemo, useState, useEffect } from "react";
import { MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export function AdminChatBubble({ initialUnread = 3 }: { initialUnread?: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const [unread, setUnread] = useState(initialUnread);
  const [pulse, setPulse] = useState(false);

  const targetHref = useMemo(() => {
    const base = pathname?.startsWith("/admin") ? pathname : "/admin";
    const clean = base.split("#")[0];
    return `${clean}#chat-center`;
  }, [pathname]);

  const handleClick = () => {
    setUnread(0);
    router.push(targetHref);
    window.dispatchEvent(new CustomEvent("gogi:chat-open"));
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label="Abrir centro de chat"
      className={cn(
        "fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-full border border-rose-200/80 bg-gradient-to-r from-rose-500 to-red-500 px-5 py-3 text-sm font-semibold text-white shadow-[0_20px_45px_rgba(244,63,94,0.35)] transition hover:-translate-y-0.5 hover:shadow-[0_25px_60px_rgba(244,63,94,0.45)]",
        pulse ? "ring-4 ring-rose-200/60" : "",
      )}
    >
      <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/20">
        <MessageCircle className="h-5 w-5" />
      </span>
      <span>Chat admin</span>
      {unread > 0 ? (
        <span className="rounded-full bg-white/90 px-2 py-0.5 text-xs font-semibold text-rose-600">
          {unread}
        </span>
      ) : null}
    </button>
  );
}

export default AdminChatBubble;
