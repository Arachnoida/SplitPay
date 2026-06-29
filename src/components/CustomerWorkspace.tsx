import React, { useState, useEffect } from "react";
import {
  Users, UserPlus, CheckCircle2, AlertCircle, RefreshCw,
  ChevronRight, ArrowLeft, Key, ShoppingCart, CreditCard, Send, ShieldCheck,
  Trash2, X
} from "lucide-react";
import { Bill, BillItem } from "../types";

// Pesanan per anggota: itemId → qty yang diambil
type MemberOrders = Record<string, Record<string, number>>;

interface CustomerWorkspaceProps {
  currentBill: Bill | null;
  onSelectBill: (bill: Bill | null) => void;
  onRefreshNotifications: () => void;
  currentUser?: { id: string; username: string; name: string; role: "admin" | "user" } | null;
}

export default function CustomerWorkspace({ currentBill, onSelectBill, onRefreshNotifications, currentUser }: CustomerWorkspaceProps) {
  const [searchCode, setSearchCode] = useState("");
  const [newMemberName, setNewMemberName] = useState("");
  const [loadingCode, setLoadingCode] = useState(false);
  const [errorText, setErrorText] = useState("");
  const [successJoinMsg, setSuccessJoinMsg] = useState("");

  // Modal state
  const [activeContributorId, setActiveContributorId] = useState<string | null>(null);

  // memberOrders[contributorId][itemId] = qty diambil anggota ini
  const [memberOrders, setMemberOrders] = useState<MemberOrders>({});

  // Payment
  const [selectedGateway, setSelectedGateway] = useState<Record<string, string>>({});
  const [simulatings, setSimulatings] = useState<Record<string, boolean>>({});
  const [webhookLogs, setWebhookLogs] = useState<string[]>([]);

  // Live polling
  useEffect(() => {
    if (!currentBill) return;
    const interval = setInterval(() => refreshBillData(currentBill.id), 2500);
    return () => clearInterval(interval);
  }, [currentBill?.id]);

  const refreshBillData = async (billId: string) => {
    try {
      const res = await fetch(`/api/bills/${billId}`);
      if (res.ok) onSelectBill(await res.json());
    } catch { }
  };

  // ── Stok helpers ─────────────────────────────────────────
  // Hitung total qty item tertentu yang sudah diambil SEMUA anggota
  const totalTakenForItem = (itemId: string, excludeContributorId?: string): number => {
    return Object.entries(memberOrders).reduce((sum, [cId, orders]) => {
      if (cId === excludeContributorId) return sum;
      return sum + (orders[itemId] || 0);
    }, 0);
  };

  // Sisa stok item yang masih bisa diambil oleh anggota tertentu
  const remainingStockForItem = (item: BillItem, contributorId: string): number => {
    const alreadyTakenByOthers = totalTakenForItem(item.id, contributorId);
    return item.quantity - alreadyTakenByOthers;
  };

  // Qty yang diambil anggota tertentu untuk item tertentu
  const getOrderQty = (contributorId: string, itemId: string): number =>
    memberOrders[contributorId]?.[itemId] || 0;

  // Total harga pesanan satu anggota
  const calcContributorTotal = (contributorId: string): number => {
    if (!currentBill) return 0;
    return currentBill.items.reduce((sum, item) => {
      const qty = getOrderQty(contributorId, item.id);
      return sum + item.price * qty;
    }, 0);
  };

  // Apakah semua item bill sudah habis diassign?
  const allItemsAssigned = (): boolean => {
    if (!currentBill) return false;
    return currentBill.items.every((item) => {
      const taken = totalTakenForItem(item.id);
      return taken === item.quantity;
    });
  };

  // Tambah 1 qty item untuk anggota
  const addItem = (contributorId: string, item: BillItem) => {
    const remaining = remainingStockForItem(item, contributorId);
    if (remaining <= 0) return;
    setMemberOrders((prev) => ({
      ...prev,
      [contributorId]: {
        ...(prev[contributorId] || {}),
        [item.id]: (prev[contributorId]?.[item.id] || 0) + 1,
      },
    }));
  };

  // Kurangi 1 qty item untuk anggota
  const removeItem = (contributorId: string, itemId: string) => {
    setMemberOrders((prev) => {
      const curr = prev[contributorId]?.[itemId] || 0;
      if (curr <= 1) {
        const updated = { ...(prev[contributorId] || {}) };
        delete updated[itemId];
        return { ...prev, [contributorId]: updated };
      }
      return {
        ...prev,
        [contributorId]: { ...(prev[contributorId] || {}), [itemId]: curr - 1 },
      };
    });
  };

  // Simpan pesanan → update shareAmount ke backend
  const handleApplyOrders = async (contributorId: string) => {
    if (!currentBill) return;
    const total = calcContributorTotal(contributorId);
    try {
      const res = await fetch(`/api/bills/${currentBill.id}/contributors/${contributorId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shareAmount: total }),
      });
      if (res.ok) {
        onSelectBill(await res.json());
        setActiveContributorId(null);
      }
    } catch { }
  };

  // ── Bill actions ─────────────────────────────────────────
  const handleSearchBillByCode = async (code: string) => {
    if (!code.trim()) return;
    setLoadingCode(true); setErrorText("");
    try {
      const res = await fetch(`/api/bills/${code.trim().toUpperCase()}`);
      if (!res.ok) throw new Error((await res.json()).error || "Gagal membuka sesi.");
      onSelectBill(await res.json());
      onRefreshNotifications();
    } catch (err: any) {
      setErrorText(err.message);
    } finally { setLoadingCode(false); }
  };

  const handleJoinBill = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentBill || !newMemberName.trim()) return;
    setErrorText(""); setSuccessJoinMsg("");
    try {
      const res = await fetch(`/api/bills/${currentBill.id}/join`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newMemberName.trim() }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Gagal bergabung.");
      onSelectBill(await res.json());
      setSuccessJoinMsg(`Berhasil bergabung sebagai ${newMemberName}!`);
      setNewMemberName("");
      onRefreshNotifications();
      setTimeout(() => setSuccessJoinMsg(""), 4000);
    } catch (er: any) { setErrorText(er.message); }
  };

  const handleRemoveMember = async (contributorId: string) => {
    if (!currentBill) return;
    try {
      const res = await fetch(`/api/bills/${currentBill.id}/contributors/${contributorId}/remove`, { method: "POST" });
      if (res.ok) {
        // Bersihkan order anggota yang dihapus
        setMemberOrders((prev) => { const n = { ...prev }; delete n[contributorId]; return n; });
        onSelectBill(await res.json());
        onRefreshNotifications();
      }
    } catch { setErrorText("Gagal mencopot anggota."); }
  };

  const handleAutoBalance = async (type: "equal" | "remainder") => {
    if (!currentBill) return; setErrorText("");
    try {
      const res = await fetch(`/api/bills/${currentBill.id}/auto-balance`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      onSelectBill(await res.json()); onRefreshNotifications();
    } catch (err: any) { setErrorText(err.message); }
  };

  const handleLockBill = async () => {
    if (!currentBill) return; setErrorText("");
    try {
      const res = await fetch(`/api/bills/${currentBill.id}/lock`, { method: "POST" });
      if (!res.ok) throw new Error((await res.json()).error);
      onSelectBill(await res.json()); onRefreshNotifications();
    } catch (err: any) { setErrorText(err.message); }
  };

  const handleTriggerWebhookPayment = async (contributorId: string, name: string, shareAmount: number) => {
    if (!currentBill) return;
    setSimulatings((prev) => ({ ...prev, [contributorId]: true }));
    const method = selectedGateway[contributorId] || "QRIS BCA";
    setWebhookLogs((prev) => [`[${new Date().toLocaleTimeString()}] POST /api/webhook/payment → ${name}, Rp ${shareAmount.toLocaleString("id-ID")} via ${method}...`, ...prev]);
    try {
      await new Promise((r) => setTimeout(r, 1200));
      const res = await fetch("/api/webhook/payment", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ billId: currentBill.id, contributorId, amount: shareAmount, paymentMethod: method, secureToken: "MOCK_SPLITBAY_SECURE_TOKEN" }),
      });
      const data = await res.json();
      if (res.ok) {
        setWebhookLogs((prev) => [`[${new Date().toLocaleTimeString()}] ✓ HTTP 200 OK — Ref: ${data.transactionId} | Bill: ${data.billStatus}`, ...prev]);
        refreshBillData(currentBill.id); onRefreshNotifications();
      } else {
        setWebhookLogs((prev) => [`[${new Date().toLocaleTimeString()}] ✗ Error: ${data.error}`, ...prev]);
        setErrorText(data.error || "Pembayaran gagal.");
      }
    } catch {
      setWebhookLogs((prev) => [`[${new Date().toLocaleTimeString()}] ✗ Network timeout.`, ...prev]);
    } finally { setSimulatings((prev) => ({ ...prev, [contributorId]: false })); }
  };

  const currentAssignedTotal = currentBill?.contributors.reduce((s, c) => s + c.shareAmount, 0) || 0;
  const balanceDifference = currentBill ? currentBill.totalAmount - currentAssignedTotal : 0;

  // ════════════════════════════════════════════════════════
  //  SEARCH GATE
  // ════════════════════════════════════════════════════════
  if (!currentBill) {
    return (
      <div className="max-w-xl mx-auto space-y-8 py-8 animate-fade-in">
        <div className="text-center space-y-3">
          <div className="mx-auto w-16 h-16 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl flex items-center justify-center">
            <Key className="w-8 h-8 text-emerald-700" />
          </div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Gabung Sesi Patungan SplitBay</h1>
          <p className="text-sm text-slate-500 max-w-sm mx-auto leading-relaxed">
            Masukkan kode patungan unik yang diberikan oleh Kasir atau temanmu.
          </p>
        </div>
        <div className="bg-white rounded-3xl border border-slate-200 shadow-xl p-8 space-y-4">
          <label className="text-[11px] font-bold text-slate-400 block uppercase tracking-wider">KODE PATUNGAN</label>
          <div className="flex gap-2">
            <input
              type="text" placeholder="Contoh: BAY-4040"
              value={searchCode} onChange={(e) => setSearchCode(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleSearchBillByCode(searchCode); } }}
              className="flex-1 px-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-lg font-mono font-bold uppercase tracking-widest focus:bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-none text-center"
            />
            <button onClick={() => handleSearchBillByCode(searchCode)} disabled={loadingCode}
              className="px-5 py-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-2xl transition-all cursor-pointer disabled:opacity-50 shadow-md">
              {loadingCode ? <RefreshCw className="w-5 h-5 animate-spin" /> : <ChevronRight className="w-5 h-5" />}
            </button>
          </div>
          {errorText && <p className="text-xs text-red-600 font-medium">{errorText}</p>}
        </div>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════
  //  MODAL computed values (inline — bukan komponen, hindari blink)
  // ════════════════════════════════════════════════════════
  const activeContributor = currentBill.contributors.find((c) => c.id === activeContributorId);
  const modalMyTotal = activeContributorId ? calcContributorTotal(activeContributorId) : 0;
  const modalHasAnyOrder = activeContributorId
    ? Object.values(memberOrders[activeContributorId] || {}).some((q) => q > 0)
    : false;

  // ════════════════════════════════════════════════════════
  //  MAIN WORKSPACE  // ════════════════════════════════════════════════════════
  //  MAIN WORKSPACE
  // ════════════════════════════════════════════════════════
  return (
    <div className="space-y-6 animate-fade-in">
      {/* ── Modal Atur Pesanan (inline — bukan inner component agar tidak blink) ── */}
      {activeContributorId && activeContributor && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl w-full max-w-lg max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">

            {/* Header */}
            <div className="p-5 border-b border-slate-100 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-emerald-100 text-emerald-800 font-black text-sm flex items-center justify-center shrink-0">
                  {activeContributor.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <div className="font-black text-slate-900 text-sm">{activeContributor.name}</div>
                  <div className="text-[10px] text-slate-400">Atur jumlah item yang dipesan orang ini</div>
                </div>
              </div>
              <button onClick={() => setActiveContributorId(null)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center cursor-pointer transition-all shrink-0">
                <X className="w-4 h-4 text-slate-600" />
              </button>
            </div>

            {/* Item list */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {currentBill.items.length === 0 ? (
                <div className="text-center py-10 text-xs text-slate-400">Bill ini tidak memiliki detail item.</div>
              ) : (
                currentBill.items.map((item) => {
                  const myQty = getOrderQty(activeContributorId, item.id);
                  const takenOthers = totalTakenForItem(item.id, activeContributorId);
                  const maxQty = item.quantity - takenOthers;
                  const isMaxed = myQty >= maxQty;
                  const remaining = maxQty - myQty;

                  return (
                    <div key={item.id} className={`rounded-2xl border p-4 transition-all ${myQty > 0 ? "border-emerald-400 bg-emerald-50/40" : "border-slate-200 bg-white"}`}>
                      <div className="flex items-center justify-between gap-3">
                        {/* Info item */}
                        <div className="flex-1 min-w-0">
                          <div className="font-bold text-sm text-slate-800">{item.name}</div>
                          <div className="text-xs text-slate-500 mt-0.5">
                            <span className="font-mono">Rp {item.price.toLocaleString("id-ID")}</span>
                            <span className="text-slate-400"> / pcs</span>
                            {takenOthers > 0 && (
                              <span className="ml-2 text-amber-600 font-medium">{takenOthers} diambil orang lain</span>
                            )}
                          </div>
                          {myQty > 0 && (
                            <div className="text-xs font-black font-mono text-emerald-700 mt-1">
                              = Rp {(item.price * myQty).toLocaleString("id-ID")}
                            </div>
                          )}
                        </div>

                        {/* Counter: − qty + */}
                        <div className="flex items-center gap-0 shrink-0 rounded-xl overflow-hidden border border-slate-200">
                          <button
                            onClick={() => removeItem(activeContributorId, item.id)}
                            disabled={myQty === 0}
                            className="w-9 h-9 flex items-center justify-center bg-slate-50 hover:bg-slate-100 disabled:opacity-30 cursor-pointer transition-colors text-slate-700 font-bold text-lg leading-none"
                          >
                            −
                          </button>
                          <span className="w-9 h-9 flex items-center justify-center font-black text-slate-800 text-sm bg-white border-x border-slate-200">
                            {myQty}
                          </span>
                          <button
                            onClick={() => addItem(activeContributorId, item)}
                            disabled={isMaxed}
                            className="w-9 h-9 flex items-center justify-center bg-emerald-50 hover:bg-emerald-100 disabled:opacity-30 cursor-pointer transition-colors text-emerald-700 font-bold text-lg leading-none"
                          >
                            +
                          </button>
                        </div>
                      </div>

                      {/* Stok bar */}
                      {maxQty < item.quantity && (
                        <div className="mt-2 text-[10px] text-slate-400">
                          Maks {maxQty} pcs untukmu ({remaining} tersisa)
                        </div>
                      )}
                      {remaining === 0 && myQty > 0 && (
                        <div className="mt-1 text-[10px] text-emerald-600 font-bold">✓ Semua stok sudah kamu ambil</div>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-slate-100 space-y-3 shrink-0 bg-white">
              {modalHasAnyOrder && (
                <div className="bg-slate-50 rounded-xl p-3 space-y-1.5 border border-slate-100">
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Ringkasan Pesanan</div>
                  {currentBill.items
                    .filter((item) => getOrderQty(activeContributorId, item.id) > 0)
                    .map((item) => {
                      const q = getOrderQty(activeContributorId, item.id);
                      return (
                        <div key={item.id} className="flex justify-between text-xs">
                          <span className="text-slate-600">{item.name} <span className="text-slate-400">×{q}</span></span>
                          <span className="font-mono font-bold text-slate-800">Rp {(item.price * q).toLocaleString("id-ID")}</span>
                        </div>
                      );
                    })}
                </div>
              )}
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[10px] text-slate-400 font-medium">Total tagihan</div>
                  <div className="text-lg font-black font-mono text-emerald-700">
                    Rp {modalMyTotal.toLocaleString("id-ID")}
                  </div>
                </div>
                <button onClick={() => handleApplyOrders(activeContributorId)} disabled={!modalHasAnyOrder}
                  className="px-6 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white text-xs font-bold rounded-xl cursor-pointer transition-all shadow-md">
                  Simpan Pesanan ✓
                </button>
              </div>
            </div>
          </div>
        </div>
      )}


      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white border border-slate-200 shadow-sm rounded-2xl p-5">
        <div className="flex items-center gap-3">
          <button onClick={() => { onSelectBill(null); setErrorText(""); setSuccessJoinMsg(""); }}
            className="p-2 hover:bg-slate-50 rounded-xl border border-slate-200 cursor-pointer transition-all">
            <ArrowLeft className="w-4 h-4 text-slate-600" />
          </button>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-mono font-bold text-emerald-800 bg-emerald-50 border border-emerald-100 px-2.5 py-1 rounded-md uppercase">
                KODE: {currentBill.code}
              </span>
              {currentBill.status === "SHARING" && <span className="text-[10px] font-bold bg-amber-50 text-amber-800 px-2 py-0.5 rounded-full border border-amber-200">Membagi Tagihan</span>}
              {currentBill.status === "LOCKED" && <span className="text-[10px] font-bold bg-indigo-50 text-indigo-800 px-2 py-0.5 rounded-full border border-indigo-200">Invoice Dikunci</span>}
              {currentBill.status === "COMPLETED" && <span className="text-[10px] font-bold bg-emerald-500 text-white px-2 py-0.5 rounded-full">Lunas</span>}
            </div>
            <h2 className="text-xl font-black text-slate-900 mt-1">{currentBill.title}</h2>
            <p className="text-xs text-slate-500 mt-0.5">{currentBill.description}</p>
          </div>
        </div>
        <div className="text-left md:text-right shrink-0">
          <span className="text-[11px] text-slate-400 font-bold uppercase tracking-wider block">TOTAL TAGIHAN KASIR</span>
          <span className="text-2xl font-black text-emerald-800 font-mono">Rp {currentBill.totalAmount.toLocaleString("id-ID")}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ── Kiri & Tengah ── */}
        <div className="lg:col-span-2 space-y-6">

          {/* Balance Meter */}
          <div className="bg-white border border-slate-200 shadow-sm rounded-2xl p-6 space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">Meter Keseimbangan Patungan</span>
              <span className="text-xs font-mono text-slate-500">
                Rp {currentAssignedTotal.toLocaleString("id-ID")} / Rp {currentBill.totalAmount.toLocaleString("id-ID")}
              </span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden">
              {currentAssignedTotal > 0 && (
                <div className={`h-full transition-all duration-300 ${currentAssignedTotal < currentBill.totalAmount ? "bg-amber-500"
                  : currentAssignedTotal > currentBill.totalAmount ? "bg-red-500"
                    : "bg-emerald-500"}`}
                  style={{ width: `${Math.min(100, (currentAssignedTotal / currentBill.totalAmount) * 100)}%` }}
                />
              )}
            </div>

            {currentBill.status === "SHARING" && (
              <div className="pt-1">
                {currentAssignedTotal === 0 ? (
                  <div className="p-3 bg-slate-50 border border-slate-200 text-slate-600 rounded-xl text-xs flex items-center gap-2">
                    <Users className="w-4 h-4 text-slate-400 shrink-0" />
                    Tambah anggota lalu klik <strong className="text-emerald-700">"Atur Pesanan"</strong> — ketuk tiap item di bill untuk assign ke anggota.
                  </div>
                ) : balanceDifference > 0 ? (
                  <div className="p-3.5 bg-amber-50/75 border border-amber-200 text-amber-900 rounded-xl text-xs flex items-start gap-2.5">
                    <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <span>Masih kurang <strong>Rp {balanceDifference.toLocaleString("id-ID")}</strong>. Atur pesanan anggota atau gunakan Auto-Balance.</span>
                  </div>
                ) : balanceDifference < 0 ? (
                  <div className="p-3.5 bg-red-50/70 border border-red-200 text-red-900 rounded-xl text-xs flex items-start gap-2.5">
                    <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                    <span>Total melebihi tagihan <strong>Rp {Math.abs(balanceDifference).toLocaleString("id-ID")}</strong>. Kurangi pesanan.</span>
                  </div>
                ) : (
                  <div className="p-3.5 bg-emerald-50 border border-emerald-500/20 text-emerald-900 rounded-xl text-xs flex items-start gap-2.5">
                    <CheckCircle2 className="w-4.5 h-4.5 text-emerald-600 shrink-0" />
                    <div className="flex-1">
                      <span className="font-bold block text-emerald-800">🎉 Pembayaran Pas & Seimbang!</span>
                      <span className="text-slate-700 mt-0.5 block">Total terkumpul pas. Silakan kunci untuk menerbitkan invoice parsial.</span>
                      <button onClick={handleLockBill}
                        className="mt-3 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs inline-flex items-center gap-2 cursor-pointer shadow-md">
                        <ShieldCheck className="w-4 h-4" /> Kunci & Terbitkan Invoice
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {currentBill.status !== "SHARING" && (
              <div className="p-3.5 bg-emerald-950 text-emerald-200 rounded-xl text-xs flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4.5 h-4.5 text-emerald-400" />
                  <span>Tagihan terkonfirmasi — {currentBill.contributors.length} invoice terpisah.</span>
                </div>
                {currentBill.status === "COMPLETED" && (
                  <span className="bg-emerald-500 text-white px-2 py-0.5 rounded font-black text-[9px] uppercase">LUNAS</span>
                )}
              </div>
            )}
          </div>

          {/* Members Block */}
          <div className="bg-white border border-slate-200 shadow-sm rounded-2xl p-6 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Users className="w-4 h-4 text-emerald-600" />
                  Anggota Tim ({currentBill.contributors.length} orang)
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {currentBill.status === "SHARING" ? "Klik anggota lalu ketuk item di bill untuk assign pesanannya" : "Tagihan sudah dikunci"}
                </p>
              </div>
              {currentBill.status === "SHARING" && (
                <div className="flex flex-wrap gap-1.5 shrink-0">
                  <button onClick={() => handleAutoBalance("equal")}
                    className="px-3 py-1.5 bg-slate-50 border border-slate-200 hover:border-emerald-300 hover:bg-emerald-50 text-[11px] font-bold text-slate-700 rounded-lg transition-all flex items-center gap-1 cursor-pointer">
                    ⚡ Bagi Rata
                  </button>
                  <button onClick={() => handleAutoBalance("remainder")} disabled={balanceDifference <= 0}
                    className="px-3 py-1.5 bg-slate-50 border border-slate-200 hover:border-emerald-300 hover:bg-emerald-50 text-[11px] font-bold text-slate-700 rounded-lg transition-all flex items-center gap-1 disabled:opacity-35 cursor-pointer">
                    ⚖️ Bagi Sisa
                  </button>
                </div>
              )}
            </div>

            {errorText && <div className="p-3 bg-red-50 text-red-700 text-xs rounded-lg border border-red-100">{errorText}</div>}
            {successJoinMsg && <div className="p-3 bg-emerald-50 text-emerald-800 text-xs rounded-lg border border-emerald-100">{successJoinMsg}</div>}

            {/* Join form */}
            {currentBill.status === "SHARING" && (
              <div className="space-y-3">
                {currentUser && !currentBill.contributors.some((c) => c.name.toLowerCase() === currentUser.name.toLowerCase()) && (
                  <button onClick={async () => {
                    setErrorText(""); setSuccessJoinMsg("");
                    try {
                      const res = await fetch(`/api/bills/${currentBill.id}/join`, {
                        method: "POST", headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ name: currentUser.name }),
                      });
                      if (!res.ok) throw new Error((await res.json()).error);
                      onSelectBill(await res.json());
                      setSuccessJoinMsg(`Berhasil bergabung sebagai ${currentUser.name}!`);
                      onRefreshNotifications();
                      setTimeout(() => setSuccessJoinMsg(""), 4000);
                    } catch (er: any) { setErrorText(er.message); }
                  }} className="w-full py-2 bg-emerald-50 hover:bg-emerald-100 border border-dashed border-emerald-300 text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 cursor-pointer text-emerald-800 transition-all">
                    ⚡ Gabung Instan Sebagai: <span className="underline font-extrabold">{currentUser.name}</span>
                  </button>
                )}
                <form onSubmit={handleJoinBill} className="flex gap-2 bg-slate-50 p-3 rounded-xl border border-slate-200">
                  <div className="relative flex-1">
                    <span className="absolute left-3.5 top-2.5 text-xs text-emerald-600 font-bold">@</span>
                    <input type="text" placeholder="Masukkan nama anggota baru"
                      value={newMemberName} onChange={(e) => setNewMemberName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") e.preventDefault(); }}
                      className="w-full pl-8 pr-3 py-1.5 bg-transparent text-xs text-slate-800 focus:outline-none" />
                  </div>
                  <button type="submit" className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg text-xs flex items-center gap-1 cursor-pointer transition-colors">
                    <UserPlus className="w-3.5 h-3.5" /> Gabung
                  </button>
                </form>
              </div>
            )}

            {/* Contributors */}
            <div className="space-y-2">
              {currentBill.contributors.length === 0 ? (
                <div className="text-center py-8 text-slate-400 text-xs">Belum ada anggota yang join.</div>
              ) : (
                currentBill.contributors.map((c) => {
                  const myOrders = memberOrders[c.id] || {};
                  const orderedItems = currentBill.items.filter((item) => (myOrders[item.id] || 0) > 0);
                  const hasOrders = orderedItems.length > 0;

                  return (
                    <div key={c.id} className={`rounded-xl border transition-all ${c.paymentStatus === "PAID" ? "border-emerald-200 bg-emerald-50/40" : "border-slate-200 bg-white"
                      }`}>
                      <div className="flex items-center justify-between p-3 gap-3">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-8 h-8 rounded-full bg-emerald-900/10 text-emerald-800 font-bold text-xs flex items-center justify-center border border-emerald-200 shrink-0">
                            {c.name.charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <span className="font-semibold text-xs text-slate-800 block truncate">{c.name}</span>
                            {c.shareAmount > 0 ? (
                              <span className="text-[10px] font-mono text-emerald-700 font-bold">
                                Rp {c.shareAmount.toLocaleString("id-ID")}
                                {hasOrders && <span className="text-slate-400 ml-1">({orderedItems.length} item)</span>}
                              </span>
                            ) : (
                              <span className="text-[10px] text-slate-400">Belum ada pesanan</span>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          {c.paymentStatus === "PAID" ? (
                            <span className="bg-emerald-100 text-emerald-800 border border-emerald-200 text-[9px] font-bold px-1.5 py-0.5 rounded-full">✓ Lunas</span>
                          ) : currentBill.status === "SHARING" ? (
                            <>
                              <button onClick={() => setActiveContributorId(c.id)}
                                className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold rounded-lg cursor-pointer transition-all flex items-center gap-1">
                                <ShoppingCart className="w-3 h-3" />
                                {hasOrders ? "Edit Pesanan" : "Atur Pesanan"}
                              </button>
                              <button onClick={() => handleRemoveMember(c.id)}
                                className="w-7 h-7 rounded-lg hover:bg-red-50 flex items-center justify-center cursor-pointer transition-all">
                                <Trash2 className="w-3.5 h-3.5 text-slate-400 hover:text-red-500" />
                              </button>
                            </>
                          ) : (
                            <span className="bg-amber-50 text-amber-800 border border-amber-200 text-[9px] font-bold px-1.5 py-0.5 rounded-full">Menunggu</span>
                          )}
                        </div>
                      </div>

                      {/* Rincian pesanan yang sudah dipilih */}
                      {hasOrders && (
                        <div className="border-t border-slate-100 px-3 pb-3 pt-2 space-y-1">
                          {orderedItems.map((item) => {
                            const q = myOrders[item.id];
                            return (
                              <div key={item.id} className="flex justify-between text-[11px]">
                                <span className="text-slate-600">{item.name} <span className="text-slate-400">×{q}</span></span>
                                <span className="font-mono text-slate-700 font-bold">Rp {(item.price * q).toLocaleString("id-ID")}</span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Invoice Payment */}
          {(currentBill.status === "LOCKED" || currentBill.status === "COMPLETED") && (
            <div className="bg-white border border-slate-200 shadow-sm rounded-2xl p-6 space-y-5">
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-emerald-600" />
                  Invoice Parsial — Siap Bayar
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">Gunakan tombol sandbox untuk simulasi pembayaran webhook.</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {currentBill.contributors.map((c) => (
                  <div key={c.id} className={`p-4 border rounded-2xl relative overflow-hidden ${c.paymentStatus === "PAID" ? "bg-emerald-500/5 border-emerald-500/20" : "bg-white border-slate-200 shadow-sm"}`}>
                    <div className={`absolute top-0 left-0 right-0 h-1 ${c.paymentStatus === "PAID" ? "bg-emerald-500" : "bg-amber-500"}`} />
                    <div className="flex justify-between items-start pt-1">
                      <div>
                        <span className="text-[10px] font-bold text-slate-400 block uppercase font-mono">INVOICE PARSIAL</span>
                        <span className="font-bold text-slate-800 text-sm">{c.name}</span>
                      </div>
                      <span className="text-base font-black font-mono text-emerald-800">Rp {c.shareAmount.toLocaleString("id-ID")}</span>
                    </div>
                    {c.paymentStatus === "PAID" ? (
                      <div className="mt-4 bg-emerald-50 border border-emerald-200/50 rounded-xl p-3 space-y-1">
                        <span className="text-[10px] text-emerald-800 font-bold flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Pembayaran Sukses
                        </span>
                        <div className="text-[10px] text-slate-500 font-mono">
                          <div>REF: {c.transactionId}</div>
                          <div>Waktu: {c.paidAt ? new Date(c.paidAt).toLocaleTimeString() : "-"}</div>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-4 pt-3 border-t border-slate-100 space-y-3">
                        <div className="flex gap-2 items-center">
                          <label className="text-[10px] font-bold text-slate-400 uppercase shrink-0">Metode:</label>
                          <select value={selectedGateway[c.id] || "QRIS BCA"}
                            onChange={(e) => setSelectedGateway((prev) => ({ ...prev, [c.id]: e.target.value }))}
                            className="flex-1 text-[11px] bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-emerald-500">
                            <option value="QRIS BCA">QRIS BCA</option>
                            <option value="Virtual Account Mandiri">VA Mandiri</option>
                            <option value="GoPay">GoPay</option>
                            <option value="ShopeePay">ShopeePay</option>
                            <option value="OVO Wallet">OVO</option>
                          </select>
                        </div>
                        <button onClick={() => handleTriggerWebhookPayment(c.id, c.name, c.shareAmount)} disabled={simulatings[c.id]}
                          className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl transition-colors cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50">
                          {simulatings[c.id] ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Memproses...</> : <><Send className="w-3.5 h-3.5" /> Kirim Simulasi Webhook</>}
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── Kanan: Rincian Bill ── */}
        <div className="space-y-6">
          <div className="bg-white border border-slate-200 shadow-sm rounded-2xl p-6 space-y-4">
            <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
              <ShoppingCart className="w-4 h-4 text-emerald-600" />
              Rincian Bill dari Kasir
            </h3>
            <div className="space-y-3">
              {currentBill.items && currentBill.items.length > 0 ? (
                currentBill.items.map((item) => {
                  const taken = totalTakenForItem(item.id);
                  const remaining = item.quantity - taken;
                  return (
                    <div key={item.id} className="border-b border-slate-100 pb-3 last:border-0 last:pb-0">
                      <div className="flex justify-between items-start text-xs">
                        <div>
                          <span className="font-semibold text-slate-800">{item.name}</span>
                          <span className="text-[10px] text-slate-400 block font-mono mt-0.5">
                            {item.quantity} pcs × Rp {item.price.toLocaleString("id-ID")}
                          </span>
                        </div>
                        <span className="font-mono text-slate-800 font-medium shrink-0">
                          Rp {(item.price * item.quantity).toLocaleString("id-ID")}
                        </span>
                      </div>
                      {/* Progress stok */}
                      {currentBill.status === "SHARING" && (
                        <div className="mt-2 flex items-center gap-2">
                          <div className="flex-1 bg-slate-100 rounded-full h-1.5 overflow-hidden">
                            <div className="h-full bg-emerald-500 transition-all duration-300"
                              style={{ width: `${(taken / item.quantity) * 100}%` }} />
                          </div>
                          <span className={`text-[9px] font-bold ${remaining === 0 ? "text-emerald-600" : "text-slate-400"}`}>
                            {remaining === 0 ? "✓ Habis dibagi" : `${remaining} tersisa`}
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })
              ) : (
                <div className="text-slate-400 text-center text-[11px] py-4">Tidak ada detail item.</div>
              )}
            </div>
            <div className="border-t border-slate-100 pt-3 flex justify-between items-center text-xs">
              <span className="font-bold text-slate-700 uppercase">Subtotal</span>
              <span className="font-bold font-mono text-emerald-800 text-sm">Rp {currentBill.totalAmount.toLocaleString("id-ID")}</span>
            </div>
          </div>

          {/* Webhook Console */}
          <div className="bg-gray-950 text-emerald-400 font-mono text-[10px] rounded-2xl p-5 border border-gray-900 space-y-3">
            <div className="flex justify-between items-center border-b border-emerald-900/40 pb-2">
              <span className="font-bold tracking-wider text-emerald-300 uppercase">Sandbox Console</span>
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            </div>
            <div className="h-44 overflow-y-auto space-y-1.5 bg-black/45 p-2 rounded-lg border border-emerald-950">
              {webhookLogs.length === 0 ? (
                <span className="text-emerald-600/60 text-[9px] block text-center py-8">Belum ada aktivitas webhook.</span>
              ) : (
                webhookLogs.map((log, i) => (
                  <div key={i} className="border-b border-emerald-950 pb-1 leading-normal">{log}</div>
                ))
              )}
            </div>
            <div className="text-[9px] text-emerald-600 text-center">🔒 Secure HMAC Token Verified</div>
          </div>
        </div>
      </div>
    </div>
  );
}