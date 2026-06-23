import React, { useState, useEffect } from "react";
import { Plus, Minus, Trash2, Copy, Check, Sparkles, Receipt, HelpCircle, Search, ShoppingCart, X } from "lucide-react";
import { Bill, BillItem } from "../types";

interface MenuItem {
  id: string;
  name: string;
  price: number;
  category: string;
  emoji: string;
  is_available: boolean;
}

interface CartItem extends MenuItem {
  quantity: number;
}

interface CashierPortalProps {
  onBillCreated: (bill: Bill) => void;
  setActiveTab: (tab: string) => void;
  currentUser: { id: string; username: string; name: string; role: 'admin' | 'user' } | null;
}

export default function CashierPortal({ onBillCreated, setActiveTab, currentUser }: CashierPortalProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);

  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [menuLoading, setMenuLoading] = useState(true);
  const [menuError, setMenuError] = useState("");
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("Semua");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [successBill, setSuccessBill] = useState<Bill | null>(null);
  const [copied, setCopied] = useState(false);

  // Fetch menu dari Supabase via API
  useEffect(() => {
    const fetchMenu = async () => {
      setMenuLoading(true);
      setMenuError("");
      try {
        const res = await fetch("/api/menu");
        if (!res.ok) throw new Error("Gagal memuat menu.");
        const data: MenuItem[] = await res.json();
        setMenuItems(data);
      } catch (e: any) {
        setMenuError(e.message || "Gagal memuat menu dari server.");
      } finally {
        setMenuLoading(false);
      }
    };
    fetchMenu();
  }, []);

  // Daftar kategori unik
  const categories = ["Semua", ...Array.from(new Set(menuItems.map((m) => m.category)))];

  // Filter menu berdasarkan search & kategori
  const filteredMenu = menuItems.filter((m) => {
    const matchSearch = m.name.toLowerCase().includes(search.toLowerCase());
    const matchCat = activeCategory === "Semua" || m.category === activeCategory;
    return matchSearch && matchCat;
  });

  // Tambah ke keranjang
  const addToCart = (item: MenuItem) => {
    setCart((prev) => {
      const existing = prev.find((c) => c.id === item.id);
      if (existing) {
        return prev.map((c) => c.id === item.id ? { ...c, quantity: c.quantity + 1 } : c);
      }
      return [...prev, { ...item, quantity: 1 }];
    });
  };

  // Ubah quantity di keranjang
  const changeQty = (id: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((c) => c.id === id ? { ...c, quantity: c.quantity + delta } : c)
        .filter((c) => c.quantity > 0)
    );
  };

  // Hapus dari keranjang
  const removeFromCart = (id: string) => {
    setCart((prev) => prev.filter((c) => c.id !== id));
  };

  const getCartQty = (id: string) => cart.find((c) => c.id === id)?.quantity || 0;

  const calculatedTotal = cart.reduce((sum, c) => sum + c.price * c.quantity, 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!title.trim()) {
      setError("Nama patungan wajib diisi.");
      return;
    }
    if (cart.length === 0) {
      setError("Keranjang masih kosong. Pilih minimal satu menu.");
      return;
    }

    const compiledItems: BillItem[] = cart.map((c, index) => ({
      id: `csh-itm-${Date.now()}-${index}`,
      name: c.name,
      price: c.price,
      quantity: c.quantity,
    }));

    setLoading(true);
    try {
      const response = await fetch("/api/bills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          totalAmount: calculatedTotal,
          items: compiledItems,
          creatorId: currentUser?.id || undefined,
        }),
      });

      if (!response.ok) {
        const errDetail = await response.json();
        throw new Error(errDetail.error || "Gagal membuat patungan.");
      }

      const freshBill = await response.json();
      setSuccessBill(freshBill);
      onBillCreated(freshBill);
    } catch (err: any) {
      setError(err.message || "Koneksi terganggu.");
    } finally {
      setLoading(false);
    }
  };

  const copyLink = () => {
    if (!successBill) return;
    navigator.clipboard.writeText(`${window.location.origin}/join/${successBill.code}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const resetForm = () => {
    setSuccessBill(null);
    setTitle("");
    setDescription("");
    setCart([]);
    setSearch("");
    setActiveCategory("Semua");
    setError("");
  };

  // ─── SUCCESS SCREEN ────────────────────────────────────────
  if (successBill) {
    return (
      <div className="max-w-2xl mx-auto bg-white rounded-3xl border border-slate-200 shadow-xl overflow-hidden animate-fade-in">
        <div className="bg-emerald-600 p-8 text-center text-white relative">
          <div className="absolute right-4 top-4 bg-emerald-700/50 px-3 py-1.5 rounded-full text-xs font-mono font-semibold">KASIR PORTAL</div>
          <div className="w-16 h-16 bg-white/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Check className="w-8 h-8 stroke-[3]" />
          </div>
          <h2 className="text-2xl font-black">Tagihan Patungan Terbit!</h2>
          <p className="text-emerald-100 text-xs mt-1.5">Bagikan kode atau link ini kepada pelanggan</p>
        </div>

        <div className="p-8 space-y-6">
          <div className="bg-slate-50 rounded-2xl p-6 text-center space-y-3 border border-slate-100">
            <span className="text-xs text-slate-400 font-bold uppercase tracking-wider block">KODE PATUNGAN SPLITBAY</span>
            <div className="text-4xl font-black tracking-widest font-mono text-emerald-800 bg-white border border-slate-200 rounded-xl py-3 px-6 shadow-xs inline-block">
              {successBill.code}
            </div>
            <p className="text-xs text-slate-500">Gunakan kode ini di handphone pembeli untuk bergabung dan split nominal.</p>
          </div>

          <div className="space-y-3">
            <button onClick={copyLink} className="w-full flex items-center justify-center gap-2 px-6 py-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-2xl transition-all cursor-pointer shadow-md">
              {copied ? <><Check className="w-5 h-5" />Berhasil Disalin!</> : <><Copy className="w-5 h-5" />Salin Link Patungan Pembeli</>}
            </button>
            <div className="flex gap-2">
              <button type="button" onClick={resetForm} className="flex-1 px-5 py-3 border border-slate-200 text-slate-700 font-semibold rounded-xl text-xs hover:bg-slate-50 transition-all cursor-pointer">
                Buat Tagihan Lain
              </button>
              <button type="button" onClick={() => setActiveTab("patungan")} className="flex-1 px-5 py-3 bg-emerald-900 text-emerald-100 font-bold rounded-xl text-xs hover:bg-emerald-800 transition-all cursor-pointer">
                Buka Ruang Patungan Ini
              </button>
            </div>
          </div>

          <div className="border-t border-slate-100 pt-4 space-y-2">
            <span className="text-xs font-bold text-slate-700 block uppercase tracking-wider">Detil Transaksi:</span>
            <div className="grid grid-cols-2 gap-y-2 text-xs">
              <span className="text-slate-400">Judul</span>
              <span className="text-slate-800 font-bold text-right">{successBill.title}</span>
              <span className="text-slate-400">Total Harga</span>
              <span className="text-emerald-700 font-black font-mono text-right">Rp {successBill.totalAmount.toLocaleString("id-ID")}</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ─── MAIN FORM ─────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Header Card */}
      <div className="bg-emerald-900/10 border border-emerald-500/20 rounded-2xl p-5 flex items-start gap-4">
        <div className="p-3 bg-emerald-500 text-white rounded-xl shadow-md shrink-0">
          <Receipt className="w-6 h-6" />
        </div>
        <div>
          <h3 className="text-lg font-bold text-slate-900">Portal Kasir SplitBay</h3>
          <p className="text-sm text-slate-600 mt-0.5 max-w-2xl leading-relaxed">
            Cari dan klik menu untuk menambahkan ke keranjang, lalu atur jumlahnya. Sistem akan otomatis menghitung total tagihan.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* ── Kiri: Menu Browser + Info Tagihan ── */}
          <div className="lg:col-span-2 space-y-5">

            {/* Info Tagihan */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
              <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-emerald-500" />
                Info Tagihan
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Nama Patungan <span className="text-red-400">*</span></label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Contoh: Makan Siang Tim Marketing"
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 focus:bg-white focus:ring-1 focus:ring-emerald-500 rounded-xl text-xs text-slate-800 focus:outline-none font-medium"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Deskripsi (opsional)</label>
                  <input
                    type="text"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Contoh: Sesi makan siang setelah rapat"
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 focus:bg-white focus:ring-1 focus:ring-emerald-500 rounded-xl text-xs text-slate-800 focus:outline-none font-medium"
                  />
                </div>
              </div>
            </div>

            {/* Menu Browser */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
              <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <Search className="w-4 h-4 text-emerald-500" />
                Pilih Menu
              </h2>

              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Cari nama menu..."
                  className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 focus:bg-white focus:ring-1 focus:ring-emerald-500 rounded-xl text-xs text-slate-700 focus:outline-none"
                />
              </div>

              {/* Category Tabs */}
              <div className="flex gap-2 flex-wrap">
                {categories.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setActiveCategory(cat)}
                    className={`px-3 py-1 rounded-full text-[11px] font-bold transition-all cursor-pointer ${activeCategory === cat
                        ? "bg-emerald-600 text-white"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                      }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>

              {/* Menu Grid */}
              {menuLoading ? (
                <div className="py-10 text-center text-xs text-slate-400">
                  <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                  Memuat menu...
                </div>
              ) : menuError ? (
                <div className="py-8 text-center text-xs text-red-500">{menuError}</div>
              ) : filteredMenu.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-400">Menu tidak ditemukan.</div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 max-h-72 overflow-y-auto pr-1">
                  {filteredMenu.map((item) => {
                    const qty = getCartQty(item.id);
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => addToCart(item)}
                        className={`relative text-left p-3 rounded-xl border transition-all cursor-pointer group ${qty > 0
                            ? "border-emerald-400 bg-emerald-50"
                            : "border-slate-200 bg-slate-50 hover:border-emerald-300 hover:bg-emerald-50/50"
                          }`}
                      >
                        <div className="text-2xl mb-1">{item.emoji}</div>
                        <div className="text-[11px] font-bold text-slate-800 leading-tight line-clamp-2">{item.name}</div>
                        <div className="text-[10px] font-mono text-emerald-700 font-bold mt-1">
                          Rp {item.price.toLocaleString("id-ID")}
                        </div>
                        {qty > 0 && (
                          <span className="absolute -top-1.5 -right-1.5 bg-emerald-500 text-white text-[10px] font-black w-5 h-5 rounded-full flex items-center justify-center shadow">
                            {qty}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* ── Kanan: Keranjang ── */}
          <div className="space-y-5">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4 sticky top-4">
              <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <ShoppingCart className="w-4 h-4 text-emerald-500" />
                Keranjang
                {cart.length > 0 && (
                  <span className="ml-auto bg-emerald-100 text-emerald-700 text-[10px] font-black px-2 py-0.5 rounded-full">
                    {cart.reduce((s, c) => s + c.quantity, 0)} item
                  </span>
                )}
              </h2>

              {cart.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-400 space-y-2">
                  <ShoppingCart className="w-8 h-8 mx-auto text-slate-200" />
                  <p>Belum ada menu dipilih.<br />Klik menu di sebelah kiri untuk menambahkan.</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                  {cart.map((c) => (
                    <div key={c.id} className="flex items-center gap-2 p-2.5 bg-slate-50 rounded-xl border border-slate-100">
                      <span className="text-lg shrink-0">{c.emoji}</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-[11px] font-bold text-slate-800 truncate">{c.name}</div>
                        <div className="text-[10px] font-mono text-emerald-700">
                          Rp {(c.price * c.quantity).toLocaleString("id-ID")}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => changeQty(c.id, -1)}
                          className="w-6 h-6 rounded-lg bg-slate-200 hover:bg-slate-300 flex items-center justify-center cursor-pointer transition-all"
                        >
                          <Minus className="w-3 h-3 text-slate-700" />
                        </button>
                        <span className="w-5 text-center text-xs font-black text-slate-800">{c.quantity}</span>
                        <button
                          type="button"
                          onClick={() => changeQty(c.id, 1)}
                          className="w-6 h-6 rounded-lg bg-emerald-100 hover:bg-emerald-200 flex items-center justify-center cursor-pointer transition-all"
                        >
                          <Plus className="w-3 h-3 text-emerald-700" />
                        </button>
                        <button
                          type="button"
                          onClick={() => removeFromCart(c.id)}
                          className="w-6 h-6 rounded-lg hover:bg-red-100 flex items-center justify-center cursor-pointer transition-all ml-0.5"
                        >
                          <Trash2 className="w-3 h-3 text-slate-400 hover:text-red-500" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Total & Submit */}
              <div className="border-t border-slate-100 pt-3 space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-slate-500 font-semibold">Total</span>
                  <span className="text-lg font-black font-mono text-emerald-700">
                    Rp {calculatedTotal.toLocaleString("id-ID")}
                  </span>
                </div>

                {error && (
                  <div className="p-2.5 bg-red-50 border border-red-200 rounded-xl text-[11px] text-red-600 font-medium">
                    ⚠️ {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading || cart.length === 0}
                  className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl transition-all cursor-pointer shadow-md shadow-emerald-600/10"
                >
                  {loading ? "Menyimpan..." : "Buat Tagihan Patungan →"}
                </button>

                {cart.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setCart([])}
                    className="w-full py-2 text-xs text-slate-400 hover:text-red-500 transition-colors cursor-pointer flex items-center justify-center gap-1"
                  >
                    <X className="w-3 h-3" /> Kosongkan Keranjang
                  </button>
                )}
              </div>
            </div>

            {/* Tips */}
            <div className="bg-amber-50/70 border border-amber-500/10 rounded-2xl p-5 space-y-3">
              <div className="flex items-center gap-2 text-amber-900 font-bold text-sm">
                <HelpCircle className="w-4 h-4" />
                Tips Kasir
              </div>
              <ul className="text-xs text-amber-800 space-y-2 list-disc pl-4 leading-relaxed">
                <li>Klik menu untuk langsung masuk keranjang.</li>
                <li>Gunakan tombol <strong>+</strong> dan <strong>−</strong> untuk atur jumlah.</li>
                <li>Setelah tagihan dibuat, bagikan kode ke pembeli.</li>
                <li>Pembeli bisa join dan split tagihan secara mandiri.</li>
              </ul>
            </div>
          </div>

        </div>
      </form>
    </div>
  );
}