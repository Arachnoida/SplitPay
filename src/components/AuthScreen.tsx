import React, { useState } from "react";
import {
  Key, UserPlus, LogIn, Sparkles, ShieldCheck, User, ArrowLeft, Mail, Crown
} from "lucide-react";

interface AuthScreenProps {
  onAuthSuccess: (user: { id: string; username: string; name: string; role: 'admin' | 'user' }) => void;
  onBack: () => void;
}

export default function AuthScreen({ onAuthSuccess, onBack }: AuthScreenProps) {
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<'admin' | 'user'>("user");

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!username.trim() || !password.trim()) {
      setError("Username dan password wajib diisi.");
      return;
    }

    if (!isLogin && !name.trim()) {
      setError("Kolom nama lengkap wajib diisi untuk registrasi baru.");
      return;
    }

    setIsLoading(true);

    try {
      const endpoint = isLogin ? "/api/auth/login" : "/api/auth/register";
      const payload = isLogin
        ? { username: username.trim(), password: password.trim() }
        : { name: name.trim(), username: username.trim(), password: password.trim(), role };

      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Terjadi kesalahan sistem.");
      }

      if (isLogin) {
        setSuccess("Login berhasil! Mengalihkan...");
        setTimeout(() => {
          onAuthSuccess({ ...data, role: data.role ?? 'user' });
        }, 1200);
      } else {
        setSuccess("Pendaftaran sukses! Silakan login untuk masuk.");
        setIsLogin(true);
        setPassword("");
      }
    } catch (err: any) {
      setError(err.message || "Gagal menghubungkan ke server.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto bg-white rounded-3xl border border-slate-200 shadow-xl overflow-hidden animate-fade-in p-6 md:p-8 space-y-6" id="auth-card">
      {/* Header back link */}
      <button
        onClick={onBack}
        className="text-xs text-slate-500 hover:text-emerald-600 transition-colors flex items-center gap-1.5 cursor-pointer font-semibold"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Kembali ke Beranda
      </button>

      <div className="text-center space-y-2">
        <div className="w-12 h-12 bg-emerald-100 text-emerald-700 rounded-2xl flex items-center justify-center mx-auto text-xl font-black font-mono shadow-xs">
          SB
        </div>
        <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">
          {isLogin ? "Masuk ke Akun Anda" : "Daftar Akun Baru"}
        </h2>
        <p className="text-xs text-slate-400 font-medium">
          {isLogin
            ? "Kelola sesi dan rincian transaksi patungan Anda lebih mudah"
            : "Mulai melunasi tagihan parsial otomatis terpecah dengan SplitBay"}
        </p>
      </div>

      {/* Tabs selectors */}
      <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200/60 font-sans">
        <button
          type="button"
          onClick={() => {
            setIsLogin(true);
            setError("");
            setSuccess("");
          }}
          className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 ${isLogin
            ? "bg-white text-emerald-700 shadow-xs"
            : "text-slate-500 hover:text-slate-800"
            }`}
        >
          <LogIn className="w-3.5 h-3.5" />
          Masuk
        </button>
        <button
          type="button"
          onClick={() => {
            setIsLogin(false);
            setError("");
            setSuccess("");
          }}
          className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 ${!isLogin
            ? "bg-white text-emerald-700 shadow-xs"
            : "text-slate-500 hover:text-slate-800"
            }`}
        >
          <UserPlus className="w-3.5 h-3.5" />
          Daftar Baru
        </button>
      </div>

      {/* Status Messages */}
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-600 font-medium flex gap-2 items-start animate-wiggle">
          <span className="mt-0.5">⚠️</span>
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-700 font-medium flex gap-2 items-start">
          <span className="mt-0.5">✅</span>
          <span>{success}</span>
        </div>
      )}

      {/* Auth Form */}
      <form onSubmit={handleSubmit} className="space-y-4">

        {/* Full name (Visible on Register Only) */}
        {!isLogin && (
          <div className="space-y-1.5 text-left font-sans">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Nama Lengkap</label>
            <div className="relative">
              <User className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") e.preventDefault(); }}
                placeholder="Contoh: Rian Budiarta"
                required
                className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 focus:bg-white focus:ring-1 focus:ring-emerald-500 rounded-xl text-xs text-slate-800 focus:outline-hidden font-medium"
              />
            </div>
          </div>
        )}

        {/* Username */}
        <div className="space-y-1.5 text-left font-sans">
          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Username / Email</label>
          <div className="relative">
            <Mail className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") e.preventDefault(); }}
              placeholder="Contoh: rianbudi atau rian@mail.com"
              required
              autoCapitalize="none"
              className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 focus:bg-white focus:ring-1 focus:ring-emerald-500 rounded-xl text-xs text-slate-800 focus:outline-hidden font-medium"
            />
          </div>
        </div>

        {/* Password */}
        <div className="space-y-1.5 text-left font-sans">
          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Password</label>
          <div className="relative">
            <Key className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") e.preventDefault(); }}
              placeholder="Minimal 4 karakter"
              required
              className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 focus:bg-white focus:ring-1 focus:ring-emerald-500 rounded-xl text-xs text-slate-800 focus:outline-hidden font-medium"
            />
          </div>
        </div>

        {/* Role selector (Register only) */}
        {!isLogin && (
          <div className="space-y-1.5 text-left font-sans">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Tipe Akun</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setRole("user")}
                className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border text-xs font-bold transition-all cursor-pointer ${role === "user"
                    ? "bg-emerald-50 border-emerald-400 text-emerald-700 shadow-sm"
                    : "bg-slate-50 border-slate-200 text-slate-500 hover:border-slate-300"
                  }`}
              >
                <User className="w-4 h-4" />
                <span>User Biasa</span>
                <span className="text-[9px] font-normal text-slate-400 leading-tight text-center">Lihat dashboard &amp; riwayat</span>
              </button>
              <button
                type="button"
                onClick={() => setRole("admin")}
                className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border text-xs font-bold transition-all cursor-pointer ${role === "admin"
                    ? "bg-amber-50 border-amber-400 text-amber-700 shadow-sm"
                    : "bg-slate-50 border-slate-200 text-slate-500 hover:border-slate-300"
                  }`}
              >
                <Crown className="w-4 h-4" />
                <span>Admin</span>
                <span className="text-[9px] font-normal text-slate-400 leading-tight text-center">Akses penuh + buat patungan</span>
              </button>
            </div>
          </div>
        )}

        {/* Action Button */}
        <button
          type="submit"
          disabled={isLoading}
          className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition-all cursor-pointer shadow-md shadow-emerald-600/10 flex items-center justify-center gap-1.5 mt-2"
        >
          {isLoading ? (
            <span className="w-4 h-4 border-2 border-white/60 border-t-white rounded-full animate-spin" />
          ) : (
            <>
              {isLogin ? "Masuk ke Panel" : "Registrasikan Sekarang"}
              <Sparkles className="w-3.5 h-3.5" />
            </>
          )}
        </button>

      </form>

      {/* Security note footer */}
      <div className="pt-2 border-t border-slate-100 flex items-center justify-center gap-1.5 text-[10px] text-slate-400 font-medium">
        <ShieldCheck className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
        <span>Enkripsi Secure SHA-256 divalidasi oleh Sandbox Gateway.</span>
      </div>
    </div>
  );
}