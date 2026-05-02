"use client"

import type * as React from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { X } from "lucide-react"
import { cn } from "@/lib/utils"
import { DialogDescription } from "@/components/ui/dialog"

interface ResponsiveModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  icon?: React.ReactNode
  children: React.ReactNode
  footer?: React.ReactNode
}

export default function ResponsiveModal({ open, onOpenChange, title, icon, children, footer }: ResponsiveModalProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 " />

        {/* Mobile: Bottom Sheet */}
        <DialogPrimitive.Content
          className={cn(
            "fixed z-50 flex flex-col bg-zinc-900 shadow-lg",
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            // Mobile: slide from bottom
            "inset-x-0 bottom-0 max-h-[85vh] rounded-t-2xl",
            "data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom",
            // Desktop: centered modal
            "sm:inset-auto sm:left-1/2 sm:top-1/2 sm:max-h-[80vh] sm:w-full sm:max-w-2xl sm:rounded-2xl sm:-translate-x-1/2 sm:-translate-y-1/2",
            "sm:data-[state=closed]:slide-out-to-left-1/2 sm:data-[state=closed]:slide-out-to-top-[48%]",
            "sm:data-[state=open]:slide-in-from-left-1/2 sm:data-[state=open]:slide-in-from-top-[48%]",
            "sm:data-[state=closed]:zoom-out-95 sm:data-[state=open]:zoom-in-95",
          )}
          
        >

          <DialogDescription className="sr-only">
            Modifica los datos del usuario y guarda los cambios.
          </DialogDescription>
          {/* Header */}
          <div className="flex items-center justify-between border-b border-zinc-800 px-6 py-4">
            <div className="flex items-center gap-3">
              {icon}
              <DialogPrimitive.Title asChild>
                <h2 className="text-lg font-semibold text-white">{title}</h2>
              </DialogPrimitive.Title>
            </div>
            <DialogPrimitive.Close className="rounded-lg p-1.5 text-zinc-400 transition hover:bg-zinc-800 hover:text-white">
              <X className="h-5 w-5" />
              <span className="sr-only">Cerrar</span>
            </DialogPrimitive.Close>
          </div>

          {/* Body - Scrollable */}
          <div className="flex-1 overflow-y-auto px-6 py-5 scrollbar-hide">{children}</div>

          {/* Footer */}
          {footer && <div className="border-t border-zinc-800 px-6 py-4">{footer}</div>}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
