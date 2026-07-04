import React, { useState, useEffect, type FormEvent } from "react";
import {
  Plus,
  Users,
  Receipt,
  History,
  AlertCircle,
  RefreshCw,
  Sparkles,
  Search,
  ShieldCheck,
  HelpCircle,
  CheckCircle,
  Smartphone,
  Trash,
  ArrowRight,
  Bell,
  Library,
  Database,
  Coffee,
} from "lucide-react";

import { Bill, SplitNotification, TransactionHistory } from "./types";
import CashierPortal from "./components/CashierPortal";
import CustomerWorkspace from "./components/CustomerWorkspace";
import TransparencyHistory from "./components/TransparencyHistory";
import NotificationCenter from "./components/NotificationCenter";
import AuthScreen from "./components/AuthScreen";

export default function App() {
  const [activeTab, setActiveTab] = useState<string>("dashboard");
  const [bills, setBills] = useState<Bill[]>([]);
  const [notifications, setNotifications] = useState<SplitNotification[]>([]);
  const [histories, setHistories] = useState<TransactionHistory[]>([]);
  const [currentBill, setCurrentBill] = useState<Bill | null>(null);

  // Authenticated user state
  const [currentUser, setCurrentUser] = useState<{
    id: string;
    username: string;
    name: string;
    role: "admin" | "user";
  } | null>(() => {
    const saved = localStorage.getItem("splitbay_user");
    try {
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const handleLogout = () => {
    localStorage.removeItem("splitbay_user");
    setCurrentUser(null);
    setActiveTab("dashboard");
  };

  // Dashboard joins search
  const [joinCodeInput, setJoinCodeInput] = useState("");
  const [searchError, setSearchError] = useState("");
  const [isSyncing, setIsSyncing] = useState(false);
  const [appInit, setAppInit] = useState(true);

  // Synchronizers
  const syncPlatformData = async () => {
    setIsSyncing(true);
    try {
      // Pull all active bills
      const billsRes = await fetch("/api/bills");
      if (billsRes.ok) {
        const loadedBills = (await billsRes.ok) ? await billsRes.json() : [];
        setBills(loadedBills);
      }

      // Pull notifications center feed
      const notifRes = await fetch("/api/notifications");
      if (notifRes.ok) {
        const loadedNotifs = await notifRes.json();
        setNotifications(loadedNotifs);
      }

      // Pull ledger histories
      const historyRes = await fetch("/api/history");
      if (historyRes.ok) {
        const loadedHistory = await historyRes.json();
        setHistories(loadedHistory);
      }
    } catch (e) {
      console.error("SplitBay network sync error:", e);
    } finally {
      setIsSyncing(false);
      setAppInit(false);
    }
  };

  // On App Mount, initiate sync
  useEffect(() => {
    syncPlatformData();
    // Start standard platform synchronization interval every 4.5 seconds
    const globalSync = setInterval(() => {
      syncPlatformData();
    }, 4500);

    return () => clearInterval(globalSync);
  }, []);

  const handleCreateNewBillInPortal = (newBill: Bill) => {
    // Add to local state and switch directly to workspace
    setBills((prev) => [newBill, ...prev]);
    setCurrentBill(newBill);
    setActiveTab("patungan");
    syncPlatformData();
  };

  // Dashboard join trigger
  const handleDashboardCodeSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSearchError("");
    if (!joinCodeInput.trim()) return;

    try {
      const response = await fetch(`/api/bills/${joinCodeInput.trim().toUpperCase()}`);
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Sesi patungan tidak ditemukan.");
      }
      const foundBill = await response.json();
      setCurrentBill(foundBill);
      setJoinCodeInput("");
      setActiveTab("patungan");
    } catch (err: any) {
      setSearchError(err.message || "Gagal mencocokkan kode.");
      setTimeout(() => setSearchError(""), 4000);
    }
  };

  const handleResetDatabase = async () => {
    if (
      !window.confirm(
        "Apakah Anda yakin ingin mengatur ulang data simulasi SplitBay ke setelan pabrik?",
      )
    ) {
      return;
    }
    try {
      const response = await fetch("/api/reset", { method: "POST" });
      if (response.ok) {
        setCurrentBill(null);
        setJoinCodeInput("");
        setActiveTab("dashboard");
        await syncPlatformData();
        alert("Sistem berhasil di-reset!");
      }
    } catch (e) {
      alert("Gagal mereset database.");
    }
  };

  const activeBillsCount = bills.filter(
    (b) => b.status === "SHARING" || b.status === "LOCKED",
  ).length;
  const completedBillsCount = bills.filter((b) => b.status === "COMPLETED").length;
  const totalVerifiedFunds = histories
    .filter((h) => h.status === "SUCCESS")
    .reduce((sum, h) => sum + h.amount, 0);

  // Latest notification text for ticker bar
  const latestPayNotification =
    notifications.find((n) => n.type === "PAYMENT_RECEIVED" || n.type === "BILL_COMPLETED")
      ?.message || "SplitBay siap memproses patungan online secara real-time!";

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans text-slate-800">
      {/* Top Banner Ticker representing real-time webhook verifications */}
      <div className="bg-emerald-950 text-emerald-300 px-4 py-2 text-center text-xs font-mono select-none flex items-center justify-center gap-2 overflow-hidden border-b border-emerald-900 shadow-sm leading-normal">
        <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
        <span className="font-bold shrink-0 text-emerald-400 uppercase tracking-wider">
          WEBHOOK STATUS LIVE:
        </span>
        <span className="truncate max-w-lg md:max-w-3xl text-emerald-50">
          {latestPayNotification}
        </span>
        <button
          onClick={syncPlatformData}
          className="ml-2 hover:text-white shrink-0 hidden md:inline-flex items-center gap-1 opacity-80 hover:opacity-100 transition-colors"
          title="Sinkronisasi Data"
        >
          <RefreshCw className={`w-3 h-3 ${isSyncing ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Main Structural Header */}
      <header className="bg-white border-b border-slate-200 shadow-sm sticky top-0 z-10 transition-all">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex justify-between items-center">
          {/* Branded Logo aligned with Emerald Greens for financial unity */}
          <div
            onClick={() => setActiveTab("dashboard")}
            className="flex items-center gap-3 cursor-pointer group"
          >
            <div className="w-9 h-9 bg-emerald-600 rounded-xl flex items-center justify-center shadow-xs group-hover:bg-emerald-700 transition-all text-white font-black text-base font-mono">
              SP®
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-base font-extrabold tracking-tight text-slate-900 uppercase">
                  SplitPay
                </span>
                <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 text-[9px] font-bold px-1.5 py-0.5 rounded">
                  ONLINE
                </span>
              </div>
              <p className="text-[10px] text-slate-400 font-medium tracking-wide">
                Satu Invoice, Banyak Pembayaran Parsial
              </p>
            </div>
          </div>

          {/* Navigation Tabs */}
          <nav className="hidden md:flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl border border-slate-200/60">
            <button
              onClick={() => setActiveTab("dashboard")}
              className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                activeTab === "dashboard"
                  ? "bg-emerald-600 text-white shadow-sm"
                  : "text-slate-600 hover:text-slate-900 hover:bg-white/50"
              }`}
            >
              Dashboard Utama
            </button>

            {/* Admin-only: Portal Kasir */}
            {currentUser?.role === "admin" ? (
              <button
                onClick={() => setActiveTab("cashier")}
                className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                  activeTab === "cashier"
                    ? "bg-emerald-600 text-white shadow-sm"
                    : "text-slate-600 hover:text-slate-900 hover:bg-white/50"
                }`}
              >
                Portal Kasir
              </button>
            ) : (
              <span
                title="Hanya Admin yang dapat mengakses Portal Kasir"
                className="px-3.5 py-1.5 text-xs font-bold rounded-lg text-slate-300 cursor-not-allowed select-none flex items-center gap-1"
              >
                🔒 Portal Kasir
              </span>
            )}

            {/* Ruang Patungan: dapat diakses Admin dan User */}
            <button
              onClick={() => {
                setActiveTab("patungan");
              }}
              className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer relative ${
                activeTab === "patungan"
                  ? "bg-emerald-600 text-white shadow-sm"
                  : "text-slate-600 hover:text-slate-900 hover:bg-white/50"
              }`}
            >
              Ruang Patungan
              {currentBill && (
                <span className="absolute -top-1.5 -right-1 bg-amber-500 text-white text-[8px] font-black rounded-full w-4.5 h-4.5 flex items-center justify-center shadow-xs border border-white font-mono uppercase">
                  {currentBill.code.substring(4)}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab("history")}
              className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                activeTab === "history"
                  ? "bg-emerald-600 text-white shadow-sm"
                  : "text-slate-600 hover:text-slate-900 hover:bg-white/50"
              }`}
            >
              Cek Transparansi (Riwayat)
            </button>
          </nav>

          {/* Reset / Setup actions */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleResetDatabase}
              title="Reset data ke default awal"
              className="p-2 text-xs font-semibold text-slate-400 hover:text-red-500 border border-transparent hover:border-red-100 hover:bg-red-50 rounded-xl transition-all cursor-pointer"
            >
              <Database className="w-4 h-4" />
            </button>

            {currentUser ? (
              <div className="flex items-center gap-2">
                <div className="hidden lg:block text-right select-none">
                  <div className="flex items-center gap-1.5 justify-end">
                    <p className="text-xs font-bold text-slate-800 leading-none">
                      {currentUser.name}
                    </p>
                    {currentUser.role === "admin" ? (
                      <span className="text-[8px] bg-emerald-600 text-white px-1.5 py-0.5 rounded font-black tracking-wider uppercase">
                        ADMIN
                      </span>
                    ) : (
                      <span className="text-[8px] bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded font-black tracking-wider uppercase">
                        USER
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] text-slate-400 font-medium">
                    @{currentUser.username}
                  </span>
                </div>
                <button
                  onClick={handleLogout}
                  className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-all border border-slate-200 cursor-pointer"
                >
                  Keluar
                </button>
              </div>
            ) : (
              <button
                onClick={() => setActiveTab("auth")}
                className="px-3.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center gap-1"
              >
                Masuk / Daftar
              </button>
            )}

            {currentUser?.role === "admin" && (
              <button
                onClick={() => setActiveTab("cashier")}
                className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-md shadow-emerald-600/10 cursor-pointer hidden sm:flex items-center gap-1.5 transition-all"
              >
                <Plus className="w-4 h-4" />
                Kasir Baru
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Mobile Bar menu (Bottom layout) */}
      <div className="md:hidden bg-white border-t border-slate-200 fixed bottom-0 left-0 right-0 z-30 shadow-lg px-4 py-2.5 flex justify-around">
        <button
          onClick={() => setActiveTab("dashboard")}
          className={`flex flex-col items-center gap-1 text-[10px] font-bold ${activeTab === "dashboard" ? "text-emerald-600" : "text-slate-500"}`}
        >
          <Library className="w-4.5 h-4.5" />
          <span>Utama</span>
        </button>

        {currentUser?.role === "admin" ? (
          <button
            onClick={() => setActiveTab("cashier")}
            className={`flex flex-col items-center gap-1 text-[10px] font-bold ${activeTab === "cashier" ? "text-emerald-600" : "text-slate-500"}`}
          >
            <Plus className="w-4.5 h-4.5" />
            <span>Kasir</span>
          </button>
        ) : (
          <span className="flex flex-col items-center gap-1 text-[10px] font-bold text-slate-300 cursor-not-allowed select-none">
            <Plus className="w-4.5 h-4.5" />
            <span>🔒 Kasir</span>
          </span>
        )}

        <button
          onClick={() => setActiveTab("patungan")}
          className={`flex flex-col items-center gap-1 text-[10px] font-bold relative ${activeTab === "patungan" ? "text-emerald-600" : "text-slate-500"}`}
        >
          {currentBill && (
            <span className="absolute -top-1 -right-1.5 bg-amber-500 text-white text-[8px] font-black w-4.5 h-4.5 rounded-full flex items-center justify-center font-mono">
              ★
            </span>
          )}
          <Users className="w-4.5 h-4.5" />
          <span>Patungan</span>
        </button>

        <button
          onClick={() => setActiveTab("history")}
          className={`flex flex-col items-center gap-1 text-[10px] font-bold ${activeTab === "history" ? "text-emerald-600" : "text-slate-500"}`}
        >
          <History className="w-4.5 h-4.5" />
          <span>Riwayat</span>
        </button>
      </div>

      {/* Main Container Content */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8 pb-24 md:pb-12">
        {activeTab === "dashboard" && (
          <div className="space-y-8 animate-fade-in" id="dashboard-tab-view">
            {/* Visual Hero Card explaining full-stack split payment */}
            <div className="bg-radial from-emerald-800 to-emerald-950 text-white rounded-3xl p-6 md:p-8 border border-emerald-900 shadow-xl relative overflow-hidden">
              <div className="absolute right-0 top-0 bottom-0 w-1/3 bg-linear-to-l from-emerald-500/10 to-transparent pointer-events-none" />

              <div className="max-w-2xl space-y-4">
                <span className="px-3 py-1 bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[10px] tracking-widest font-bold uppercase rounded-full inline-block">
                  {currentUser
                    ? currentUser.role === "admin"
                      ? "👑 Sesi Admin Terintegrasi"
                      : "✅ Sesi User Terintegrasi"
                    : "Sistem Informasi Pemisah Invoice & Webhook Integrasi"}
                </span>
                <h1 className="text-3xl md:text-4xl font-black tracking-tight leading-tight">
                  {currentUser ? `Halo, ${currentUser.name}! 👋` : "Manajemen Patungan Tanpa Ribet"}
                </h1>
                <p className="text-sm text-emerald-100/90 leading-relaxed max-w-xl">
                  {currentUser
                    ? currentUser.role === "admin"
                      ? `Anda masuk sebagai Admin (@${currentUser.username}). Akses penuh tersedia: buat tagihan baru, kelola patungan, dan pantau riwayat transaksi!`
                      : `Anda masuk sebagai User (@${currentUser.username}). Anda dapat join ruang patungan memakai kode, melihat invoice parsial, dan membayar melalui Midtrans Sandbox.`
                    : "Admin membuat tagihan tunggal, user join memakai kode unik, lalu setiap invoice parsial dibayar melalui Midtrans Sandbox. Status lunas hanya berubah melalui webhook Midtrans atau Get Status API."}
                </p>
                <div className="flex flex-wrap gap-3 pt-2">
                  {currentUser?.role === "admin" && (
                    <button
                      onClick={() => setActiveTab("cashier")}
                      className="px-5 py-2.5 bg-emerald-400 hover:bg-emerald-300 text-emerald-950 font-extrabold text-xs rounded-xl shadow-lg shadow-emerald-950/45 transition-all cursor-pointer"
                    >
                      Buka Kasir &amp; Buat Tagihan Baru
                    </button>
                  )}
                  {!currentUser ? (
                    <button
                      onClick={() => setActiveTab("auth")}
                      className="px-5 py-2.5 bg-white/10 hover:bg-white/15 text-white font-bold text-xs rounded-xl border border-white/20 transition-all cursor-pointer flex items-center gap-1.5"
                    >
                      Masuk / Daftar Akun
                    </button>
                  ) : currentUser.role === "admin" ? (
                    <button
                      onClick={() => {
                        const myBills = bills.filter(
                          (b) =>
                            b.creatorId === currentUser.id ||
                            b.contributors.some(
                              (c) =>
                                c.name.toLowerCase() === currentUser.name.toLowerCase() ||
                                c.name.toLowerCase() === currentUser.username.toLowerCase(),
                            ),
                        );
                        if (myBills.length > 0) {
                          setCurrentBill(myBills[0]);
                          setActiveTab("patungan");
                        } else if (bills.length > 0) {
                          setCurrentBill(bills[0]);
                          setActiveTab("patungan");
                        } else {
                          setActiveTab("cashier");
                        }
                      }}
                      className="px-5 py-2.5 bg-white/10 hover:bg-white/15 text-white font-bold text-xs rounded-xl border border-white/20 transition-all cursor-pointer"
                    >
                      Buka Patungan Terakhir Anda
                    </button>
                  ) : (
                    <button
                      onClick={() => setActiveTab("patungan")}
                      className="px-5 py-2.5 bg-white/10 hover:bg-white/15 text-white font-bold text-xs rounded-xl border border-white/20 transition-all cursor-pointer"
                    >
                      Buka Ruang Patungan / Masukkan Kode
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Quick Analytics Counters */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-white border border-slate-200 shadow-sm rounded-2xl p-5 flex items-center justify-between">
                <div>
                  <span className="text-[11px] text-slate-400 font-bold uppercase tracking-wider block">
                    Patungan Berjalan
                  </span>
                  <span className="text-2xl font-black text-slate-800 mt-1 block font-mono">
                    {activeBillsCount} Sesi
                  </span>
                </div>
                <div className="p-3 bg-amber-500/10 text-amber-600 rounded-xl">
                  <Users className="w-6 h-6" />
                </div>
              </div>

              <div className="bg-white border border-slate-200 shadow-sm rounded-2xl p-5 flex items-center justify-between">
                <div>
                  <span className="text-[11px] text-slate-400 font-bold uppercase tracking-wider block">
                    Lunas Terbayar
                  </span>
                  <span className="text-2xl font-black text-slate-800 mt-1 block font-mono">
                    {completedBillsCount} Sesi
                  </span>
                </div>
                <div className="p-3 bg-emerald-500/10 text-emerald-600 rounded-xl">
                  <CheckCircle className="w-6 h-6" />
                </div>
              </div>

              <div className="bg-white border border-slate-200 shadow-sm rounded-2xl p-5 flex items-center justify-between">
                <div>
                  <span className="text-[11px] text-slate-400 font-bold uppercase tracking-wider block">
                    Total Dana Terbagi
                  </span>
                  <span className="text-2xl font-black text-emerald-800 mt-1 block font-mono">
                    Rp {totalVerifiedFunds.toLocaleString("id-ID")}
                  </span>
                </div>
                <div className="p-3 bg-emerald-950/10 text-emerald-800 rounded-xl">
                  <Library className="w-6 h-6" />
                </div>
              </div>
            </div>

            {/* Main Interactive Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Left col: Join via code and registered sessions list */}
              <div className="lg:col-span-2 space-y-6">
                {/* Join code entry panel */}
                <div className="bg-white border border-slate-200 shadow-sm rounded-2xl p-6 space-y-4">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5 font-sans">
                      <Search className="w-4.5 h-4.5 text-emerald-600" />
                      Masukkan Kode Patungan Pembeli
                    </h3>
                    <p className="text-xs text-slate-500">
                      Merapat ke rombongan temanmu dengan memasukkan kode unik
                    </p>
                  </div>

                  <form onSubmit={handleDashboardCodeSubmit} className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Contoh: BAY-4040 atau BAY-9090"
                      value={joinCodeInput}
                      onChange={(e) => setJoinCodeInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                        }
                      }}
                      className="flex-1 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold uppercase text-emerald-950 tracking-wider focus:outline-none focus:ring-1 focus:ring-emerald-500 transition-colors"
                    />
                    <button
                      type="submit"
                      className="px-5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center gap-1 shadow-sm"
                    >
                      Buka Ruangan
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </form>

                  {searchError && <p className="text-xs text-red-500 font-medium">{searchError}</p>}
                </div>

                {/* Sesi Patungan Saya (Tampil hanya jika user login) */}
                {currentUser && (
                  <div className="bg-emerald-50/45 border border-emerald-100 shadow-xs rounded-2xl p-6 space-y-4 animate-fade-in">
                    <div className="flex justify-between items-center pb-2 border-b border-emerald-150/80">
                      <div>
                        <h3 className="text-sm font-bold text-emerald-950 flex items-center gap-1.5 font-sans">
                          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                          Sesi Patungan Saya (
                          {
                            bills.filter(
                              (b) =>
                                b.creatorId === currentUser.id ||
                                b.contributors.some(
                                  (c) =>
                                    c.name.toLowerCase() === currentUser.name.toLowerCase() ||
                                    c.name.toLowerCase() === currentUser.username.toLowerCase(),
                                ),
                            ).length
                          }
                          )
                        </h3>
                        <p className="text-xs text-slate-500">
                          Tagihan yang Anda buat sebagai Kasir atau Anda ikuti
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {bills.filter(
                        (b) =>
                          b.creatorId === currentUser.id ||
                          b.contributors.some(
                            (c) =>
                              c.name.toLowerCase() === currentUser.name.toLowerCase() ||
                              c.name.toLowerCase() === currentUser.username.toLowerCase(),
                          ),
                      ).length === 0 ? (
                        <div className="col-span-2 text-center py-6 text-slate-400 text-xs">
                          Anda belum memiliki atau bergabung di sesi patungan manapun. Mari buat
                          tagihan di Portal Kasir atau masukkan kode teman Anda di atas!
                        </div>
                      ) : (
                        bills
                          .filter(
                            (b) =>
                              b.creatorId === currentUser.id ||
                              b.contributors.some(
                                (c) =>
                                  c.name.toLowerCase() === currentUser.name.toLowerCase() ||
                                  c.name.toLowerCase() === currentUser.username.toLowerCase(),
                              ),
                          )
                          .map((b) => (
                            <div
                              key={`my-${b.id}`}
                              onClick={() => {
                                setCurrentBill(b);
                                setActiveTab("patungan");
                              }}
                              className="p-4 bg-white border border-emerald-200 hover:border-emerald-500 hover:shadow-xs rounded-2xl transition-all cursor-pointer space-y-3 relative group"
                            >
                              <div className="flex justify-between items-start">
                                <span className="text-[10px] font-mono font-bold text-emerald-800 bg-emerald-100/60 border border-emerald-200 px-2 py-0.5 rounded">
                                  {b.code}
                                </span>

                                {b.status === "COMPLETED" ? (
                                  <span className="text-[8px] tracking-wide font-black uppercase text-emerald-800 bg-emerald-100 px-1.5 py-0.5 rounded-sm">
                                    Lunas (Webhook)
                                  </span>
                                ) : (
                                  <span className="text-[8px] tracking-wide font-bold uppercase text-amber-800 bg-amber-100 px-1.5 py-0.5 rounded-sm">
                                    {b.status === "SHARING" ? "Seimbang" : "Menunggu Bayar"}
                                  </span>
                                )}
                              </div>

                              <div>
                                <div className="flex items-center gap-1.5">
                                  <h4 className="font-extrabold text-xs text-slate-800 group-hover:text-emerald-700 transition-colors">
                                    {b.title}
                                  </h4>
                                  {b.creatorId === currentUser.id && (
                                    <span className="text-[8px] bg-emerald-600 text-white px-1 py-0.5 rounded font-black tracking-wider uppercase">
                                      KASIR
                                    </span>
                                  )}
                                </div>
                                <p className="text-[10px] text-slate-400 line-clamp-1 mt-0.5">
                                  {b.description}
                                </p>
                              </div>

                              <div className="flex justify-between items-center pt-2 border-t border-slate-100">
                                <span className="text-[10px] text-slate-400 font-semibold">
                                  {b.contributors.length} Pembayar
                                </span>
                                <span className="text-xs font-bold font-mono text-emerald-800">
                                  Rp {b.totalAmount.toLocaleString("id-ID")}
                                </span>
                              </div>
                            </div>
                          ))
                      )}
                    </div>
                  </div>
                )}

                {/* Sesi Patungan Berjalan Lists */}
                <div className="bg-white border border-slate-200 shadow-sm rounded-2xl p-6 space-y-4">
                  <div className="flex justify-between items-center pb-2 border-b border-slate-100">
                    <div>
                      <h3 className="text-sm font-bold text-slate-900">
                        Sesi Patungan Aktif &amp; Riwayat
                      </h3>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Daftar ruangan yang terintegrasi di sistem
                      </p>
                    </div>
                    <button
                      onClick={syncPlatformData}
                      className="text-xs text-slate-500 hover:text-emerald-600 flex items-center gap-1 font-semibold transition-colors cursor-pointer"
                    >
                      <RefreshCw className="w-3 h-3" /> Sinkron
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {appInit ? (
                      <div className="col-span-2 text-center py-12 text-slate-400 text-xs">
                        <RefreshCw className="w-5 h-5 mx-auto animate-spin mb-2" />
                        Sedang memuat data dari server...
                      </div>
                    ) : bills.length === 0 ? (
                      <div className="col-span-2 text-center py-12 text-slate-400 text-xs">
                        Belum ada sesi patungan terekam di sistem. Silakan login sebagai Kasir untuk
                        membuat tagihan baru.
                      </div>
                    ) : (
                      bills.map((b) => (
                        <div
                          key={b.id}
                          onClick={() => {
                            setCurrentBill(b);
                            setActiveTab("patungan");
                          }}
                          className="p-4 bg-white border border-slate-200/85 hover:border-emerald-300 hover:bg-emerald-50/10 rounded-2xl transition-all cursor-pointer space-y-3 relative group shadow-2xs"
                        >
                          <div className="flex justify-between items-start">
                            <span className="text-[10px] font-mono font-bold text-emerald-800 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded">
                              {b.code}
                            </span>

                            {b.status === "COMPLETED" ? (
                              <span className="text-[8px] tracking-wide font-black uppercase text-emerald-800 bg-emerald-100 px-1.5 py-0.5 rounded-sm">
                                Lunas (Webhook)
                              </span>
                            ) : (
                              <span className="text-[8px] tracking-wide font-bold uppercase text-amber-800 bg-amber-100 px-1.5 py-0.5 rounded-sm">
                                {b.status === "SHARING" ? "Membagi Tagihan" : "Menunggu Bayar"}
                              </span>
                            )}
                          </div>

                          <div>
                            <h4 className="font-extrabold text-xs text-slate-800 group-hover:text-emerald-700 transition-colors">
                              {b.title}
                            </h4>
                            <p className="text-[10px] text-slate-400 line-clamp-1 mt-0.5">
                              {b.description}
                            </p>
                          </div>

                          <div className="flex justify-between items-center pt-2 border-t border-slate-100">
                            <span className="text-[10px] text-slate-400 font-semibold">
                              {b.contributors.length} Pembayar
                            </span>
                            <span className="text-xs font-bold font-mono text-emerald-800">
                              Rp {b.totalAmount.toLocaleString("id-ID")}
                            </span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>

              {/* Right column: System Live Notifications pane */}
              <div className="space-y-6">
                <NotificationCenter notifications={notifications} onRefresh={syncPlatformData} />
              </div>
            </div>
          </div>
        )}

        {/* Cashier Tab - Admin only */}
        {activeTab === "cashier" &&
          (currentUser?.role === "admin" ? (
            <CashierPortal
              onBillCreated={handleCreateNewBillInPortal}
              setActiveTab={setActiveTab}
              currentUser={currentUser}
            />
          ) : (
            <div className="flex flex-col items-center justify-center py-24 text-center space-y-4">
              <div className="w-16 h-16 bg-red-50 rounded-2xl flex items-center justify-center text-3xl">
                🔒
              </div>
              <h3 className="text-lg font-black text-slate-800">Akses Ditolak</h3>
              <p className="text-sm text-slate-500 max-w-sm">
                Portal Kasir hanya dapat diakses oleh{" "}
                <span className="font-bold text-emerald-700">Admin</span>. Silakan login dengan akun
                Admin atau hubungi administrator sistem.
              </p>
              <button
                onClick={() => setActiveTab("dashboard")}
                className="px-5 py-2 bg-emerald-600 text-white text-xs font-bold rounded-xl cursor-pointer hover:bg-emerald-700 transition-all"
              >
                Kembali ke Dashboard
              </button>
            </div>
          ))}

        {/* Active Split Workspace Tab - Admin dan User */}
        {activeTab === "patungan" && (
          <CustomerWorkspace
            currentBill={currentBill}
            onSelectBill={setCurrentBill}
            onRefreshNotifications={syncPlatformData}
            currentUser={currentUser}
          />
        )}

        {/* Auth Tab */}
        {activeTab === "auth" && (
          <AuthScreen
            onAuthSuccess={(user) => {
              localStorage.setItem("splitbay_user", JSON.stringify(user));
              setCurrentUser(user);
              setActiveTab("dashboard");
            }}
            onBack={() => setActiveTab("dashboard")}
          />
        )}

        {/* Audit Tab */}
        {activeTab === "history" && (
          <TransparencyHistory histories={histories} onRefresh={syncPlatformData} />
        )}
      </main>

      {/* Footer Branding Statement with clear licensing and system data */}
      <footer className="bg-white border-t border-slate-200 text-slate-400 py-6 text-center text-xs mt-auto">
        <div className="max-w-7xl mx-auto px-4 space-y-1">
          <p className="font-semibold text-slate-600">
            SplitBay® Online Split Bill Platform - Kebersamaan Finansial
          </p>
          <p className="text-[10px] text-slate-400">
            Diproduksi khusus secara higienis menggunakan Midtrans Sandbox, webhook callback
            tervalidasi, dan Automatic Balancing Engine.
          </p>
        </div>
      </footer>
    </div>
  );
}
