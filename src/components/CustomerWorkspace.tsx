import { useMemo, useState, type FormEvent } from "react";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  Copy,
  CreditCard,
  ExternalLink,
  Key,
  QrCode,
  RefreshCw,
  ShieldCheck,
  ShoppingCart,
  Trash2,
  UserPlus,
  Users,
} from "lucide-react";
import type { Bill } from "../types";

type CurrentUser = {
  id: string;
  username: string;
  name: string;
  role: "admin" | "user";
};

type AutoBalanceType = "equal" | "remainder";

type MidtransChannel =
  | "bca_va"
  | "bni_va"
  | "bri_va"
  | "cimb_va"
  | "permata_va"
  | "mandiri_bill"
  | "gopay_qris"
  | "shopeepay"
  | "qris";

type ApiErrorPayload = {
  error?: string;
  message?: string;
  detail?: unknown;
};

type MidtransAction = {
  name?: string;
  method?: string;
  url?: string;
};

type MidtransInstructionPayload = {
  orderId: string;
  transactionId?: string;
  transactionStatus?: string;
  paymentType?: string;
  channel: MidtransChannel;
  redirectUrl?: string;
  token?: string;
  vaNumbers?: Array<{ bank: string; vaNumber: string }>;
  billerCode?: string;
  billKey?: string;
  paymentCode?: string;
  qrString?: string;
  qrImageUrl?: string;
  actions?: MidtransAction[];
  rawStatus?: string;
  expiresAt?: string;
};

type MidtransCreateResponse = {
  success: boolean;
  message?: string;
  instruction: MidtransInstructionPayload;
  midtrans?: {
    statusCode?: string;
    statusMessage?: string;
    transactionId?: string;
    transactionStatus?: string;
  };
};

type MidtransInstruction = MidtransInstructionPayload & {
  createdAt: string;
};

interface CustomerWorkspaceProps {
  currentBill: Bill | null;
  onSelectBill: (bill: Bill | null) => void;
  onRefreshNotifications: () => void;
  currentUser?: CurrentUser | null;
}

const SAMPLE_CODES = [
  { code: "BAY-4040", label: "Makan Keluarga" },
  { code: "BAY-9090", label: "Kado Siska" },
  { code: "BAY-7788", label: "Futsal Komunitas" },
] as const;

const MIDTRANS_CHANNELS: Array<{
  value: MidtransChannel;
  label: string;
  description: string;
}> = [
  {
    value: "bca_va",
    label: "BCA Virtual Account",
    description: "Midtrans Core API akan menerbitkan nomor VA BCA langsung di kartu invoice.",
  },
  {
    value: "bni_va",
    label: "BNI Virtual Account",
    description: "Midtrans Core API akan menerbitkan nomor VA BNI langsung di kartu invoice.",
  },
  {
    value: "bri_va",
    label: "BRI Virtual Account",
    description: "Midtrans Core API akan menerbitkan nomor VA BRI langsung di kartu invoice.",
  },
  {
    value: "cimb_va",
    label: "CIMB Virtual Account",
    description:
      "Midtrans Core API akan menerbitkan nomor VA CIMB jika channel aktif pada akun merchant.",
  },
  {
    value: "permata_va",
    label: "Permata Virtual Account",
    description: "Midtrans Core API akan menerbitkan nomor VA Permata langsung di kartu invoice.",
  },
  {
    value: "mandiri_bill",
    label: "Mandiri Bill Payment",
    description: "Mandiri memakai Company/Biller Code dan Bill Key, bukan satu nomor VA biasa.",
  },
  {
    value: "gopay_qris",
    label: "GoPay / QRIS",
    description: "Midtrans akan mengembalikan QR atau deeplink GoPay/QRIS dari Core API.",
  },
  {
    value: "shopeepay",
    label: "ShopeePay",
    description:
      "Midtrans akan mengembalikan action ShopeePay, seperti redirect atau deeplink pembayaran.",
  },
  {
    value: "qris",
    label: "QRIS",
    description: "Midtrans akan mengembalikan QRIS langsung dari Core API jika channel aktif.",
  },
];

const formatCurrency = (amount: number) => `Rp ${Number(amount || 0).toLocaleString("id-ID")}`;
const normalizeName = (value: string) => value.trim().toLowerCase();

const toSafeAmount = (value: string | number) => {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.trunc(parsed);
};

const compactCredential = (value: string) => value.replace(/\s+/g, "");

const groupPaymentCode = (value?: string) => {
  if (!value) return "";
  const cleaned = compactCredential(value);
  return cleaned.replace(/(.{4})/g, "$1 ").trim();
};

const getChannelInfo = (channel: MidtransChannel) =>
  MIDTRANS_CHANNELS.find((item) => item.value === channel) || MIDTRANS_CHANNELS[0];

const isQrLikeChannel = (channel: MidtransChannel) =>
  channel === "gopay_qris" || channel === "qris" || channel === "shopeepay";

const getUnknownErrorMessage = (error: unknown, fallback = "Terjadi kesalahan.") => {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
};

const readApiError = async (response: Response, fallback: string) => {
  try {
    const payload = (await response.json()) as ApiErrorPayload;
    if (payload.detail) console.error("API detail:", payload.detail);
    return payload.error || payload.message || fallback;
  } catch {
    return fallback;
  }
};

const readJson = async <T,>(response: Response): Promise<T> => (await response.json()) as T;

