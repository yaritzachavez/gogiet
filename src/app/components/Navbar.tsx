"use client";

import { Menu, ShoppingCart, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";

const CART_STORAGE_KEY = "gogi:cart";
const CART_UPDATED_EVENT = "gogi-cart-updated";

function hasPanelAccess(roles: string[] | undefined) {
  const normalizedRoles = Array.isArray(roles)
    ? roles.map((role) => String(role))
    : [];

  return normalizedRoles.some((role) =>
    [
      "ADMIN_GENERAL",
      "REPARTIDOR",
      "ADMIN_NEGOCIO",
      "VENDEDOR",
      "ADMIN",
      "DELIVERY",
      "MANAGER",
      "OWNER",
      "admin_general",
      "repartidor",
      "business_admin",
      "business_staff",
    ].includes(role),
  );
}

function getStoredCartCount() {
  if (typeof window === "undefined") return 0;

  try {
    const rawCart = window.localStorage.getItem(CART_STORAGE_KEY);
    if (!rawCart) return 0;

    const parsedCart = JSON.parse(rawCart) as Array<{ quantity?: number }>;

    return parsedCart.reduce(
      (total, item) => total + Math.max(0, Number(item.quantity) || 0),
      0,
    );
  } catch (error) {
    console.error("No se pudo leer el contador del carrito", error);
    return 0;
  }
}

export default function Navbar() {
  const { user, logout } = useAuth();
  const [mounted, setMounted] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [cartCount, setCartCount] = useState(0);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const syncCartCount = () => {
      setCartCount(getStoredCartCount());
    };

    syncCartCount();
    window.addEventListener("storage", syncCartCount);
    window.addEventListener(CART_UPDATED_EVENT, syncCartCount);

    return () => {
      window.removeEventListener("storage", syncCartCount);
      window.removeEventListener(CART_UPDATED_EVENT, syncCartCount);
    };
  }, []);

  const toggleMobileMenu = () => {
    setMobileMenuOpen(!mobileMenuOpen);
  };

  const closeMobileMenu = () => {
    setMobileMenuOpen(false);
  };

  if (!mounted) {
    return (
      <nav className="border-b border-orange-200/60 bg-orange-600 text-white shadow-sm">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between sm:h-20">
            <Link href="/" className="flex items-center gap-2">
              <span className="size-7 rounded-full border border-white/80 bg-white shadow-md sm:size-8" />
              <span className="hidden text-base font-extrabold tracking-wide text-white sm:inline">
                Gogi Eats
              </span>
            </Link>
          </div>
        </div>
      </nav>
    );
  }

  return (
    <nav className="border-b border-orange-200/60 bg-orange-600 text-white shadow-sm">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        {/* Desktop and Mobile Header */}
        <div className="flex h-16 sm:h-20 items-center justify-between">
          {/* Logo */}
          <div className="flex items-center flex-shrink-0">
            <Link href="/" className="flex items-center gap-2">
              <div className="relative h-7 w-7 overflow-hidden rounded-full border border-white/80 bg-white shadow-md sm:h-8 sm:w-8">
                <Image
                  src="/LOGO-NEW2.jpg"
                  alt="Gogi Eats"
                  fill
                  className="scale-[1.65] object-contain"
                  priority
                />
              </div>
              <span className="hidden text-base font-extrabold tracking-wide text-white sm:inline">
                Gogi Eats
              </span>
            </Link>
          </div>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center space-x-8">
            <Link
              href="/"
              className="text-white/80 transition-colors hover:text-white"
            >
              Inicio
            </Link>
            {user && (
              <Link
                href="/pedidos"
                className="text-white/80 transition-colors hover:text-white"
              >
                Mis pedidos
              </Link>
            )}
            {user && hasPanelAccess(user.roles) && (
              <Link
                href="/pickdash"
                className="text-white/80 transition-colors hover:text-white"
              >
                Paneles
              </Link>
            )}
          </div>

          {/* Desktop Auth Section */}
          <div className="hidden md:flex items-center space-x-4">
            {user ? (
              <>
                <Button
                  asChild
                  variant="ghost"
                  className="rounded-full border border-white/30 bg-white/10 text-white hover:bg-white/20"
                >
                  <Link href="/carrito" className="flex items-center gap-2">
                    <ShoppingCart className="h-4 w-4" />
                    <span>Carrito</span>
                    {cartCount > 0 ? (
                      <span className="inline-flex min-w-6 items-center justify-center rounded-full bg-orange-500 px-2 py-0.5 text-xs font-bold text-white">
                        {cartCount}
                      </span>
                    ) : null}
                  </Link>
                </Button>
                <span className="text-white/70 text-sm">Hola, {user.name}</span>
                <Button
                  variant="ghost"
                  onClick={logout}
                  className="text-white hover:bg-white/10"
                >
                  Cerrar sesión
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="ghost"
                  asChild
                  className="text-white hover:bg-white/10"
                >
                  <Link href="/auth?mode=login">Iniciar Sesión</Link>
                </Button>
                <Button
                  asChild
                  className="bg-white text-orange-700 hover:bg-orange-50"
                >
                  <Link href="/auth?mode=register">Registrarse</Link>
                </Button>
              </>
            )}
          </div>

          {/* Mobile Header Actions */}
          <div className="flex md:hidden items-center gap-3">
            {user && (
              <Button
                asChild
                variant="ghost"
                size="icon"
                className="text-white hover:bg-white/10"
              >
                <Link href="/carrito" aria-label="Carrito de compras">
                  <span className="relative block">
                    <ShoppingCart className="h-5 w-5" />
                    {cartCount > 0 ? (
                      <span className="absolute -right-2 -top-2 inline-flex min-w-5 items-center justify-center rounded-full bg-orange-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
                        {cartCount}
                      </span>
                    ) : null}
                  </span>
                </Link>
              </Button>
            )}

            {/* Mobile Menu Button */}
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleMobileMenu}
              className="text-white hover:bg-white/10"
              aria-label={mobileMenuOpen ? "Cerrar menú" : "Abrir menú"}
              aria-expanded={mobileMenuOpen}
            >
              {mobileMenuOpen ? (
                <X className="h-6 w-6" />
              ) : (
                <Menu className="h-6 w-6" />
              )}
            </Button>
          </div>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden pb-4 border-t border-white/10 pt-4">
            {/* Navigation Links */}
            <div className="flex flex-col space-y-3 mb-4">
              <Link
                href="/"
                className="text-white/80 hover:text-white transition-colors px-2 py-2"
                onClick={closeMobileMenu}
              >
                Inicio
              </Link>
              {user && (
                <Link
                  href="/pedidos"
                  className="text-white/80 hover:text-white transition-colors px-2 py-2"
                  onClick={closeMobileMenu}
                >
                  Mis pedidos
                </Link>
              )}
              {user && hasPanelAccess(user.roles) && (
                <Link
                  href="/pickdash"
                  className="text-white/80 hover:text-white transition-colors px-2 py-2"
                  onClick={closeMobileMenu}
                >
                  Paneles
                </Link>
              )}
            </div>

            {/* Mobile Auth Section */}
            <div className="border-t border-white/10 pt-4">
              {user ? (
                <div className="flex flex-col space-y-2">
                  <div className="text-white/70 text-sm px-2 py-2">
                    Hola, {user.name}
                  </div>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      logout();
                      closeMobileMenu();
                    }}
                    className="text-white hover:bg-white/10 w-full justify-start"
                  >
                    Cerrar sesión
                  </Button>
                </div>
              ) : (
                <div className="flex flex-col space-y-2">
                  <Button
                    variant="ghost"
                    asChild
                    className="text-white hover:bg-white/10 w-full justify-start"
                  >
                    <Link href="/auth?mode=login" onClick={closeMobileMenu}>
                      Iniciar Sesión
                    </Link>
                  </Button>
                  <Button
                    asChild
                    className="bg-white text-orange-700 hover:bg-orange-50 w-full"
                  >
                    <Link href="/auth?mode=register" onClick={closeMobileMenu}>
                      Registrarse
                    </Link>
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}
