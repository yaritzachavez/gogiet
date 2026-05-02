"use client";

import { Search, Plus, Minus, Loader2 } from "lucide-react";
import Image from "next/image";
import { useParams } from "next/navigation";
import { useEffect, useState, useMemo, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import AddressRequiredDialog, { type SavedAddress } from "@/components/address/AddressRequiredDialog";
import { SupportChatWidget } from "@/components/support/SupportChatWidget";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// --- Constantes y Helpers ---
const ITEMS_PER_PAGE = 12;

function getProductImageSrc(imageUrl: string | null | undefined, thumbnailUrl?: string | null) {
  const rawValue = imageUrl ?? thumbnailUrl ?? null;
  if (!rawValue) return "/items/thumbnails/generic-item.png";
  const normalizedUrl = rawValue.trim();
  return normalizedUrl.startsWith("/public/") ? normalizedUrl.replace(/^\/public/, "") : normalizedUrl;
}

export default function BusinessDetailPage() {
  const { user } = useAuth();
  const params = useParams<{ id: string }>();
  const businessId = Number(params?.id ?? NaN);

  // --- Estados de Datos ---
  const [business, setBusiness] = useState<any | null>(null);
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // --- Estados de UI / Filtros ---
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [currentPage, setCurrentPage] = useState(1);
  
  // --- Estados de Personalización ---
  const [selectedProduct, setSelectedProduct] = useState<any | null>(null);
  const [customizeModalOpen, setCustomizeModalOpen] = useState(false);
  const [loadingCustomizations, setLoadingCustomizations] = useState(false);
  const [customizationGroups, setCustomizationGroups] = useState<any[]>([]);
  const [modalQuantity, setModalQuantity] = useState(1);

  // --- Estados de Carrito / Mensajes ---
  const [cartMessage, setCartMessage] = useState<string | null>(null);
  const [cartError, setCartError] = useState<string | null>(null);
  const [addingProductId, setAddingProductId] = useState<number | null>(null);
  const [addressDialogOpen, setAddressDialogOpen] = useState(false);
  
  // ✅ 1. Mapeo de dirección inicial para evitar error de tipos en build
  const initialAddress = useMemo(() => {
    if (!user?.address) return null;

    return {
      id: user.address.id,
      fullAddress: user.address.fullAddress,
      neighborhood: user.address.neighborhood,
      phone: user.address.phone,
      // Campos requeridos por SavedAddress pero que no vienen en el user simplificado
      placeType: "home",
      placeName: "Mi dirección",
      street: "",
      externalNumber: "",
      internalNumber: "",
      city: "",
      state: "",
      zipCode: "",
      references: "",
      lat: 0,
      lng: 0,
    } as unknown as SavedAddress;
  }, [user?.address]);

  const [savedAddress, setSavedAddress] = useState<SavedAddress | null>(initialAddress);

  // ✅ 2. Sincronizar estado local si el usuario carga después del montaje inicial
  useEffect(() => {
    if (initialAddress) {
      setSavedAddress(initialAddress);
    }
  }, [initialAddress]);

  // --- Carga de Datos del Negocio ---
  const fetchBusinessData = useCallback(async () => {
    if (Number.isNaN(businessId)) return;
    try {
      setLoading(true);
      const res = await fetch(`/api/shop/business/${businessId}`);
      if (!res.ok) throw new Error("Error al cargar negocio");
      const data = await res.json();
      setBusiness(data.business);
      setProducts(data.products || []);
    } catch (err) {
      setError("No pudimos cargar el menú.");
    } finally {
      setLoading(false);
    }
  }, [businessId]);

  useEffect(() => { fetchBusinessData(); }, [fetchBusinessData]);

  // --- Lógica de Personalización ---
  const openCustomizationModal = async (product: any) => {
    setSelectedProduct(product);
    setCustomizationGroups([]);
    setModalQuantity(1);
    setCustomizeModalOpen(true);
    setLoadingCustomizations(true);

    try {
      const res = await fetch(`/api/products/${product.id}/customizations`);
      const data = await res.json();
      if (data.success) setCustomizationGroups(data.groups);
    } catch (e) {
      setCartError("Error al cargar opciones");
    } finally {
      setLoadingCustomizations(false);
    }
  };

  // ✅ 3. Validación de dirección antes de agregar al carrito
  const handleAddToCart = async () => {
    if (!selectedProduct || !user) {
      if (!user) setCartError("Inicia sesión para comprar");
      return;
    }

    // Si no tiene dirección, abrir diálogo obligatorio
    if (!savedAddress) {
      setAddressDialogOpen(true);
      return;
    }

    setAddingProductId(selectedProduct.id);
    try {
      // Simulación de guardado en carrito
      setCartMessage("Agregado con éxito");
      setTimeout(() => setCartMessage(null), 3000);
      setCustomizeModalOpen(false);
    } catch (e) {
      setCartError("No se pudo agregar");
    } finally {
      setAddingProductId(null);
    }
  };

  // --- Filtrado y Paginación ---
  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCat = activeCategory === "all" || p.product_category_id.toString() === activeCategory;
      return matchesSearch && matchesCat;
    });
  }, [products, searchQuery, activeCategory]);

  const paginatedProducts = filteredProducts.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  if (loading) return (
    <div className="flex h-screen w-full items-center justify-center bg-[#f8f8f8]">
      <div className="text-center">
        <Loader2 className="mx-auto h-10 w-10 animate-spin text-orange-600" />
        <p className="mt-4 font-medium text-slate-600">Cargando menú...</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#f8f8f8]">
      <main className="mx-auto max-w-7xl px-4 py-8">
        {/* Header del Negocio */}
        <section className="bg-white rounded-[30px] p-8 border border-slate-200 shadow-sm flex flex-col md:flex-row gap-6 mb-8">
          <div className="relative h-32 w-32 shrink-0 rounded-3xl overflow-hidden bg-slate-100 border">
            <Image src={business?.avatar_url || "/generic-shop.png"} fill className="object-cover" alt="Logo" />
          </div>
          <div className="flex flex-col justify-center">
            <h1 className="text-4xl font-extrabold text-slate-900">{business?.name}</h1>
            <p className="text-slate-500 mt-2 max-w-2xl">{business?.description_long}</p>
            <div className="flex flex-wrap gap-3 mt-4">
              <Badge variant="secondary" className="px-3 py-1 text-sm font-medium">
                {business?.estimated_delivery_minutes || 30} min
              </Badge>
              <Badge className={`px-3 py-1 text-sm font-medium ${business?.is_open_now ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-100" : "bg-red-100 text-red-700 hover:bg-red-100"}`}>
                {business?.is_open_now ? "Abierto ahora" : "Cerrado"}
              </Badge>
            </div>
          </div>
        </section>

        {/* Buscador y Grid */}
        <div className="grid lg:grid-cols-[260px_1fr] gap-8">
          <aside className="space-y-6">
            <div className="sticky top-24">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input 
                  className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-orange-500/20 transition" 
                  placeholder="Buscar en el menú..." 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <div className="mt-8">
                <h3 className="font-bold text-slate-900 mb-4 px-1">Categorías</h3>
                <nav className="space-y-1">
                  <button 
                    onClick={() => setActiveCategory("all")}
                    className={`w-full text-left px-4 py-2 rounded-lg text-sm font-medium transition ${activeCategory === "all" ? "bg-orange-50 text-orange-600" : "text-slate-600 hover:bg-slate-100"}`}
                  >
                    Todo el menú
                  </button>
                  {/* Aquí podrías mapear categorías reales desde los productos */}
                </nav>
              </div>
            </div>
          </aside>

          <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6">
            {paginatedProducts.length > 0 ? paginatedProducts.map(product => (
              <div key={product.id} className="bg-white p-5 rounded-2xl border border-slate-200 hover:shadow-xl hover:shadow-orange-900/5 transition-all duration-300 group flex flex-col">
                <div className="relative aspect-square rounded-xl overflow-hidden mb-4 bg-slate-50">
                  <Image src={getProductImageSrc(product.image_url)} fill className="object-cover group-hover:scale-110 transition duration-500" alt={product.name} />
                </div>
                <div className="flex-1">
                  <h3 className="font-bold text-lg text-slate-900">{product.name}</h3>
                  <p className="text-slate-500 text-sm line-clamp-2 mt-1">{product.description_short}</p>
                </div>
                <div className="mt-5 flex items-center justify-between pt-2 border-t border-slate-50">
                  <span className="font-bold text-xl text-orange-600">MX${product.price}</span>
                  <Button 
                    className="bg-orange-600 hover:bg-orange-700 shadow-lg shadow-orange-600/20 rounded-xl"
                    onClick={() => openCustomizationModal(product)}
                  >
                    <Plus className="h-5 w-5" />
                  </Button>
                </div>
              </div>
            )) : (
              <div className="col-span-full py-20 text-center text-slate-400">
                No se encontraron productos en esta categoría.
              </div>
            )}
          </section>
        </div>
      </main>

      {/* Modal de Personalización */}
      <Dialog open={customizeModalOpen} onOpenChange={setCustomizeModalOpen}>
        <DialogContent className="max-w-2xl rounded-3xl">
          <DialogHeader>
            <DialogTitle className="text-2xl font-extrabold">{selectedProduct?.name}</DialogTitle>
            <DialogDescription className="text-slate-500">{selectedProduct?.description_long}</DialogDescription>
          </DialogHeader>
          
          <div className="max-h-[60vh] overflow-y-auto space-y-6 py-4 pr-2">
            {loadingCustomizations ? (
              <div className="py-10 flex flex-col items-center">
                <Loader2 className="h-8 w-8 animate-spin text-orange-600" />
                <p className="text-sm text-slate-500 mt-2">Cargando opciones...</p>
              </div>
            ) : customizationGroups.length > 0 ? (
              customizationGroups.map(group => (
                <div key={group.id} className="space-y-3 bg-slate-50 p-4 rounded-2xl">
                  <h4 className="font-bold text-slate-900">{group.name}</h4>
                  {group.options.map((opt: any) => (
                    <label key={opt.id} className="flex justify-between items-center p-3 bg-white border border-slate-100 rounded-xl cursor-pointer hover:border-orange-200 transition">
                      <div className="flex items-center gap-3">
                        <input type="checkbox" className="w-5 h-5 accent-orange-600 rounded" />
                        <span className="font-medium">{opt.name}</span>
                      </div>
                      <span className="text-orange-600 font-bold text-sm">+{opt.extraPrice > 0 ? `MX$${opt.extraPrice}` : 'Gratis'}</span>
                    </label>
                  ))}
                </div>
              ))
            ) : (
              <div className="text-center py-6 text-slate-400 italic">Este producto no requiere personalización.</div>
            )}
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-4 pt-4 border-t">
            <div className="flex items-center justify-between gap-4 border border-slate-200 rounded-2xl px-4 py-2 h-12">
              <button 
                className="h-8 w-8 flex items-center justify-center hover:bg-slate-100 rounded-lg text-slate-600"
                onClick={() => setModalQuantity(Math.max(1, modalQuantity - 1))}
              >
                <Minus className="h-4 w-4" />
              </button>
              <span className="font-bold text-lg min-w-[20px] text-center">{modalQuantity}</span>
              <button 
                className="h-8 w-8 flex items-center justify-center hover:bg-slate-100 rounded-lg text-slate-600"
                onClick={() => setModalQuantity(modalQuantity + 1)}
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
            <Button 
              disabled={addingProductId !== null}
              onClick={handleAddToCart} 
              className="flex-1 bg-orange-600 hover:bg-orange-700 h-12 rounded-2xl text-lg font-bold"
            >
              {addingProductId ? <Loader2 className="animate-spin h-5 w-5" /> : `Agregar por MX$${(selectedProduct?.price || 0) * modalQuantity}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      
      {/* Diálogo de Dirección Obligatoria */}
      <AddressRequiredDialog 
        open={addressDialogOpen} 
        onOpenChange={setAddressDialogOpen} 
        onSaved={setSavedAddress} 
      />

      {/* Notificaciones flotantes */}
      {cartMessage && (
        <div className="fixed bottom-10 left-1/2 -translate-x-1/2 bg-slate-900 text-white px-6 py-3 rounded-full shadow-2xl z-50 animate-bounce">
          {cartMessage}
        </div>
      )}
    </div>
  );
}