function StatusBadge({ status }: { status: Bill["status"] }) {
  if (status === "SHARING") {
    return (
      <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-800">
        Membagi Tagihan
      </span>
    );
  }

  if (status === "LOCKED") {
    return (
      <span className="rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[10px] font-bold text-indigo-800">
        Invoice Dikunci
      </span>
    );
  }

  return (
    <span className="rounded-full border border-emerald-600 bg-emerald-500 px-2 py-0.5 text-[10px] font-bold text-white">
      Lunas
    </span>
  );
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
  const [joining, setJoining] = useState(false);
  const [lockingBill, setLockingBill] = useState(false);
  const [autoBalancing, setAutoBalancing] = useState<AutoBalanceType | null>(null);
  const [savingShare, setSavingShare] = useState<Record<string, boolean>>({});
  const [errorText, setErrorText] = useState("");
  const [successJoinMsg, setSuccessJoinMsg] = useState("");
  const [shareInputs, setShareInputs] = useState<Record<string, string>>({});
  const [selectedChannel, setSelectedChannel] = useState<Record<string, MidtransChannel>>({});
  const [creatingPayment, setCreatingPayment] = useState<Record<string, boolean>>({});
  const [checkingPayment, setCheckingPayment] = useState<Record<string, boolean>>({});
  const [paymentInstructions, setPaymentInstructions] = useState<
    Record<string, MidtransInstruction>
  >({});
  const [copiedStates, setCopiedStates] = useState<Record<string, boolean>>({});
  const [paymentLogs, setPaymentLogs] = useState<string[]>([]);

  const currentAssignedTotal = useMemo(
    () =>
      currentBill?.contributors.reduce((sum, contributor) => sum + contributor.shareAmount, 0) || 0,
    [currentBill],
  );
  const balanceDifference = currentBill ? currentBill.totalAmount - currentAssignedTotal : 0;
  const isBalanced = currentBill ? balanceDifference === 0 : false;
  const canManageBill = currentUser?.role === "admin";

  const getContributorAmountInput = (contributorId: string, fallback: number) => {
    return shareInputs[contributorId] ?? String(fallback || "");
  };

  const refreshBillData = async (billId: string) => {
    const response = await fetch(`/api/bills/${billId}`);
    if (!response.ok) {
      throw new Error(await readApiError(response, "Gagal menyegarkan data tagihan."));
    }
    const updatedBill = await readJson<Bill>(response);
    onSelectBill(updatedBill);
    return updatedBill;
  };

  const handleCopyText = async (id: string, text: string) => {
    try {
      await navigator.clipboard?.writeText(text);
      setCopiedStates((previous) => ({ ...previous, [id]: true }));
      window.setTimeout(() => {
        setCopiedStates((previous) => ({ ...previous, [id]: false }));
      }, 1800);
    } catch {
      setErrorText("Browser tidak mengizinkan copy otomatis. Silakan salin manual.");
    }
  };

  const handleSearchBillByCode = async (code: string) => {
    if (!code.trim()) return;

    setLoadingCode(true);
    setErrorText("");
    setSuccessJoinMsg("");

    try {
      const response = await fetch(`/api/bills/${code.trim().toUpperCase()}`);
      if (!response.ok) {
        throw new Error(await readApiError(response, "Sesi patungan tidak ditemukan."));
      }

      const foundBill = await readJson<Bill>(response);
      onSelectBill(foundBill);
      onRefreshNotifications();
    } catch (error) {
      setErrorText(getUnknownErrorMessage(error, "Gagal membuka sesi patungan."));
    } finally {
      setLoadingCode(false);
    }
  };

  const joinBillByName = async (name: string) => {
    if (!currentBill || !name.trim()) return;

    setJoining(true);
    setErrorText("");
    setSuccessJoinMsg("");

    try {
      const response = await fetch(`/api/bills/${currentBill.id}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });

      if (!response.ok) {
        throw new Error(await readApiError(response, "Gagal bergabung ke patungan."));
      }

      const updatedBill = await readJson<Bill>(response);
      onSelectBill(updatedBill);
      setSuccessJoinMsg(`Berhasil bergabung sebagai ${name.trim()}.`);
      setNewMemberName("");
      onRefreshNotifications();
      window.setTimeout(() => setSuccessJoinMsg(""), 3500);
    } catch (error) {
      setErrorText(getUnknownErrorMessage(error, "Gagal bergabung ke patungan."));
    } finally {
      setJoining(false);
    }
  };

  const handleJoinBill = (event: FormEvent) => {
    event.preventDefault();
    void joinBillByName(newMemberName);
  };

  const handleJoinAsCurrentUser = () => {
    if (!currentUser) return;
    void joinBillByName(currentUser.name || currentUser.username);
  };

  const persistShareAmount = async (contributorId: string, rawAmount: string | number) => {
    if (!currentBill || currentBill.status !== "SHARING") return;

    const shareAmount = toSafeAmount(rawAmount);
    setSavingShare((previous) => ({ ...previous, [contributorId]: true }));
    setErrorText("");

    try {
      const response = await fetch(`/api/bills/${currentBill.id}/contributors/${contributorId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shareAmount }),
      });

      if (!response.ok) {
        throw new Error(await readApiError(response, "Gagal menyimpan nominal anggota."));
      }

      const updatedBill = await readJson<Bill>(response);
      onSelectBill(updatedBill);
      setShareInputs((previous) => {
        const next = { ...previous };
        delete next[contributorId];
        return next;
      });
    } catch (error) {
      setErrorText(getUnknownErrorMessage(error, "Gagal menyimpan nominal anggota."));
    } finally {
      setSavingShare((previous) => ({ ...previous, [contributorId]: false }));
    }
  };

  const persistAllShareAmounts = async () => {
    if (!currentBill) return;

    for (const contributor of currentBill.contributors) {
      const rawValue = shareInputs[contributor.id];
      if (rawValue !== undefined && toSafeAmount(rawValue) !== contributor.shareAmount) {
        await persistShareAmount(contributor.id, rawValue);
      }
    }
  };

  const handleRemoveMember = async (contributorId: string) => {
    if (!currentBill) return;

    setErrorText("");

    try {
      const response = await fetch(
        `/api/bills/${currentBill.id}/contributors/${contributorId}/remove`,
        {
          method: "POST",
        },
      );

      if (!response.ok) {
        throw new Error(await readApiError(response, "Gagal menghapus anggota."));
      }

      const updatedBill = await readJson<Bill>(response);
      onSelectBill(updatedBill);
      onRefreshNotifications();
    } catch (error) {
      setErrorText(getUnknownErrorMessage(error, "Gagal menghapus anggota."));
    }
  };

  const handleAutoBalance = async (type: AutoBalanceType) => {
    if (!currentBill) return;

    setAutoBalancing(type);
    setErrorText("");

    try {
      const response = await fetch(`/api/bills/${currentBill.id}/auto-balance`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type }),
      });

      if (!response.ok) {
        throw new Error(await readApiError(response, "Gagal menjalankan auto-balancing."));
      }

      const updatedBill = await readJson<Bill>(response);
      setShareInputs({});
      onSelectBill(updatedBill);
      onRefreshNotifications();
    } catch (error) {
      setErrorText(getUnknownErrorMessage(error, "Gagal menjalankan auto-balancing."));
    } finally {
      setAutoBalancing(null);
    }
  };

  const handleLockBill = async () => {
    if (!currentBill || currentBill.contributors.length === 0 || !isBalanced) return;

    setLockingBill(true);
    setErrorText("");

    try {
      await persistAllShareAmounts();

      const response = await fetch(`/api/bills/${currentBill.id}/lock`, { method: "POST" });
      if (!response.ok) {
        throw new Error(await readApiError(response, "Gagal mengunci tagihan."));
      }

      const updatedBill = await readJson<Bill>(response);
      onSelectBill(updatedBill);
      onRefreshNotifications();
    } catch (error) {
      setErrorText(getUnknownErrorMessage(error, "Gagal mengunci tagihan."));
    } finally {
      setLockingBill(false);
    }
  };

  const handleCreateMidtransPayment = async (contributorId: string) => {
    if (!currentBill) return;

    const paymentChannel = selectedChannel[contributorId] || "bca_va";
    const channelLabel = getChannelInfo(paymentChannel).label;

    setCreatingPayment((previous) => ({ ...previous, [contributorId]: true }));
    setErrorText("");
    setPaymentLogs((previous) => [
      `[${new Date().toLocaleTimeString("id-ID")}] Meminta credential Midtrans Core API untuk ${contributorId} via ${channelLabel}.`,
      ...previous,
    ]);

    try {
      const response = await fetch("/api/payments/midtrans/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          billId: currentBill.id,
          contributorId,
          paymentChannel,
        }),
      });

      if (!response.ok) {
        throw new Error(await readApiError(response, "Gagal membuat transaksi Midtrans."));
      }

      const payload = await readJson<MidtransCreateResponse>(response);
      const instruction = payload.instruction;

      if (!instruction?.orderId) {
        throw new Error("Midtrans tidak mengembalikan order ID pembayaran.");
      }

      setPaymentInstructions((previous) => ({
        ...previous,
        [contributorId]: {
          ...instruction,
          createdAt: new Date().toISOString(),
        },
      }));

      const hasCredential =
        Boolean(instruction.vaNumbers?.length) ||
        Boolean(instruction.billerCode || instruction.billKey || instruction.paymentCode) ||
        Boolean(instruction.qrImageUrl || instruction.qrString || instruction.redirectUrl);

      setPaymentLogs((previous) => [
        `[${new Date().toLocaleTimeString("id-ID")}] Credential Midtrans dibuat. Order ID: ${instruction.orderId}. ${hasCredential ? "Instruksi bayar tampil di invoice." : "Credential detail belum dikembalikan Midtrans."}`,
        ...previous,
      ]);

      await refreshBillData(currentBill.id);
      onRefreshNotifications();
    } catch (error) {
      const message = getUnknownErrorMessage(error, "Gagal membuat transaksi Midtrans.");
      setPaymentLogs((previous) => [
        `[${new Date().toLocaleTimeString("id-ID")}] Midtrans create error: ${message}`,
        ...previous,
      ]);
      setErrorText(message);
    } finally {
      setCreatingPayment((previous) => ({ ...previous, [contributorId]: false }));
    }
  };

  const handleCheckMidtransStatus = async (contributorId: string) => {
    if (!currentBill) return;

    const knownOrderId =
      paymentInstructions[contributorId]?.orderId ||
      currentBill.contributors.find((contributor) => contributor.id === contributorId)
        ?.transactionId;

    setCheckingPayment((previous) => ({ ...previous, [contributorId]: true }));
    setErrorText("");

    try {
      const response = await fetch("/api/payments/midtrans/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          billId: currentBill.id,
          contributorId,
          orderId: knownOrderId,
        }),
      });

      if (!response.ok) {
        throw new Error(await readApiError(response, "Gagal mengecek status Midtrans."));
      }

      const payload = await readJson<{
        transactionStatus?: string;
        billStatus?: string;
        message?: string;
      }>(response);
      setPaymentLogs((previous) => [
        `[${new Date().toLocaleTimeString("id-ID")}] Status Midtrans: ${payload.transactionStatus || "unknown"}. ${payload.message || ""}`,
        ...previous,
      ]);

      await refreshBillData(currentBill.id);
      onRefreshNotifications();
    } catch (error) {
      const message = getUnknownErrorMessage(error, "Gagal mengecek status Midtrans.");
      setPaymentLogs((previous) => [
        `[${new Date().toLocaleTimeString("id-ID")}] Status check error: ${message}`,
        ...previous,
      ]);
      setErrorText(message);
    } finally {
      setCheckingPayment((previous) => ({ ...previous, [contributorId]: false }));
    }
  };

  const renderSearchPortal = () => (
    <div className="mx-auto max-w-xl animate-fade-in space-y-8 py-8" id="join-portal-gate">
      <div className="space-y-3 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-emerald-500/20 bg-emerald-500/10 text-emerald-700 shadow-sm">
          <Key className="h-8 w-8" />
        </div>
        <h1 className="text-2xl font-black tracking-tight text-slate-900">
          Gabung Sesi Patungan SplitPay
        </h1>
        <p className="mx-auto max-w-sm text-sm leading-relaxed text-slate-500">
          Masukkan kode patungan yang diberikan admin atau kasir. User biasa tetap dapat membuka
          ruang ini.
        </p>
      </div>

      <div className="space-y-6 rounded-3xl border border-slate-200 bg-white p-8 shadow-xl">
        <div className="space-y-2">
          <label
            htmlFor="split-code-input"
            className="block text-[11px] font-bold uppercase tracking-wider text-slate-400"
          >
            Kode Patungan
          </label>
          <div className="flex gap-2">
            <input
              id="split-code-input"
              type="text"
              placeholder="Contoh: BAY-4040"
              value={searchCode}
              onChange={(event) => setSearchCode(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void handleSearchBillByCode(searchCode);
                }
              }}
              className="flex-1 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-center font-mono text-lg font-bold uppercase tracking-widest text-emerald-900 transition-all focus:border-emerald-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
            <button
              type="button"
              onClick={() => void handleSearchBillByCode(searchCode)}
              disabled={loadingCode}
              className="flex items-center justify-center rounded-2xl bg-emerald-600 px-6 font-bold text-white shadow-lg shadow-emerald-600/10 transition-all hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loadingCode ? (
                <RefreshCw className="h-5 w-5 animate-spin" />
              ) : (
                <ChevronRight className="h-6 w-6" />
              )}
            </button>
          </div>
        </div>

        {errorText && (
          <div className="flex items-center gap-2 rounded-xl border border-red-100 bg-red-50 p-4 text-xs text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0 text-red-500" />
            <span>{errorText}</span>
          </div>
        )}

        <div className="space-y-3 border-t border-slate-100 pt-6">
          <span className="block text-[11px] font-bold uppercase tracking-wider text-slate-400">
            Sesi demo cepat
          </span>
          <div className="grid grid-cols-1 gap-2.5">
            {SAMPLE_CODES.map((sample) => (
              <button
                key={sample.code}
                type="button"
                onClick={() => {
                  setSearchCode(sample.code);
                  void handleSearchBillByCode(sample.code);
                }}
                className="flex w-full items-center justify-between rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-left text-xs text-slate-700 transition-all hover:border-emerald-300 hover:bg-emerald-50/50"
              >
                <div className="flex items-center gap-3">
                  <span className="rounded-md border border-slate-200 bg-white px-2 py-1 font-mono font-bold text-emerald-800 shadow-sm">
                    {sample.code}
                  </span>
                  <span className="font-medium">{sample.label}</span>
                </div>
                <ChevronRight className="h-4 w-4 text-slate-400" />
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );

  const renderBalanceMeter = () => {
    if (!currentBill) return null;

    const progressWidth =
      currentBill.totalAmount > 0
        ? Math.min(100, (currentAssignedTotal / currentBill.totalAmount) * 100)
        : 0;

    return (
      <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
            Meter Keseimbangan Patungan
          </span>
          <span className="font-mono text-xs text-slate-500">
            {formatCurrency(currentAssignedTotal)} / {formatCurrency(currentBill.totalAmount)}
          </span>
        </div>

        <div className="flex h-3 w-full overflow-hidden rounded-full bg-slate-100">
          {currentAssignedTotal > 0 && (
            <div
              className={`h-full transition-all duration-300 ${
                balanceDifference > 0
                  ? "bg-amber-500"
                  : balanceDifference < 0
                    ? "bg-red-500"
                    : "bg-emerald-500"
              }`}
              style={{ width: `${progressWidth}%` }}
            />
          )}
        </div>

        {currentBill.status === "SHARING" ? (
          <div>
            {currentAssignedTotal === 0 ? (
              <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
                <Users className="h-4 w-4 shrink-0 text-slate-400" />
                <span>
                  Belum ada nominal kontribusi. Tambahkan anggota dan atur share masing-masing.
                </span>
              </div>
            ) : balanceDifference > 0 ? (
              <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50/75 p-3.5 text-xs text-amber-900">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                <div>
                  <span className="block font-bold">Pembagian masih kurang</span>
                  <span className="text-slate-700">
                    Masih ada sisa <strong>{formatCurrency(balanceDifference)}</strong> yang belum
                    dialokasikan.
                  </span>
                </div>
              </div>
            ) : balanceDifference < 0 ? (
              <div className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 p-3.5 text-xs text-red-900">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
                <div>
                  <span className="block font-bold">Pembagian melebihi total tagihan</span>
                  <span className="text-slate-700">
                    Alokasi berlebih sebesar{" "}
                    <strong>{formatCurrency(Math.abs(balanceDifference))}</strong>.
                  </span>
                </div>
              </div>
            ) : (
              <div className="flex items-start gap-2.5 rounded-xl border border-emerald-500/20 bg-emerald-50 p-3.5 text-xs text-emerald-900 shadow-sm">
                <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
                <div className="flex-1">
                  <span className="block font-bold text-emerald-800">
                    Pembagian pas dan siap dikunci
                  </span>
                  <span className="mt-0.5 block font-medium text-slate-700">
                    Setelah dikunci, nominal anggota tidak dapat diubah dan masing-masing invoice
                    siap dibayar melalui Midtrans Sandbox.
                  </span>
                  {canManageBill ? (
                    <button
                      type="button"
                      onClick={() => void handleLockBill()}
                      disabled={lockingBill}
                      className="mt-3.5 inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-bold text-white shadow-md shadow-emerald-600/15 transition-all hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {lockingBill ? (
                        <RefreshCw className="h-4 w-4 animate-spin" />
                      ) : (
                        <ShieldCheck className="h-4 w-4" />
                      )}
                      Kunci dan Terbitkan Invoice
                    </button>
                  ) : (
                    <div className="mt-3.5 rounded-lg border border-emerald-100 bg-white p-2.5 text-[10px] font-medium text-emerald-800">
                      Pembagian sudah pas. Menunggu admin mengunci invoice sebelum pembayaran
                      Midtrans dibuka.
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-between rounded-xl bg-emerald-950 p-3.5 text-xs text-emerald-100">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-emerald-400" />
              <span>
                Tagihan sudah dikunci menjadi {currentBill.contributors.length} invoice parsial.
              </span>
            </div>
            {currentBill.status === "COMPLETED" && (
              <span className="rounded bg-emerald-500 px-2 py-0.5 text-[9px] font-black uppercase text-white">
                Lunas
              </span>
            )}
          </div>
        )}
      </div>
    );
  };

  const renderMembersCard = () => {
    if (!currentBill) return null;

    const userAlreadyJoined = currentUser
      ? currentBill.contributors.some(
          (contributor) =>
            normalizeName(contributor.name) === normalizeName(currentUser.name) ||
            normalizeName(contributor.name) === normalizeName(currentUser.username),
        )
      : false;

    return (
      <div className="space-y-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col justify-between gap-4 border-b border-slate-100 pb-4 sm:flex-row sm:items-center">
          <div>
            <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900">
              <Users className="h-4 w-4 text-emerald-600" />
              Anggota Tim Patungan ({currentBill.contributors.length} orang)
            </h3>
            <p className="mt-0.5 text-xs text-slate-500">
              Admin mengatur tagihan. User biasa dapat join dan membayar invoice parsialnya.
            </p>
          </div>

          {currentBill.status === "SHARING" && canManageBill && (
            <div className="flex shrink-0 flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => void handleAutoBalance("equal")}
                disabled={autoBalancing !== null}
                className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-[11px] font-bold text-slate-700 transition-all hover:border-emerald-300 hover:bg-emerald-50 disabled:opacity-50"
              >
                {autoBalancing === "equal" ? "Memproses..." : "⚡ Bagi Rata"}
              </button>
              <button
                type="button"
                onClick={() => void handleAutoBalance("remainder")}
                disabled={balanceDifference <= 0 || autoBalancing !== null}
                className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-[11px] font-bold text-slate-700 transition-all hover:border-emerald-300 hover:bg-emerald-50 disabled:opacity-35"
              >
                {autoBalancing === "remainder" ? "Memproses..." : "⚖️ Bagi Sisa"}
              </button>
            </div>
          )}
        </div>

        {errorText && (
          <div className="rounded-lg border border-red-100 bg-red-50 p-3 text-xs text-red-700">
            {errorText}
          </div>
        )}
        {successJoinMsg && (
          <div className="rounded-lg border border-emerald-100 bg-emerald-50 p-3 text-xs text-emerald-800">
            {successJoinMsg}
          </div>
        )}

        {currentBill.status === "SHARING" && (
          <div className="space-y-3">
            {currentUser && !userAlreadyJoined && (
              <button
                type="button"
                onClick={handleJoinAsCurrentUser}
                disabled={joining}
                className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-emerald-300 bg-emerald-50 py-2 text-xs font-bold text-emerald-800 transition-all hover:bg-emerald-100 disabled:opacity-60"
              >
                ⚡ Gabung sebagai{" "}
                <span className="font-extrabold underline">{currentUser.name}</span>
              </button>
            )}

            <form
              onSubmit={handleJoinBill}
              className="flex gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 shadow-inner"
            >
              <div className="relative flex-1">
                <span className="absolute left-3.5 top-2.5 text-xs font-bold text-emerald-600">
                  @
                </span>
                <input
                  type="text"
                  placeholder="Masukkan nama pembayar, misal: Cici, Deni"
                  value={newMemberName}
                  onChange={(event) => setNewMemberName(event.target.value)}
                  className="w-full bg-transparent py-1.5 pl-8 pr-3 text-xs text-slate-800 focus:outline-none"
                />
              </div>
              <button
                type="submit"
                disabled={joining || !newMemberName.trim()}
                className="flex items-center gap-1 rounded-lg bg-emerald-600 px-4 py-1.5 text-xs font-bold text-white shadow-sm transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {joining ? (
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <UserPlus className="h-3.5 w-3.5" />
                )}
                Gabung
              </button>
            </form>
          </div>
        )}

        <div className="space-y-3">
          {currentBill.contributors.length === 0 ? (
            <div className="py-8 text-center text-xs font-light text-slate-400">
              Belum ada anggota. Tambahkan nama pembayar untuk memulai pembagian.
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {currentBill.contributors.map((contributor) => {
                const amountInput = getContributorAmountInput(
                  contributor.id,
                  contributor.shareAmount,
                );
                return (
                  <div
                    key={contributor.id}
                    className="flex flex-col justify-between gap-3 rounded-xl bg-white p-2 py-3 transition-colors hover:bg-slate-50/50 md:flex-row md:items-center"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full border border-emerald-200 bg-emerald-900/10 text-xs font-bold text-emerald-800">
                        {contributor.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <span className="block text-xs font-semibold text-slate-800">
                          {contributor.name}
                        </span>
                        <span className="block font-mono text-[10px] text-slate-400">
                          ID: {contributor.id}
                        </span>
                      </div>
                    </div>

                    {currentBill.status === "SHARING" && canManageBill ? (
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[10px] font-semibold text-slate-500">
                          Rp
                        </span>
                        <input
                          type="number"
                          value={amountInput}
                          onChange={(event) =>
                            setShareInputs((previous) => ({
                              ...previous,
                              [contributor.id]: event.target.value,
                            }))
                          }
                          onBlur={(event) =>
                            void persistShareAmount(contributor.id, event.target.value)
                          }
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.preventDefault();
                              void persistShareAmount(contributor.id, amountInput);
                            }
                          }}
                          className="w-28 rounded border border-slate-200 bg-slate-50 px-2 py-1 text-right font-mono text-xs font-bold text-slate-800 focus:border-emerald-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                          min="0"
                          placeholder="0"
                        />
                        {savingShare[contributor.id] && (
                          <RefreshCw className="h-3.5 w-3.5 animate-spin text-slate-400" />
                        )}
                        <button
                          type="button"
                          onClick={() => void handleRemoveMember(contributor.id)}
                          className="rounded-sm p-1 text-slate-400 hover:text-red-500"
                          title="Hapus dari daftar patungan"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-xs font-bold text-slate-800">
                          {formatCurrency(contributor.shareAmount)}
                        </span>
                        {contributor.paymentStatus === "PAID" ? (
                          <span className="rounded-full border border-emerald-200 bg-emerald-100 px-1.5 py-0.5 text-[9px] font-bold uppercase text-emerald-800">
                            Lunas
                          </span>
                        ) : contributor.paymentStatus === "FAILED" ? (
                          <span className="rounded-full border border-red-200 bg-red-50 px-1.5 py-0.5 text-[9px] font-bold uppercase text-red-700">
                            Gagal
                          </span>
                        ) : (
                          <span className="rounded-full border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[9px] font-bold uppercase text-amber-800">
                            Menunggu
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderCopyButton = (copyKey: string, text: string) => (
    <button
      type="button"
      onClick={() => void handleCopyText(copyKey, compactCredential(text))}
      className="flex shrink-0 items-center gap-1 rounded border border-slate-200 bg-slate-100 px-2 py-1 text-[9px] font-bold text-slate-600 transition-colors hover:bg-emerald-50 hover:text-emerald-700"
    >
      {copiedStates[copyKey] ? (
        <CheckCircle2 className="h-3 w-3 text-emerald-600" />
      ) : (
        <Copy className="h-3 w-3" />
      )}
      {copiedStates[copyKey] ? "Copied" : "Copy"}
    </button>
  );

  const renderPaymentField = (args: {
    copyKey: string;
    label: string;
    value?: string;
    helper?: string;
  }) => {
    if (!args.value) return null;

    return (
      <div className="rounded-lg border border-slate-200 bg-white p-2.5 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <span className="block text-[9px] font-bold uppercase tracking-wider text-slate-400">
              {args.label}
            </span>
            <span className="mt-1 block break-all font-mono text-xs font-extrabold tracking-wide text-slate-900">
              {groupPaymentCode(args.value)}
            </span>
          </div>
          {renderCopyButton(args.copyKey, args.value)}
        </div>
        {args.helper && (
          <p className="mt-2 text-[9px] leading-relaxed text-slate-500">{args.helper}</p>
        )}
      </div>
    );
  };

  const renderMidtransInstruction = (contributorId: string, channel: MidtransChannel) => {
    const channelInfo = getChannelInfo(channel);
    const instruction = paymentInstructions[contributorId];
    const showQrPreview = Boolean(instruction?.qrImageUrl || instruction?.qrString);

    return (
      <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-left">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
            Midtrans Core API Credential
          </span>
          <span className="rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[8px] font-bold uppercase text-amber-800">
            Pending sampai settlement
          </span>
        </div>

        <p className="text-[10px] leading-relaxed text-slate-500">{channelInfo.description}</p>

        {!instruction && (
          <div className="rounded-lg border border-dashed border-slate-300 bg-white p-2.5 text-[10px] leading-relaxed text-slate-500">
            Klik <strong>Buat Transaksi</strong> agar backend meminta credential asli dari Midtrans
            Sandbox. Setelah itu VA number, Mandiri Bill Payment, atau QR/action akan tampil
            langsung di sini.
          </div>
        )}

        {instruction && (
          <div className="space-y-3 rounded-lg border border-emerald-100 bg-white p-2.5 text-[10px] text-slate-600 shadow-sm">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <span className="block text-[9px] font-bold uppercase text-slate-400">
                  Order ID
                </span>
                <span className="block break-all font-mono font-bold text-slate-800">
                  {instruction.orderId}
                </span>
                {instruction.expiresAt && (
                  <span className="mt-1 block text-[9px] text-slate-400">
                    Batas bayar: {new Date(instruction.expiresAt).toLocaleString("id-ID")}
                  </span>
                )}
              </div>
              {renderCopyButton(`${contributorId}-order`, instruction.orderId)}
            </div>

            {instruction.vaNumbers?.map((entry, index) =>
              renderPaymentField({
                copyKey: `${contributorId}-va-${index}`,
                label: `${entry.bank} Virtual Account`,
                value: entry.vaNumber,
                helper:
                  "Salin nomor VA ini ke Midtrans Payment Simulator sesuai bank yang dipilih.",
              }),
            )}

            {(instruction.billerCode || instruction.billKey) && (
              <div className="space-y-2 rounded-lg border border-indigo-100 bg-indigo-50 p-2.5">
                <div className="flex items-center justify-between gap-2 text-[9px] font-bold uppercase tracking-wider text-indigo-900">
                  <span>Mandiri Bill Payment</span>
                  <span className="rounded bg-white px-1.5 py-0.5 text-[8px] text-indigo-700">
                    Simulator Ready
                  </span>
                </div>
                {renderPaymentField({
                  copyKey: `${contributorId}-mandiri-biller`,
                  label: "Company Code / Biller Code",
                  value: instruction.billerCode,
                  helper:
                    "Di simulator Mandiri, field ini dapat muncul sebagai Company Code atau Biller Code.",
                })}
                {renderPaymentField({
                  copyKey: `${contributorId}-mandiri-billkey`,
                  label: "Bill Key / Payment Code",
                  value: instruction.billKey || instruction.paymentCode,
                  helper:
                    "Masukkan nilai ini pada field Bill Key atau nomor pembayaran Mandiri di simulator.",
                })}
              </div>
            )}

            {!instruction.vaNumbers?.length &&
              instruction.paymentCode &&
              !instruction.billKey &&
              renderPaymentField({
                copyKey: `${contributorId}-payment-code`,
                label: "Payment Code",
                value: instruction.paymentCode,
                helper: "Gunakan kode pembayaran ini pada simulator metode terkait.",
              })}

            {showQrPreview && (
              <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-center">
                <div className="flex items-center justify-center gap-1 text-[9px] font-bold uppercase tracking-wider text-slate-500">
                  <QrCode className="h-3.5 w-3.5" />
                  QR Pembayaran
                </div>
                {instruction.qrImageUrl ? (
                  <img
                    src={instruction.qrImageUrl}
                    alt={`QR pembayaran ${channelInfo.label}`}
                    className="mx-auto h-36 w-36 rounded-lg border border-slate-200 bg-white object-contain p-2 shadow-sm"
                  />
                ) : (
                  <div className="rounded-lg border border-dashed border-slate-300 bg-white p-3 font-mono text-[9px] leading-relaxed text-slate-500">
                    QR string tersedia, tetapi Midtrans tidak mengembalikan URL gambar QR. Gunakan
                    tombol action di bawah jika tersedia.
                  </div>
                )}
                {instruction.qrString && (
                  <button
                    type="button"
                    onClick={() =>
                      void handleCopyText(`${contributorId}-qr-string`, instruction.qrString || "")
                    }
                    className="inline-flex items-center justify-center gap-1 rounded border border-slate-200 bg-white px-2 py-1 text-[9px] font-bold text-slate-600 hover:bg-emerald-50 hover:text-emerald-700"
                  >
                    {copiedStates[`${contributorId}-qr-string`] ? (
                      <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                    ) : (
                      <Copy className="h-3 w-3" />
                    )}
                    Copy QR URL/String
                  </button>
                )}
              </div>
            )}

            {instruction.redirectUrl && (
              <a
                href={instruction.redirectUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-[10px] font-bold text-white transition-colors hover:bg-slate-800"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Buka Deeplink / Halaman Pembayaran
              </a>
            )}

            {isQrLikeChannel(channel) && !showQrPreview && !instruction.redirectUrl && (
              <div className="rounded-lg border border-amber-100 bg-amber-50 p-2 text-[9.5px] leading-relaxed text-amber-900">
                Transaksi berhasil dibuat, tetapi Midtrans tidak mengembalikan QR/action yang bisa
                dirender langsung. Cek detail response di terminal backend atau gunakan metode VA
                untuk simulasi paling stabil.
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  const renderInvoiceCard = () => {
    if (!currentBill || (currentBill.status !== "LOCKED" && currentBill.status !== "COMPLETED"))
      return null;

    return (
      <div
        className="animate-fade-in space-y-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
        id="invoice-payment-sandbox"
      >
        <div>
          <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900">
            <CreditCard className="h-4 w-4 text-emerald-600" />
            Invoice Parsial dan Pembayaran Midtrans
          </h3>
          <p className="mt-0.5 text-xs text-slate-500">
            Tombol Buat Transaksi meminta credential asli dari Midtrans Core API. VA number, Mandiri
            Bill Payment, atau QR/action akan tampil langsung pada invoice. Status lunas tetap hanya
            diproses melalui webhook Midtrans valid atau Get Status API.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {currentBill.contributors.map((contributor) => {
            const channel = selectedChannel[contributor.id] || "bca_va";
            const shareAmount = contributor.shareAmount;
            const isPaid = contributor.paymentStatus === "PAID";
            const isFailed = contributor.paymentStatus === "FAILED";
            const instruction = paymentInstructions[contributor.id];
            const currentOrderId = instruction?.orderId || contributor.transactionId;

            return (
              <div
                key={contributor.id}
                className={`relative overflow-hidden rounded-2xl border p-4 transition-all ${
                  isPaid
                    ? "border-emerald-500/20 bg-emerald-500/5"
                    : isFailed
                      ? "border-red-200 bg-red-50/40"
                      : "border-slate-200 bg-white shadow-sm"
                }`}
              >
                <div
                  className={`absolute left-0 right-0 top-0 h-1 ${isPaid ? "bg-emerald-500" : isFailed ? "bg-red-500" : "bg-amber-500"}`}
                />

                <div className="flex items-start justify-between pt-1">
                  <div>
                    <span className="block font-mono text-[10px] font-bold uppercase text-slate-400">
                      Invoice Parsial
                    </span>
                    <span className="text-sm font-bold text-slate-800">{contributor.name}</span>
                  </div>
                  <span className="font-mono text-base font-black text-emerald-800">
                    {formatCurrency(shareAmount)}
                  </span>
                </div>

                {isPaid ? (
                  <div className="mt-4 space-y-1.5 rounded-xl border border-emerald-200/50 bg-emerald-50 p-3">
                    <span className="flex items-center gap-1 text-[10px] font-bold uppercase text-emerald-800">
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                      Pembayaran Sukses Midtrans
                    </span>
                    <div className="space-y-0.5 font-mono text-[10px] text-slate-500">
                      <div>REF ID: {contributor.transactionId || "-"}</div>
                      <div>
                        Waktu:{" "}
                        {contributor.paidAt
                          ? new Date(String(contributor.paidAt)).toLocaleTimeString("id-ID")
                          : "-"}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="mt-4 space-y-3 border-t border-slate-100 pt-3">
                    <div className="space-y-1.5">
                      <label
                        htmlFor={`channel-${contributor.id}`}
                        className="block text-[10px] font-bold uppercase tracking-wider text-slate-400"
                      >
                        Metode bayar target
                      </label>
                      <select
                        id={`channel-${contributor.id}`}
                        value={channel}
                        onChange={(event) => {
                          const nextChannel = event.target.value as MidtransChannel;
                          setSelectedChannel((previous) => ({
                            ...previous,
                            [contributor.id]: nextChannel,
                          }));
                          setPaymentInstructions((previous) => {
                            const next = { ...previous };
                            delete next[contributor.id];
                            return next;
                          });
                        }}
                        className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2 py-2 text-[11px] font-medium text-slate-700 focus:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                      >
                        {MIDTRANS_CHANNELS.map((item) => (
                          <option key={item.value} value={item.value}>
                            {item.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    {renderMidtransInstruction(contributor.id, channel)}

                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <button
                        type="button"
                        onClick={() => void handleCreateMidtransPayment(contributor.id)}
                        disabled={
                          creatingPayment[contributor.id] ||
                          shareAmount <= 0 ||
                          currentBill.status !== "LOCKED"
                        }
                        className="flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white shadow-sm transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {creatingPayment[contributor.id] ? (
                          <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <CreditCard className="h-3.5 w-3.5" />
                        )}
                        {instruction ? "Buat Ulang" : "Buat Transaksi"}
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleCheckMidtransStatus(contributor.id)}
                        disabled={checkingPayment[contributor.id] || !currentOrderId}
                        className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700 transition-colors hover:border-emerald-300 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {checkingPayment[contributor.id] ? (
                          <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <RefreshCw className="h-3.5 w-3.5" />
                        )}
                        Cek Status
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderReceiptCard = () => {
    if (!currentBill) return null;

    return (
      <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-700">
          <ShoppingCart className="h-4 w-4 text-emerald-600" />
          Rincian Bill dari Kasir
        </h3>

        <div className="max-h-52 space-y-2 overflow-y-auto pr-1">
          {currentBill.items && currentBill.items.length > 0 ? (
            currentBill.items.map((item) => (
              <div
                key={item.id}
                className="flex items-start justify-between border-b border-slate-100 pb-2 text-xs text-slate-600"
              >
                <div>
                  <span className="font-semibold text-slate-800">{item.name}</span>
                  <span className="mt-0.5 block font-mono text-[10px] text-slate-400">
                    {item.quantity} pcs × {formatCurrency(item.price)}
                  </span>
                </div>
                <span className="shrink-0 font-mono font-medium text-slate-800">
                  {formatCurrency(item.price * item.quantity)}
                </span>
              </div>
            ))
          ) : (
            <div className="py-4 text-center text-[11px] text-slate-400">
              Total tagihan diatur tanpa detail menu.
            </div>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-slate-100 pt-3 text-xs">
          <span className="font-bold uppercase text-slate-700">Subtotal Tagihan</span>
          <span className="font-mono text-sm font-bold text-emerald-800">
            {formatCurrency(currentBill.totalAmount)}
          </span>
        </div>
      </div>
    );
  };

  const renderPaymentConsole = () => (
    <div className="space-y-3 rounded-2xl border border-slate-900 bg-gray-950 p-5 font-mono text-[10px] text-emerald-400 shadow-lg">
      <div className="flex items-center justify-between border-b border-emerald-900/40 pb-2">
        <span className="block font-bold uppercase tracking-wider text-emerald-300">
          Midtrans Payment Console
        </span>
        <span className="h-2 w-2 rounded-full bg-emerald-500" title="Payment console online" />
      </div>
      <p className="text-[9px] leading-relaxed text-emerald-500">
        Console ini mencatat pembuatan credential Core API dan pengecekan status. Pelunasan asli
        diproses oleh endpoint{" "}
        <code className="border border-emerald-900 bg-emerald-950/80 px-1 text-emerald-300">
          /api/webhook/midtrans
        </code>{" "}
        atau{" "}
        <code className="border border-emerald-900 bg-emerald-950/80 px-1 text-emerald-300">
          /api/payments/midtrans/status
        </code>
        .
      </p>
      <div className="h-44 space-y-1.5 overflow-y-auto rounded-lg border border-emerald-950 bg-black/45 p-2">
        {paymentLogs.length === 0 ? (
          <span className="block py-8 text-center text-[9px] text-emerald-600/60">
            Belum ada credential Midtrans dibuat. Gunakan tombol Buat Transaksi pada invoice
            parsial.
          </span>
        ) : (
          paymentLogs.map((log, index) => (
            <div
              key={`${log}-${index}`}
              className="border-b border-emerald-950 pb-1 leading-normal"
            >
              {log}
            </div>
          ))
        )}
      </div>
      <div className="flex items-center justify-center gap-1 text-center text-[9px] text-emerald-600">
        <span>🔒 Webhook signature dan idempotency wajib divalidasi di backend</span>
      </div>
    </div>
  );

  if (!currentBill) {
    return (
      <div className="space-y-6" id="workspace-root-panel">
        {renderSearchPortal()}
      </div>
    );
  }

  return (
    <div className="space-y-6" id="workspace-root-panel">
      <div className="animate-fade-in space-y-6" id="active-group-workspace">
        <div className="flex flex-col justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:flex-row md:items-center">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                onSelectBill(null);
                setErrorText("");
                setSuccessJoinMsg("");
              }}
              className="rounded-xl border border-slate-200 p-2 transition-all hover:bg-slate-50"
              title="Kembali ke gerbang join"
            >
              <ArrowLeft className="h-4 w-4 text-slate-600" />
            </button>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-md border border-emerald-100 bg-emerald-50 px-2.5 py-1 font-mono text-xs font-bold uppercase text-emerald-800 shadow-sm">
                  Kode: {currentBill.code}
                </span>
                <StatusBadge status={currentBill.status} />
              </div>
              <h2 className="mt-1 text-xl font-black text-slate-900">{currentBill.title}</h2>
              <p className="mt-0.5 text-xs text-slate-500">{currentBill.description}</p>
            </div>
          </div>

          <div className="shrink-0 text-left md:text-right">
            <span className="block text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Total Tagihan Kasir
            </span>
            <span className="font-mono text-2xl font-black text-emerald-800">
              {formatCurrency(currentBill.totalAmount)}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            {renderBalanceMeter()}
            {renderMembersCard()}
            {renderInvoiceCard()}
          </div>
          <div className="space-y-6">
            {renderReceiptCard()}
            {renderPaymentConsole()}
          </div>
        </div>
      </div>
    </div>
  );
}
