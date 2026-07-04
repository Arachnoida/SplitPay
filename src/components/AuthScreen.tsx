import { useState, type FormEvent } from "react";
import { ArrowLeft, Key, LogIn, Mail, ShieldCheck, Sparkles, User, UserPlus } from "lucide-react";

type AuthUser = {
  id: string;
  username: string;
  name: string;
  role: "admin" | "user";
};

interface AuthScreenProps {
  onAuthSuccess: (user: AuthUser) => void;
  onBack: () => void;
}

type ApiErrorPayload = {
  error?: string;
  message?: string;
};

const getErrorMessage = async (response: Response, fallback: string) => {
  try {
    const payload = (await response.json()) as ApiErrorPayload;
    return payload.error || payload.message || fallback;
  } catch {
    return fallback;
  }
};

export default function AuthScreen({ onAuthSuccess, onBack }: AuthScreenProps) {
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
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
        : { name: name.trim(), username: username.trim(), password: password.trim() };

      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(await getErrorMessage(response, "Terjadi kesalahan sistem."));
      }

      const data = (await response.json()) as AuthUser;

      if (isLogin) {
        setSuccess("Login berhasil. Mengalihkan...");
        window.setTimeout(() => {
          onAuthSuccess({ ...data, role: data.role ?? "user" });
        }, 700);
      } else {
        setSuccess("Pendaftaran berhasil. Akun baru dibuat sebagai User. Silakan login.");
        setIsLogin(true);
        setPassword("");
      }
    } catch (caughtError) {
      const message =
        caughtError instanceof Error ? caughtError.message : "Gagal menghubungkan ke server.";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      className="mx-auto max-w-md animate-fade-in space-y-6 overflow-hidden rounded-3xl border border-slate-200 bg-white p-6 shadow-xl md:p-8"
      id="auth-card"
    >
      <button
        type="button"
        onClick={onBack}
        className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 transition-colors hover:text-emerald-600"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Kembali ke Beranda
      </button>

      <div className="space-y-2 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-100 font-mono text-xl font-black text-emerald-700 shadow-sm">
          SP
        </div>
        <h2 className="text-xl font-black uppercase tracking-tight text-slate-900">
          {isLogin ? "Masuk ke Akun Anda" : "Daftar Akun Baru"}
        </h2>
        <p className="text-xs font-medium text-slate-400">
          {isLogin
            ? "Masuk untuk membuka dashboard, ruang patungan, dan riwayat pembayaran."
            : "Registrasi publik selalu dibuat sebagai User. Admin dibuat melalui konfigurasi server."}
        </p>
      </div>

      <div className="flex rounded-xl border border-slate-200/60 bg-slate-100 p-1 font-sans">
        <button
          type="button"
          onClick={() => {
            setIsLogin(true);
            setError("");
            setSuccess("");
          }}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-bold transition-all ${
            isLogin ? "bg-white text-emerald-700 shadow-sm" : "text-slate-500 hover:text-slate-800"
          }`}
        >
          <LogIn className="h-3.5 w-3.5" />
          Masuk
        </button>
        <button
          type="button"
          onClick={() => {
            setIsLogin(false);
            setError("");
            setSuccess("");
          }}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-bold transition-all ${
            !isLogin ? "bg-white text-emerald-700 shadow-sm" : "text-slate-500 hover:text-slate-800"
          }`}
        >
          <UserPlus className="h-3.5 w-3.5" />
          Daftar Baru
        </button>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-medium text-red-600">
          <span className="mt-0.5">⚠️</span>
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-medium text-emerald-700">
          <span className="mt-0.5">✅</span>
          <span>{success}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {!isLogin && (
          <div className="space-y-1.5 text-left font-sans">
            <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-400">
              Nama Lengkap
            </label>
            <div className="relative">
              <User className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
              <input
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Contoh: Rian Budiarta"
                required={!isLogin}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-3 text-xs font-medium text-slate-800 focus:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>
          </div>
        )}

        <div className="space-y-1.5 text-left font-sans">
          <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-400">
            Username / Email
          </label>
          <div className="relative">
            <Mail className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="Contoh: gusde atau gusde@mail.com"
              required
              autoCapitalize="none"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-3 text-xs font-medium text-slate-800 focus:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>
        </div>

        <div className="space-y-1.5 text-left font-sans">
          <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-400">
            Password
          </label>
          <div className="relative">
            <Key className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Minimal 4 karakter"
              required
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-3 text-xs font-medium text-slate-800 focus:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>
        </div>

        {!isLogin && (
          <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-3 text-[10px] leading-relaxed text-emerald-900">
            Akun baru otomatis menjadi <strong>User</strong>. User dapat join patungan dan membayar
            invoice. Admin hanya dibuat dari server atau melalui secret khusus agar tidak semua
            orang bisa menjadi kasir.
          </div>
        )}

        <button
          type="submit"
          disabled={isLoading}
          className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl bg-emerald-600 py-3 text-xs font-bold text-white shadow-md shadow-emerald-600/10 transition-all hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isLoading ? (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/60 border-t-white" />
          ) : (
            <>
              {isLogin ? "Masuk ke Panel" : "Daftar sebagai User"}
              <Sparkles className="h-3.5 w-3.5" />
            </>
          )}
        </button>
      </form>

      <div className="flex items-center justify-center gap-1.5 border-t border-slate-100 pt-2 text-[10px] font-medium text-slate-400">
        <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
        <span>Secret admin tidak pernah dikirim dari frontend.</span>
      </div>
    </div>
  );
}
