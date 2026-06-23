import React, { useState, useEffect } from "react";
import {
  Users,
  UserPlus,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Sparkles,
  ChevronRight,
  ArrowLeft,
  Key,
  ShoppingCart,
  CreditCard,
  Send,
  ShieldCheck,
  Trash2,
  Edit3,
  Copy,
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

export default function CustomerWorkspace({
  currentBill,
  onSelectBill,
  onRefreshNotifications,
  currentUser,
}: CustomerWorkspaceProps) {
  const [searchCode, setSearchCode] = useState("");
  const [newMemberName, setNewMemberName] = useState("");
  const [loadingCode, setLoadingCode] = useState(false);
  const [errorText, setErrorText] = useState("");
  const [successJoinMsg, setSuccessJoinMsg] = useState("");
  const [pollerId, setPollerId] = useState<any>(null);

  // Payment simulations state
  const [selectedGateway, setSelectedGateway] = useState<Record<string, string>>({});
  const [simulatings, setSimulatings] = useState<Record<string, boolean>>({});
  const [webhookLogs, setWebhookLogs] = useState<string[]>([]);
  const [paymentModes, setPaymentModes] = useState<Record<string, "qris" | "barcode">>({});
  const [copiedStates, setCopiedStates] = useState<Record<string, boolean>>({});

  // Generate deterministic VA code or barcode from contributor ID/Name
  const getVAForContributor = (name: string, id: string, gate: string) => {
    const numericHash = id.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const isMandiri = gate.toLowerCase().includes("mandiri");
    const bankSuf = ((numericHash % 89999) + 10000).toString();
    const phoneSuf =
      "08123" + ((numericHash % 899) + 100).toString() + ((numericHash % 89) + 10).toString();

    if (isMandiri) {
      return `89508 ${bankSuf} 7${numericHash % 9}9 10`;
    } else {
      // BCA VA
      return `3901 ${phoneSuf.substring(1, 5)} ${phoneSuf.substring(5, 9)}`;
    }
  };

  const getBarcodeForContributor = (id: string, amount: number) => {
    const codeHash = id.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return `9908${(codeHash % 8999) + 1000}${amount.toString().substring(0, 3)}01`;
  };

  const handleCopyText = (id: string, text: string) => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text);
    }
    setCopiedStates((prev) => ({ ...prev, [id]: true }));
    setTimeout(() => {
      setCopiedStates((prev) => ({ ...prev, [id]: false }));
    }, 2000);
  };

  // Suggest pre-existing codes to jump right in
  const sampleCodes = [
    { code: "BAY-4040", label: "Makan Keluarga (Sharing)" },
    { code: "BAY-9090", label: "Kado Siska (Locked)" },
    { code: "BAY-7788", label: "Futsal Komunitas (Lunas)" },
  ];

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
    } catch {}
  };

  // ── Bill actions ─────────────────────────────────────────
  const handleSearchBillByCode = async (code: string) => {
    if (!code.trim()) return;
    setLoadingCode(true);
    setErrorText("");
    try {
      const res = await fetch(`/api/bills/${code.trim().toUpperCase()}`);
      if (!res.ok) throw new Error((await res.json()).error || "Gagal membuka sesi.");
      onSelectBill(await res.json());
      onRefreshNotifications();
    } catch (err: any) {
      setErrorText(err.message);
    } finally {
      setLoadingCode(false);
    }
  };

  const handleJoinBill = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentBill || !newMemberName.trim()) return;
    setErrorText("");
    setSuccessJoinMsg("");
    try {
      const res = await fetch(`/api/bills/${currentBill.id}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newMemberName.trim() }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Gagal bergabung.");
      onSelectBill(await res.json());
      setSuccessJoinMsg(`Berhasil bergabung sebagai ${newMemberName}!`);
      setNewMemberName("");
      onRefreshNotifications();
      setTimeout(() => setSuccessJoinMsg(""), 4000);
    } catch (er: any) {
      setErrorText(er.message);
    }
  };

  const handleRemoveMember = async (contributorId: string) => {
    if (!currentBill) return;
    try {
      const response = await fetch(
        `/api/bills/${currentBill.id}/contributors/${contributorId}/remove`,
        {
          method: "POST",
        },
      );
      if (response.ok) {
        const updated = await response.json();
        onSelectBill(updated);
        onRefreshNotifications();
      }
    } catch {
      setErrorText("Gagal mencopot anggota.");
    }
  };

  const handleAutoBalance = async (type: "equal" | "remainder") => {
    if (!currentBill) return;
    setErrorText("");
    try {
      const res = await fetch(`/api/bills/${currentBill.id}/auto-balance`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      onSelectBill(await res.json());
      onRefreshNotifications();
    } catch (err: any) {
      setErrorText(err.message);
    }
  };

  const handleLockBill = async () => {
    if (!currentBill) return;
    setErrorText("");
    try {
      const res = await fetch(`/api/bills/${currentBill.id}/lock`, { method: "POST" });
      if (!res.ok) throw new Error((await res.json()).error);
      onSelectBill(await res.json());
      onRefreshNotifications();
    } catch (err: any) {
      setErrorText(err.message);
    }
  };

  // WEBHOOK GATEWAY POST TRIGGER (SIMULATED INDIVIDUAL TRANSACTION)
  const handleTriggerWebhookPayment = async (
    contributorId: string,
    name: string,
    shareAmount: number,
  ) => {
    if (!currentBill) return;
    setSimulatings((prev) => ({ ...prev, [contributorId]: true }));

    // Default system method to QRIS if not selected
    const chosenMethod = selectedGateway[contributorId] || "QRIS Bank Mandiri";

    // Formulate realistic transaction payload
    const payload = {
      billId: currentBill.id,
      contributorId,
      amount: shareAmount,
      paymentMethod: chosenMethod,
      secureToken: "MOCK_SPLITBAY_SECURE_TOKEN",
    };

    // Output visual log to sandbox console
    const newLog = `[${new Date().toLocaleTimeString()}] Sending WebHook POST /api/webhook/payment -> Name: ${name}, Rp ${shareAmount.toLocaleString("id-ID")} via ${chosenMethod}...`;
    setWebhookLogs((prev) => [newLog, ...prev]);

    try {
      // Simulate physical payment processing delay (1.2 seconds)
      await new Promise((resolve) => setTimeout(resolve, 1200));

      const response = await fetch("/api/webhook/payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const resData = await response.json();

      if (response.ok) {
        const successLog = `[${new Date().toLocaleTimeString()}] HTTP 200 SUCCESS via Gateway! Ref ID: ${resData.transactionId || "N/A"}. Bill status: ${resData.billStatus}`;
        setWebhookLogs((prev) => [successLog, ...prev]);

        // Refresh component state
        refreshBillData(currentBill.id);
        onRefreshNotifications();
      } else {
        const failLog = `[${new Date().toLocaleTimeString()}] Webhook Error: ${resData.error || "Gagal verifikasi pembayaran."}`;
        setWebhookLogs((prev) => [failLog, ...prev]);
        setErrorText(resData.error || "Kalkulasi pembayaran gagal diverifikasi.");
      }
    } catch (err: any) {
      const errorLog = `[${new Date().toLocaleTimeString()}] Network Connection timeout to Gateway Webhook.`;
      setWebhookLogs((prev) => [errorLog, ...prev]);
    } finally {
      setSimulatings((prev) => ({ ...prev, [contributorId]: false }));
    }
  };

  // Helper values
  const currentAssignedTotal =
    currentBill?.contributors.reduce((sum, c) => sum + c.shareAmount, 0) || 0;
  const isBalanced = currentBill ? currentAssignedTotal === currentBill.totalAmount : false;
  const balanceDifference = currentBill ? currentBill.totalAmount - currentAssignedTotal : 0;

  return (
    <div className="space-y-6" id="workspace-root-panel">
      {/* Search & Code Insertion View */}
      {!currentBill ? (
        <div className="max-w-xl mx-auto space-y-8 py-8 animate-fade-in" id="join-portal-gate">
          <div className="text-center space-y-3">
            <div className="mx-auto w-16 h-16 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl flex items-center justify-center text-emerald-700 shadow-xs">
              <Key className="w-8 h-8" />
            </div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">
              Gabung Sesi Patungan SplitBay
            </h1>
            <p className="text-sm text-slate-500 max-w-sm mx-auto leading-relaxed">
              Masukkan kode patungan unik (4 angka di belakang BAY) yang diberikan oleh Kasir atau
              temanmu.
            </p>
          </div>

          <div className="bg-white rounded-3xl border border-slate-200 shadow-xl p-8 space-y-6">
            <div className="space-y-2">
              <label className="text-[11px] font-bold text-slate-400 block uppercase tracking-wider">
                KODE PATUNGAN (SPLIT CODE)
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Contoh: BAY-4040"
                  value={searchCode}
                  onChange={(e) => setSearchCode(e.target.value)}
                  className="flex-1 px-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-lg font-mono font-bold uppercase tracking-widest text-emerald-850 focus:bg-white focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 focus:outline-hidden transition-all text-center"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleSearchBillByCode(searchCode);
                    }
                  }}
                />
                <button
                  onClick={() => handleSearchBillByCode(searchCode)}
                  disabled={loadingCode}
                  className="px-6 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-2xl shadow-lg shadow-emerald-600/10 transition-all flex items-center justify-center cursor-pointer"
                >
                  {loadingCode ? (
                    <RefreshCw className="w-5 h-5 animate-spin" />
                  ) : (
                    <ChevronRight className="w-6 h-6" />
                  )}
                </button>
              </div>
            </div>

            {errorText && (
              <div className="p-4 bg-red-50 text-red-700 rounded-xl border border-red-100 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
                <span>{errorText}</span>
              </div>
            )}

            {/* Simulated Live Connections to Test Right Away */}
            <div className="border-t border-slate-100 pt-6 space-y-3">
              <span className="text-[11px] font-bold text-slate-400 block uppercase tracking-wider">
                ATAU PILIH SESI SIMULASI KASIR AKTIF:
              </span>
              <div className="grid grid-cols-1 gap-2.5">
                {sampleCodes.map((sc, idx) => (
                  <button
                    key={idx}
                    onClick={() => {
                      setSearchCode(sc.code);
                      handleSearchBillByCode(sc.code);
                    }}
                    type="button"
                    className="w-full flex items-center justify-between p-3.5 bg-slate-50 hover:bg-emerald-50/50 border border-slate-200 hover:border-emerald-300 rounded-xl transition-all text-left text-xs text-slate-700 cursor-pointer"
                  >
                    <div className="flex items-center gap-3">
                      <span className="font-mono bg-white border border-slate-200 text-emerald-800 font-bold px-2 py-1 rounded-md shadow-2xs">
                        {sc.code}
                      </span>
                      <span className="font-medium text-slate-700">{sc.label}</span>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-400" />
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* Workspace when Active Bill is loaded */
        <div className="space-y-6 animate-fade-in" id="active-group-workspace">
          {/* Back Button and Info Header */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white border border-slate-200 shadow-sm rounded-2xl p-5">
            <div className="flex items-center gap-3">
              <button
                onClick={() => {
                  onSelectBill(null);
                  setErrorText("");
                  setSuccessJoinMsg("");
                }}
                className="p-2 hover:bg-slate-50 rounded-xl transition-all border border-slate-200 cursor-pointer"
                title="Kembali ke gerbang join"
              >
                <ArrowLeft className="w-4 h-4 text-slate-600" />
              </button>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono font-bold text-emerald-800 bg-emerald-50 border border-emerald-100 px-2.5 py-1 rounded-md shadow-3xs uppercase">
                    KODE: {currentBill.code}
                  </span>

                  {currentBill.status === "SHARING" && (
                    <span className="text-[10px] font-bold bg-amber-50 text-amber-800 px-2 py-0.5 rounded-full border border-amber-200">
                      Membagi Tagihan
                    </span>
                  )}
                  {currentBill.status === "LOCKED" && (
                    <span className="text-[10px] font-bold bg-indigo-50 text-indigo-800 px-2 py-0.5 rounded-full border border-indigo-200">
                      Invoice Dikunci
                    </span>
                  )}
                  {currentBill.status === "COMPLETED" && (
                    <span className="text-[10px] font-bold bg-emerald-500 text-white px-2 py-0.5 rounded-full border border-emerald-600">
                      Lunas Webhook
                    </span>
                  )}
                </div>
                <h2 className="text-xl font-black text-slate-900 mt-1">{currentBill.title}</h2>
                <p className="text-xs text-slate-500 mt-0.5">{currentBill.description}</p>
              </div>
            </div>

            <div className="text-left md:text-right shrink-0">
              <span className="text-[11px] text-slate-400 font-bold uppercase tracking-wider block">
                TOTAL TAGIHAN KASIR
              </span>
              <span className="text-2xl font-black text-emerald-800 font-mono">
                Rp {currentBill.totalAmount.toLocaleString("id-ID")}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left and Mid Grid: Configuration state */}
            <div className="lg:col-span-2 space-y-6">
              {/* Alert & Validation progress bar */}
              <div className="bg-white border border-slate-200 shadow-sm rounded-2xl p-6 space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Meter Keseimbangan Patungan
                  </span>
                  <span className="text-xs font-mono text-slate-500">
                    Rp {currentAssignedTotal.toLocaleString("id-ID")} / Rp{" "}
                    {currentBill.totalAmount.toLocaleString("id-ID")}
                  </span>
                </div>

                {/* Progress bar */}
                <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden flex">
                  {currentAssignedTotal > 0 && (
                    <div
                      className={`h-full transition-all duration-300 ${
                        currentAssignedTotal < currentBill.totalAmount
                          ? "bg-amber-500"
                          : currentAssignedTotal > currentBill.totalAmount
                            ? "bg-red-500"
                            : "bg-emerald-500"
                      }`}
                      style={{
                        width: `${Math.min(100, (currentAssignedTotal / currentBill.totalAmount) * 100)}%`,
                      }}
                    />
                  )}
                </div>

                {/* Indonesian Warning Alerts */}
                {currentBill.status === "SHARING" ? (
                  <div className="pt-2">
                    {currentAssignedTotal === 0 ? (
                      <div className="p-3 bg-slate-50 border border-slate-200 text-slate-600 rounded-xl text-xs flex items-center gap-2">
                        <Users className="w-4 h-4 text-slate-400 shrink-0" />
                        <span>
                          Belum ada pembagian nominal. Silakan tambahkan anggota tim & atur tagihan
                          di bawah.
                        </span>
                      </div>
                    ) : balanceDifference > 0 ? (
                      <div className="p-3.5 bg-amber-50/75 border border-amber-200 text-amber-900 rounded-xl text-xs flex items-start gap-2.5">
                        <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                        <div>
                          <span className="font-bold block">🚨 Pembayaran masih kurang</span>
                          <span className="text-slate-700">
                            Masih ada sisa{" "}
                            <strong>Rp {balanceDifference.toLocaleString("id-ID")}</strong> yang
                            belum dialokasikan ke siapapun. Gunakan tombol{" "}
                            <strong className="text-emerald-700">Auto-Balancing</strong> di samping
                            untuk membagi rata.
                          </span>
                        </div>
                      </div>
                    ) : balanceDifference < 0 ? (
                      <div className="p-3.5 bg-red-50/70 border border-red-200 text-red-900 rounded-xl text-xs flex items-start gap-2.5">
                        <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                        <div>
                          <span className="font-bold block">
                            🚨 Pembayaran melebihi total harga
                          </span>
                          <span className="text-slate-700">
                            Total alokasi berlebih sebesar{" "}
                            <strong>
                              Rp {Math.abs(balanceDifference).toLocaleString("id-ID")}
                            </strong>{" "}
                            dari tagihan Kasir. Harap kurangi kontribusi individu.
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="p-3.5 bg-emerald-50 border border-emerald-500/20 text-emerald-900 rounded-xl text-xs flex items-start gap-2.5 shadow-2xs">
                        <CheckCircle2 className="w-4.5 h-4.5 text-emerald-600 shrink-0" />
                        <div className="flex-1">
                          <span className="font-bold block text-emerald-800">
                            🎉 Pembayaran Pas & Seimbang!
                          </span>
                          <span className="text-slate-700 font-medium block mt-0.5">
                            Total tagihan terkumpul pas Rp{" "}
                            {currentBill.totalAmount.toLocaleString("id-ID")}. Silakan kunci
                            konfirmasi untuk memecah menjadi invoice parsial.
                          </span>
                          <button
                            onClick={handleLockBill}
                            className="mt-3.5 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl transition-all shadow-md shadow-emerald-600/15 text-xs inline-flex items-center gap-2 cursor-pointer"
                          >
                            <ShieldCheck className="w-4 h-4" />
                            Kunci & Terbitkan Invoice Sekarang
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="p-3.5 bg-emerald-950 text-emerald-200 rounded-xl text-xs flex items-center justify-between">
                    <div className="flex items-center gap-2 text-emerald-100">
                      <ShieldCheck className="w-4.5 h-4.5 text-emerald-400" />
                      <span>
                        Tagihan terkonfirmasi {currentBill.contributors.length} invoice terpisah.
                      </span>
                    </div>
                    {currentBill.status === "COMPLETED" && (
                      <span className="bg-emerald-500 text-white px-2 py-0.5 rounded font-black text-[9px] uppercase">
                        LUNAS AMAN
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Members Workspace Block */}
              <div className="bg-white border border-slate-200 shadow-sm rounded-2xl p-6 space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                      <Users className="w-4 h-4 text-emerald-600" />
                      Anggota Tim Patungan ({currentBill.contributors.length} orang)
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Pendamping setuju untuk membagi tagihan kasir secara mandiri
                    </p>
                  </div>

                  {currentBill.status === "SHARING" && (
                    <div className="flex flex-wrap gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleAutoBalance("equal")}
                        className="px-3 py-1.5 bg-slate-50 border border-slate-200 hover:border-emerald-300 hover:bg-emerald-50 text-[11px] font-bold text-slate-705 rounded-lg transition-all flex items-center gap-1 cursor-pointer"
                        title="Bagi rata nominal seluruh anggota"
                      >
                        ⚡ Bagi Rata
                      </button>
                      <button
                        type="button"
                        onClick={() => handleAutoBalance("remainder")}
                        disabled={balanceDifference <= 0}
                        className="px-3 py-1.5 bg-slate-50 border border-slate-200 hover:border-emerald-300 hover:bg-emerald-50 text-[11px] font-bold text-slate-705 rounded-lg transition-all flex items-center gap-1 disabled:opacity-35 cursor-pointer"
                        title="Taruh sisa kekurangan tagihan pada kas kosong"
                      >
                        ⚖️ Bagi Sisa
                      </button>
                    </div>
                  )}
                </div>

                {errorText && (
                  <div className="p-3 bg-red-50 text-red-700 text-xs rounded-lg border border-red-100">
                    {errorText}
                  </div>
                )}

                {successJoinMsg && (
                  <div className="p-3 bg-emerald-50 text-emerald-800 text-xs rounded-lg border border-emerald-100">
                    {successJoinMsg}
                  </div>
                )}

                {/* Form JOIN as multi-user Simulator inside same webapp */}
                {currentBill.status === "SHARING" && (
                  <div className="space-y-3">
                    {currentUser &&
                      !currentBill.contributors.some(
                        (c) =>
                          c.name.toLowerCase() === currentUser.name.toLowerCase() ||
                          c.name.toLowerCase() === currentUser.username.toLowerCase(),
                      ) && (
                        <button
                          type="button"
                          onClick={async () => {
                            setErrorText("");
                            setSuccessJoinMsg("");
                            try {
                              const response = await fetch(`/api/bills/${currentBill.id}/join`, {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ name: currentUser.name }),
                              });

                              if (!response.ok) {
                                const err = await response.json();
                                throw new Error(err.error || "Gagal bergabung otomatis.");
                              }

                              const updated = await response.json();
                              onSelectBill(updated);
                              setSuccessJoinMsg(
                                `Berhasil bergabung otomatis sebagai ${currentUser.name}!`,
                              );
                              onRefreshNotifications();
                              setTimeout(() => setSuccessJoinMsg(""), 4000);
                            } catch (er: any) {
                              setErrorText(er.message);
                            }
                          }}
                          className="w-full py-2 bg-emerald-50 hover:bg-emerald-100 border border-dashed border-emerald-300 text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 cursor-pointer text-emerald-85 w-full transition-all"
                        >
                          ⚡ Gabung Instan Sebagai:{" "}
                          <span className="underline font-extrabold">{currentUser.name}</span>
                        </button>
                      )}
                    <form
                      onSubmit={handleJoinBill}
                      className="flex gap-2 bg-slate-50 p-3 rounded-xl border border-slate-200 shadow-inner"
                    >
                      <div className="relative flex-1">
                        <span className="absolute left-3.5 top-2.5 text-xs text-emerald-600 font-bold">
                          @
                        </span>
                        <input
                          type="text"
                          placeholder="Masukkan nama pembeli baru (misal: Cici, Deni)"
                          value={newMemberName}
                          onChange={(e) => setNewMemberName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                            }
                          }}
                          className="w-full pl-8 pr-3 py-1.5 bg-transparent text-xs text-slate-800 focus:outline-hidden"
                        />
                      </div>
                      <button
                        type="submit"
                        className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg text-xs flex items-center gap-1 cursor-pointer shadow-xs transition-colors"
                      >
                        <UserPlus className="w-3.5 h-3.5" />
                        Gabung
                      </button>
                    </form>
                  </div>
                )}

                {/* Contributors Editable Input Grid */}
                <div className="space-y-3">
                  {currentBill.contributors.length === 0 ? (
                    <div className="text-center py-8 text-slate-400 text-xs font-light">
                      Belum ada anggota yang join. Harap ketik nama teman di atas untuk memulai
                      simulasi penggabungan patungan.
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-100">
                      {currentBill.contributors.map((c) => (
                        <div
                          key={c.id}
                          className="py-3 flex flex-col md:flex-row md:items-center justify-between gap-3 bg-white hover:bg-slate-50/50 p-2 rounded-xl transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-emerald-900/10 text-emerald-800 font-bold text-xs flex items-center justify-center border border-emerald-200">
                              {c.name.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <span className="font-semibold text-xs text-slate-800 block">
                                {c.name}
                              </span>
                              <span className="text-[10px] text-slate-400 font-mono block">
                                ID: {c.id}
                              </span>
                            </div>
                          </div>

                          {/* Editable action if in Sharing phase */}
                          <div className="flex items-center gap-2">
                            {currentBill.status === "SHARING" ? (
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] text-slate-500 font-semibold font-mono">
                                  Rp
                                </span>
                                <input
                                  type="number"
                                  value={c.shareAmount || ""}
                                  onChange={(e) => handleUpdateShare(c.id, Number(e.target.value))}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                      e.preventDefault();
                                    }
                                  }}
                                  className="w-24 px-2 py-1 text-xs text-right bg-slate-50 border border-slate-200 focus:bg-white focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 focus:outline-hidden rounded font-mono text-slate-800 font-bold"
                                  placeholder="0"
                                  min="0"
                                />
                                <button
                                  type="button"
                                  onClick={() => handleRemoveMember(c.id)}
                                  className="text-slate-400 hover:text-red-500 p-1 rounded-sm"
                                  title="Hapus dari daftar patungan"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ) : (
                              // Locked state displays fixed amount
                              <div className="flex items-center gap-1.5">
                                <span className="text-xs font-bold font-mono text-slate-800">
                                  Rp {c.shareAmount.toLocaleString("id-ID")}
                                </span>
                                {c.paymentStatus === "PAID" ? (
                                  <span className="bg-emerald-100 text-emerald-850 border border-emerald-200 text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase">
                                    Lunas
                                  </span>
                                ) : (
                                  <span className="bg-amber-55 text-amber-800 border border-amber-200 text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase">
                                    Menunggu
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Individual Invoice Grid / Webhook Trigger Station */}
              {(currentBill.status === "LOCKED" || currentBill.status === "COMPLETED") && (
                <div
                  className="bg-white border border-slate-200 shadow-sm rounded-2xl p-6 space-y-5 animate-fade-in"
                  id="invoice-payment-sandbox"
                >
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                      <CreditCard className="w-4 h-4 text-emerald-600" />
                      Invoice Parsial Terbit (Siap Bayar Simulasian Bank Webhook)
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Setiap anggota mendapat porsi tagihan terpisah. Gunakan tombol sandbox di
                      bawah untuk menirukan transfer e-wallet/bank demi memverifikasi auto integrasi
                      webhook kami.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {currentBill.contributors.map((c) => (
                      <div
                        key={c.id}
                        className={`p-4 border rounded-2xl transition-all relative overflow-hidden ${
                          c.paymentStatus === "PAID"
                            ? "bg-emerald-500/5 border-emerald-500/20"
                            : "bg-white border-slate-200 shadow-sm"
                        }`}
                      >
                        {/* Status bar graphic */}
                        <div
                          className={`absolute top-0 left-0 right-0 h-1 ${c.paymentStatus === "PAID" ? "bg-emerald-500" : "bg-amber-500"}`}
                        />

                        <div className="flex justify-between items-start pt-1">
                          <div>
                            <span className="text-[10px] font-bold text-slate-400 block uppercase font-mono">
                              INVOICE PARSIAL
                            </span>
                            <span className="font-bold text-slate-800 text-sm">{c.name}</span>
                          </div>
                          <span className="text-base font-black font-mono text-emerald-800">
                            Rp {c.shareAmount.toLocaleString("id-ID")}
                          </span>
                        </div>

                        {c.paymentStatus === "PAID" ? (
                          <div className="mt-4 bg-emerald-50 border border-emerald-200/50 rounded-xl p-3 space-y-1.5">
                            <span className="text-[10px] text-emerald-800 font-bold block flex items-center gap-1 uppercase">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                              Pembayaran Sukses Webhook
                            </span>
                            <div className="text-[10px] text-slate-500 font-mono space-y-0.5">
                              <div>REF ID: {c.transactionId}</div>
                              <div>
                                Waktu: {c.paidAt ? new Date(c.paidAt).toLocaleTimeString() : "-"}
                              </div>
                            </div>
                          </div>
                        ) : (
                          // Sandbox controller inside the actual invoice!
                          <div className="mt-4 pt-3 border-t border-slate-100 space-y-3">
                            <div className="flex gap-2 items-center">
                              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block shrink-0">
                                Metode Bayar:
                              </label>
                              <select
                                value={selectedGateway[c.id] || "QRIS BCA"}
                                onChange={(e) =>
                                  setSelectedGateway((prev) => ({
                                    ...prev,
                                    [c.id]: e.target.value,
                                  }))
                                }
                                className="flex-1 text-[11px] bg-slate-50 border border-slate-250 rounded-lg px-2 py-1.5 text-slate-700 font-medium focus:outline-hidden focus:ring-1 focus:ring-emerald-550 focus:bg-white"
                              >
                                <option value="QRIS BCA">QRIS Instan BCA</option>
                                <option value="Virtual Account Mandiri">
                                  VA Bank Mandiri (SplitBay Integration)
                                </option>
                                <option value="GoPay">GoPay (Gojek Sandbox)</option>
                                <option value="ShopeePay">ShopeePay</option>
                                <option value="OVO Wallet">OVO Dompet Kilat</option>
                              </select>
                            </div>

                            {/* Live Generated Payment Gateway Credentials Box */}
                            {(() => {
                              const chosenGateway = selectedGateway[c.id] || "QRIS BCA";
                              const isVA =
                                chosenGateway.toLowerCase().includes("mandiri") ||
                                chosenGateway.toLowerCase().includes("virtual") ||
                                chosenGateway.toLowerCase().includes("va");

                              return (
                                <div className="bg-slate-50 border border-slate-200/60 rounded-xl p-3 space-y-2 text-left">
                                  {isVA ? (
                                    // Virtual Account Style
                                    <div className="space-y-2">
                                      <div className="flex justify-between items-center text-[9px] text-slate-400 font-bold uppercase tracking-wider">
                                        <span>Virtual Account Gateway</span>
                                        <span className="bg-emerald-100 text-emerald-800 border border-emerald-200 px-1 py-0.2 rounded text-[8px] tracking-normal font-sans">
                                          PENDING TRANSFER
                                        </span>
                                      </div>

                                      <div className="bg-white border border-slate-200 p-2.5 rounded-lg flex items-center justify-between shadow-2xs">
                                        <div>
                                          <span className="text-[9px] text-slate-400 font-bold block uppercase leading-none mb-1">
                                            {chosenGateway.toLowerCase().includes("mandiri")
                                              ? "BANK MANDIRI VA"
                                              : "VIRTUAL ACCOUNT"}
                                          </span>
                                          <span className="font-mono text-xs font-extrabold text-slate-800 tracking-wider">
                                            {getVAForContributor(c.name, c.id, chosenGateway)}
                                          </span>
                                        </div>
                                        <button
                                          type="button"
                                          onClick={() =>
                                            handleCopyText(
                                              c.id,
                                              getVAForContributor(
                                                c.name,
                                                c.id,
                                                chosenGateway,
                                              ).replace(/\s/g, ""),
                                            )
                                          }
                                          className="p-1 px-2 bg-slate-100 hover:bg-emerald-50 text-slate-600 hover:text-emerald-700 rounded text-[9px] font-bold transition-all border border-slate-200 flex items-center gap-1 cursor-pointer"
                                        >
                                          {copiedStates[c.id] ? (
                                            <>
                                              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                              Copied!
                                            </>
                                          ) : (
                                            <>
                                              <Copy className="w-3 h-3" />
                                              Copy
                                            </>
                                          )}
                                        </button>
                                      </div>

                                      <p className="text-[9.5px] text-slate-500 leading-normal font-sans">
                                        Transfer tepat{" "}
                                        <strong className="text-slate-800 font-extrabold font-mono">
                                          Rp {c.shareAmount.toLocaleString("id-ID")}
                                        </strong>{" "}
                                        ke nomor VA di atas. Gateway kami akan memvalidasi lunas
                                        dalam milidetik.
                                      </p>
                                    </div>
                                  ) : (
                                    // QRIS / Barcode Dynamic Display Style
                                    <div className="space-y-2">
                                      <div className="flex justify-between items-center text-[9px] text-slate-400 font-bold uppercase tracking-wider">
                                        <span>Dynamic QRIS / Barcode</span>
                                        <div className="flex gap-1 bg-slate-200/80 p-0.5 rounded border border-slate-300">
                                          <button
                                            type="button"
                                            onClick={() =>
                                              setPaymentModes((prev) => ({
                                                ...prev,
                                                [c.id]: "qris",
                                              }))
                                            }
                                            className={`px-1 rounded text-[8px] font-black uppercase tracking-wider cursor-pointer ${
                                              (paymentModes[c.id] || "qris") === "qris"
                                                ? "bg-white text-emerald-800 shadow-2xs"
                                                : "text-slate-500 hover:text-slate-700"
                                            }`}
                                          >
                                            QRIS
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() =>
                                              setPaymentModes((prev) => ({
                                                ...prev,
                                                [c.id]: "barcode",
                                              }))
                                            }
                                            className={`px-1 rounded text-[8px] font-black uppercase tracking-wider cursor-pointer ${
                                              paymentModes[c.id] === "barcode"
                                                ? "bg-white text-emerald-800 shadow-2xs"
                                                : "text-slate-500 hover:text-slate-700"
                                            }`}
                                          >
                                            Barcode
                                          </button>
                                        </div>
                                      </div>

                                      {(paymentModes[c.id] || "qris") === "qris" ? (
                                        <div className="bg-white border border-slate-200 rounded-lg p-2.5 text-center space-y-1.5 shadow-2xs flex flex-col items-center">
                                          <div className="w-full flex justify-between items-center border-b border-rose-100 pb-1 px-0.5">
                                            <span className="text-[10px] font-black tracking-tighter text-rose-600 font-mono italic">
                                              QRIS GPN
                                            </span>
                                            <span className="text-[8px] font-bold text-teal-600 tracking-tight">
                                              DYNAMICAL BILL
                                            </span>
                                          </div>

                                          <div className="relative group cursor-zoom-in">
                                            <svg
                                              width="100"
                                              height="100"
                                              viewBox="0 0 100 100"
                                              className="mx-auto border border-slate-200/80 p-1 bg-white rounded-md transition-transform duration-200 group-hover:scale-105"
                                            >
                                              {/* Outer Finder Patterns (Top-Left) */}
                                              <rect
                                                x="5"
                                                y="5"
                                                width="22"
                                                height="22"
                                                fill="#0f172a"
                                              />
                                              <rect
                                                x="9"
                                                y="9"
                                                width="14"
                                                height="14"
                                                fill="#ffffff"
                                              />
                                              <rect
                                                x="12"
                                                y="12"
                                                width="8"
                                                height="8"
                                                fill="#0f172a"
                                              />

                                              {/* Outer Finder Patterns (Top-Right) */}
                                              <rect
                                                x="73"
                                                y="5"
                                                width="22"
                                                height="22"
                                                fill="#0f172a"
                                              />
                                              <rect
                                                x="77"
                                                y="9"
                                                width="14"
                                                height="14"
                                                fill="#ffffff"
                                              />
                                              <rect
                                                x="80"
                                                y="12"
                                                width="8"
                                                height="8"
                                                fill="#0f172a"
                                              />

                                              {/* Outer Finder Patterns (Bottom-Left) */}
                                              <rect
                                                x="5"
                                                y="73"
                                                width="22"
                                                height="22"
                                                fill="#0f172a"
                                              />
                                              <rect
                                                x="9"
                                                y="77"
                                                width="14"
                                                height="14"
                                                fill="#ffffff"
                                              />
                                              <rect
                                                x="12"
                                                y="80"
                                                width="8"
                                                height="8"
                                                fill="#0f172a"
                                              />

                                              {/* Alignment Pattern (Bottom-Right) */}
                                              <rect
                                                x="75"
                                                y="75"
                                                width="10"
                                                height="10"
                                                fill="#0f172a"
                                              />
                                              <rect
                                                x="78"
                                                y="78"
                                                width="4"
                                                height="4"
                                                fill="#ffffff"
                                              />
                                              <rect
                                                x="79"
                                                y="79"
                                                width="2"
                                                height="2"
                                                fill="#0f172a"
                                              />

                                              {/* Random Grid representing dynamic invoice hash */}
                                              <rect
                                                x="35"
                                                y="8"
                                                width="4"
                                                height="4"
                                                fill="#0f172a"
                                              />
                                              <rect
                                                x="42"
                                                y="5"
                                                width="8"
                                                height="4"
                                                fill="#0f172a"
                                              />
                                              <rect
                                                x="48"
                                                y="14"
                                                width="4"
                                                height="4"
                                                fill="#0f172a"
                                              />
                                              <rect
                                                x="55"
                                                y="10"
                                                width="4"
                                                height="8"
                                                fill="#0f172a"
                                              />
                                              <rect
                                                x="45"
                                                y="22"
                                                width="10"
                                                height="4"
                                                fill="#0f172a"
                                              />
                                              <rect
                                                x="32"
                                                y="15"
                                                width="8"
                                                height="4"
                                                fill="#0f172a"
                                              />

                                              <rect
                                                x="8"
                                                y="32"
                                                width="8"
                                                height="4"
                                                fill="#0f172a"
                                              />
                                              <rect
                                                x="5"
                                                y="42"
                                                width="4"
                                                height="8"
                                                fill="#0f172a"
                                              />
                                              <rect
                                                x="15"
                                                y="48"
                                                width="8"
                                                height="4"
                                                fill="#0f172a"
                                              />
                                              <rect
                                                x="22"
                                                y="38"
                                                width="4"
                                                height="6"
                                                fill="#0f172a"
                                              />

                                              <rect
                                                x="32"
                                                y="32"
                                                width="12"
                                                height="4"
                                                fill="#0f172a"
                                              />
                                              <rect
                                                x="35"
                                                y="40"
                                                width="4"
                                                height="10"
                                                fill="#0f172a"
                                              />
                                              <rect
                                                x="44"
                                                y="48"
                                                width="10"
                                                height="4"
                                                fill="#0f172a"
                                              />

                                              <rect
                                                x="80"
                                                y="32"
                                                width="12"
                                                height="4"
                                                fill="#0f172a"
                                              />
                                              <rect
                                                x="84"
                                                y="42"
                                                width="4"
                                                height="6"
                                                fill="#0f172a"
                                              />
                                              <rect
                                                x="75"
                                                y="50"
                                                width="8"
                                                height="4"
                                                fill="#0f172a"
                                              />

                                              {/* Dynamic bits */}
                                              <rect
                                                x="32"
                                                y="60"
                                                width="4"
                                                height="8"
                                                fill="#0f172a"
                                              />
                                              <rect
                                                x="42"
                                                y="65"
                                                width="12"
                                                height="4"
                                                fill="#0f172a"
                                              />
                                              <rect
                                                x="60"
                                                y="60"
                                                width="8"
                                                height="8"
                                                fill="#0f172a"
                                              />

                                              <rect
                                                x="8"
                                                y="60"
                                                width="8"
                                                height="4"
                                                fill="#0f172a"
                                              />
                                              <rect
                                                x="18"
                                                y="65"
                                                width="4"
                                                height="4"
                                                fill="#0f172a"
                                              />

                                              <rect
                                                x="75"
                                                y="62"
                                                width="12"
                                                height="4"
                                                fill="#0f172a"
                                              />
                                              <rect
                                                x="52"
                                                y="78"
                                                width="12"
                                                height="4"
                                                fill="#0f172a"
                                              />
                                              <rect
                                                x="35"
                                                y="82"
                                                width="8"
                                                height="4"
                                                fill="#0f172a"
                                              />

                                              {/* Center Badge Mockup */}
                                              <rect
                                                x="38"
                                                y="38"
                                                width="24"
                                                height="24"
                                                rx="4"
                                                fill="#ffffff"
                                                stroke="#cbd5e1"
                                                strokeWidth="1"
                                              />
                                              <rect
                                                x="41"
                                                y="41"
                                                width="18"
                                                height="18"
                                                rx="2"
                                                fill="#bf1e2e"
                                              />
                                              <text
                                                x="50"
                                                y="52"
                                                fill="#ffffff"
                                                fontSize="8"
                                                fontWeight="black"
                                                textAnchor="middle"
                                                fontFamily="sans-serif"
                                              >
                                                Q
                                              </text>
                                            </svg>
                                          </div>

                                          <div className="space-y-0.5 font-sans">
                                            <span className="text-[8px] text-slate-400 block font-mono">
                                              NMID: ID202652250005 (BCA-SplitBay)
                                            </span>
                                            <span className="text-xs font-bold font-mono text-emerald-800">
                                              Rp {c.shareAmount.toLocaleString("id-ID")}
                                            </span>
                                          </div>
                                        </div>
                                      ) : (
                                        <div className="bg-white border border-slate-200 rounded-lg p-2.5 text-center space-y-2 shadow-2xs flex flex-col items-center">
                                          <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block leading-none">
                                            Scan Barcode Kasir Merchant
                                          </span>

                                          <div className="py-2.5 px-3 bg-white border border-slate-100 rounded-md flex flex-col items-center w-full">
                                            <svg width="140" height="42" className="mx-auto block">
                                              <g fill="#0f172a">
                                                <rect x="3" y="1" width="3" height="28" />
                                                <rect x="8" y="1" width="1" height="28" />
                                                <rect x="11" y="1" width="4" height="28" />
                                                <rect x="17" y="1" width="2" height="28" />
                                                <rect x="22" y="1" width="1" height="28" />
                                                <rect x="25" y="1" width="3" height="28" />
                                                <rect x="29" y="1" width="1" height="28" />
                                                <rect x="33" y="1" width="4" height="28" />
                                                <rect x="40" y="1" width="2" height="28" />
                                                <rect x="44" y="1" width="1" height="28" />
                                                <rect x="47" y="1" width="3" height="28" />
                                                <rect x="53" y="1" width="2" height="28" />
                                                <rect x="57" y="1" width="4" height="28" />
                                                <rect x="62" y="1" width="1" height="28" />
                                                <rect x="65" y="1" width="3" height="28" />
                                                <rect x="69" y="1" width="1" height="28" />
                                                <rect x="73" y="1" width="2" height="28" />
                                                <rect x="77" y="1" width="4" height="28" />
                                                <rect x="84" y="1" width="1" height="28" />
                                                <rect x="87" y="1" width="3" height="28" />
                                                <rect x="91" y="1" width="2" height="28" />
                                                <rect x="95" y="1" width="4" height="28" />
                                                <rect x="101" y="1" width="1" height="28" />
                                                <rect x="104" y="1" width="3" height="28" />
                                                <rect x="108" y="1" width="2" height="28" />
                                                <rect x="112" y="1" width="1" height="28" />
                                                <rect x="115" y="1" width="4" height="28" />
                                                <rect x="121" y="1" width="2" height="28" />
                                                <rect x="125" y="1" width="2" height="28" />
                                              </g>
                                              <text
                                                x="70"
                                                y="38"
                                                fill="#64748b"
                                                fontSize="7"
                                                letterSpacing="1.5"
                                                textAnchor="middle"
                                                fontFamily="monospace"
                                                fontWeight="semibold"
                                              >
                                                {getBarcodeForContributor(c.id, c.shareAmount)}
                                              </text>
                                            </svg>
                                          </div>

                                          <p className="text-[8.5px] text-slate-500 font-sans leading-relaxed">
                                            Tunjukkan barcode ini ke kasir merchant terafiliasi
                                            SplitBay saat checkout untuk validasi.
                                          </p>
                                        </div>
                                      )}

                                      <p className="text-[8.5px] text-slate-400 leading-normal font-sans">
                                        Scan dengan m-Banking (BCA, Mandiri, BRI) atau e-Wallet
                                        favorit Anda.
                                      </p>
                                    </div>
                                  )}
                                </div>
                              );
                            })()}

                            <button
                              onClick={() =>
                                handleTriggerWebhookPayment(c.id, c.name, c.shareAmount)
                              }
                              disabled={simulatings[c.id]}
                              className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs transition-colors cursor-pointer flex items-center justify-center gap-2"
                            >
                              {simulatings[c.id] ? (
                                <>
                                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                  Memproses Webhook VA...
                                </>
                              ) : (
                                <>
                                  <Send className="w-3.5 h-3.5" />
                                  Kirim Simulasi Webhook Lunas
                                </>
                              )}
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Right Grid Column: Webhook Log Console and Itemized Bill Drawer */}
            <div className="space-y-6">
              {/* Receipt Details Box */}
              <div className="bg-white border border-slate-200 shadow-sm rounded-2xl p-6 space-y-4">
                <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                  <ShoppingCart className="w-4 h-4 text-emerald-600" />
                  Rincian Bill dari Kasir
                </h3>

                <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                  {currentBill.items && currentBill.items.length > 0 ? (
                    currentBill.items.map((itm) => (
                      <div
                        key={itm.id}
                        className="flex justify-between items-start text-xs text-slate-600 border-b border-slate-100 pb-2"
                      >
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
                    ))
                  ) : (
                    <div className="text-slate-400 text-center text-[11px] py-4">
                      Total tagihan diatur gelondongan (tanpa detail menu)
                    </div>
                  )}
                </div>

                <div className="border-t border-slate-100 pt-3 flex justify-between items-center text-xs">
                  <span className="font-bold text-slate-700 uppercase">Subtotal Tagihan</span>
                  <span className="font-bold font-mono text-emerald-800 text-sm">
                    Rp {currentBill.totalAmount.toLocaleString("id-ID")}
                  </span>
                </div>
              </div>

              {/* Webhook Sandbox Log Output */}
              <div className="bg-gray-950 text-emerald-400 font-mono text-[10px] rounded-2xl p-5 border border-gray-900 shadow-lg space-y-3">
                <div className="flex justify-between items-center border-b border-emerald-900/40 pb-2">
                  <span className="font-bold tracking-wider text-emerald-300 block uppercase">
                    Sandbox Console Webhook
                  </span>
                  <span
                    className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"
                    title="Webhook is online"
                  />
                </div>

                <p className="text-emerald-500 text-[9px] leading-relaxed">
                  Terminal ini mencatat lalu lintas payload JSON sandbox yang ditembakkan secara
                  asynchronous langsung ke endpoint backend{" "}
                  <code className="bg-emerald-950/80 px-1 border border-emerald-900 text-emerald-300">
                    /api/webhook/payment
                  </code>
                  .
                </p>

                <div className="h-44 overflow-y-auto space-y-1.5 bg-black/45 p-2 rounded-lg scrollbar-thin scrollbar-thumb-emerald-900 border border-emerald-950">
                  {webhookLogs.length === 0 ? (
                    <span className="text-emerald-600/60 text-[9px] block text-center py-8">
                      Belum ada aktivitas webhook terkirim. Gunakan tombol &quot;Kirim Webhook
                      Lunas&quot; di rincian Invoice.
                    </span>
                  ) : (
                    webhookLogs.map((logStr, lIdx) => (
                      <div key={lIdx} className="border-b border-emerald-950 pb-1 leading-normal">
                        {logStr}
                      </div>
                    ))
                  )}
                </div>

                <div className="text-[9px] text-emerald-600 text-center flex items-center justify-center gap-1">
                  <span>🔒 Secure HMAC Token Verified</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
