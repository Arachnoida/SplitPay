import "dotenv/config";
import express from "express";
import path from "path";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";
import { createServer as createViteServer } from "vite";
import { Bill, SplitNotification, TransactionHistory } from "./src/types";

// ============================================================
//  KONFIGURASI — isi nilai ini di file .env
// ============================================================
const PORT = 3000;
const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || "";
const MIDTRANS_SERVER_KEY = process.env.MIDTRANS_SERVER_KEY || "";
const MIDTRANS_CLIENT_KEY = process.env.MIDTRANS_CLIENT_KEY || "";
const MIDTRANS_IS_PRODUCTION = process.env.MIDTRANS_IS_PRODUCTION === "true";
const APP_BASE_URL = process.env.APP_BASE_URL || process.env.APP_URL || `http://localhost:${PORT}`;
const ADMIN_REGISTRATION_SECRET = process.env.ADMIN_REGISTRATION_SECRET || "";
const ALLOW_MOCK_WEBHOOK = process.env.ALLOW_MOCK_WEBHOOK === "true";
const ALLOW_RESET_DATABASE = process.env.ALLOW_RESET_DATABASE !== "false";

const MIDTRANS_API_BASE_URL = MIDTRANS_IS_PRODUCTION
  ? "https://api.midtrans.com/v2"
  : "https://api.sandbox.midtrans.com/v2";

const MIDTRANS_CHARGE_URL = `${MIDTRANS_API_BASE_URL}/charge`;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("❌ SUPABASE_URL dan SUPABASE_SERVICE_KEY wajib diisi di file .env");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// ============================================================
//  HELPER
// ============================================================
function hashPassword(password: string): string {
  return crypto.createHash("sha256").update(password).digest("hex");
}

function generateBillCode(): string {
  const num = Math.floor(1000 + Math.random() * 9000);
  return `BAY-${num}`;
}

function getMidtransAuthHeader(): string {
  return "Basic " + Buffer.from(`${MIDTRANS_SERVER_KEY}:`).toString("base64");
}

function makeMidtransOrderId(billCode: string, contributorId: string): string {
  const cleanBillCode = billCode
    .replace(/[^A-Z0-9]/gi, "")
    .toUpperCase()
    .slice(0, 10);
  const shortContributorId = contributorId.replace(/-/g, "").slice(0, 8).toUpperCase();
  const shortTimestamp = Date.now().toString().slice(-8);

  return `SP-${cleanBillCode}-${shortContributorId}-${shortTimestamp}`;
}

function parseMidtransOrderId(orderId: string): { billId: string; contributorId: string } | null {
  const parts = orderId.split("__");

  if (parts.length < 4 || parts[0] !== "SPLITPAY") {
    return null;
  }

  return {
    billId: parts[1],
    contributorId: parts[2],
  };
}

function createMidtransSignature(orderId: string, statusCode: string, grossAmount: string): string {
  return crypto
    .createHash("sha512")
    .update(orderId + statusCode + grossAmount + MIDTRANS_SERVER_KEY)
    .digest("hex");
}

function isSuccessfulMidtransStatus(transactionStatus: string, fraudStatus?: string): boolean {
  return (
    transactionStatus === "settlement" ||
    (transactionStatus === "capture" && (!fraudStatus || fraudStatus === "accept"))
  );
}

function isFailedMidtransStatus(transactionStatus: string): boolean {
  return ["deny", "cancel", "expire", "failure"].includes(transactionStatus);
}

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

type MidtransInstruction = {
  orderId: string;
  transactionId?: string;
  transactionStatus?: string;
  paymentType?: string;
  channel: MidtransChannel;
  vaNumbers?: Array<{ bank: string; vaNumber: string }>;
  billerCode?: string;
  billKey?: string;
  paymentCode?: string;
  qrString?: string;
  qrImageUrl?: string;
  redirectUrl?: string;
  actions?: Array<{ name?: string; method?: string; url?: string }>;
  rawStatus?: string;
  expiresAt?: string;
};

function toMidtransChannel(value: unknown): MidtransChannel {
  const allowed: MidtransChannel[] = [
    "bca_va",
    "bni_va",
    "bri_va",
    "cimb_va",
    "permata_va",
    "mandiri_bill",
    "gopay_qris",
    "shopeepay",
    "qris",
  ];

  return allowed.includes(value as MidtransChannel) ? (value as MidtransChannel) : "bca_va";
}

function buildMidtransChargePayload(params: {
  channel: MidtransChannel;
  orderId: string;
  grossAmount: number;
  bill: Bill;
  contributor: Bill["contributors"][number];
}): any {
  const { channel, orderId, grossAmount, bill, contributor } = params;

  const basePayload: any = {
    transaction_details: {
      order_id: orderId,
      gross_amount: grossAmount,
    },
    customer_details: {
      first_name: contributor.name,
    },
    item_details: [
      {
        id: contributor.id.slice(0, 50),
        price: grossAmount,
        quantity: 1,
        name: `SplitPay - ${bill.title} - ${contributor.name}`.slice(0, 50),
      },
    ],
    custom_field1: bill.id,
    custom_field2: contributor.id,
    custom_field3: bill.code,
  };

  if (channel === "permata_va") {
    return {
      ...basePayload,
      payment_type: "permata",
    };
  }

  if (channel === "mandiri_bill") {
    return {
      ...basePayload,
      payment_type: "echannel",
      echannel: {
        bill_info1: "Payment For:",
        bill_info2: `SplitPay ${bill.code}`.slice(0, 30),
      },
    };
  }

  if (channel === "gopay_qris") {
    return {
      ...basePayload,
      payment_type: "gopay",
      gopay: {
        enable_callback: false,
      },
    };
  }

  if (channel === "shopeepay") {
    return {
      ...basePayload,
      payment_type: "shopeepay",
      shopeepay: {
        callback_url: APP_BASE_URL,
      },
    };
  }

  if (channel === "qris") {
    return {
      ...basePayload,
      payment_type: "qris",
    };
  }

  const bankMap: Record<Exclude<MidtransChannel, "permata_va" | "mandiri_bill" | "gopay_qris" | "shopeepay" | "qris">, string> = {
    bca_va: "bca",
    bni_va: "bni",
    bri_va: "bri",
    cimb_va: "cimb",
  };

  return {
    ...basePayload,
    payment_type: "bank_transfer",
    bank_transfer: {
      bank: bankMap[channel as keyof typeof bankMap],
    },
  };
}

function normalizeMidtransAction(action: any): { name?: string; method?: string; url?: string } {
  return {
    name: action?.name ? String(action.name) : undefined,
    method: action?.method ? String(action.method) : undefined,
    url: action?.url ? String(action.url) : undefined,
  };
}

function findActionUrl(
  actions: Array<{ name?: string; method?: string; url?: string }>,
  keywords: string[],
): string | undefined {
  return actions.find((action) => {
    const haystack = `${action.name || ""} ${action.method || ""} ${action.url || ""}`.toLowerCase();
    return keywords.some((keyword) => haystack.includes(keyword.toLowerCase()));
  })?.url;
}

function buildMidtransInstruction(
  channel: MidtransChannel,
  orderId: string,
  midtransData: any,
): MidtransInstruction {
  const actions = Array.isArray(midtransData?.actions)
    ? midtransData.actions.map(normalizeMidtransAction)
    : [];

  const vaNumbers: Array<{ bank: string; vaNumber: string }> = [];

  if (Array.isArray(midtransData?.va_numbers)) {
    for (const va of midtransData.va_numbers) {
      if (va?.va_number) {
        vaNumbers.push({
          bank: String(va.bank || channel.replace("_va", "")).toUpperCase(),
          vaNumber: String(va.va_number),
        });
      }
    }
  }

  if (midtransData?.permata_va_number) {
    vaNumbers.push({
      bank: "PERMATA",
      vaNumber: String(midtransData.permata_va_number),
    });
  }

  const qrImageUrl =
    findActionUrl(actions, ["generate-qr-code", "qr-code", "qrcode"]) ||
    (midtransData?.qr_code_url ? String(midtransData.qr_code_url) : undefined);

  const redirectUrl =
    findActionUrl(actions, ["deeplink-redirect", "redirect", "checkout"]) ||
    (midtransData?.redirect_url ? String(midtransData.redirect_url) : undefined);

  return {
    orderId: String(midtransData?.order_id || orderId),
    transactionId: midtransData?.transaction_id ? String(midtransData.transaction_id) : undefined,
    transactionStatus: midtransData?.transaction_status
      ? String(midtransData.transaction_status)
      : undefined,
    paymentType: midtransData?.payment_type ? String(midtransData.payment_type) : undefined,
    channel,
    vaNumbers: vaNumbers.length > 0 ? vaNumbers : undefined,
    billerCode:
      midtransData?.biller_code || midtransData?.company_code
        ? String(midtransData.biller_code || midtransData.company_code)
        : undefined,
    billKey:
      midtransData?.bill_key || midtransData?.bill_key_code
        ? String(midtransData.bill_key || midtransData.bill_key_code)
        : undefined,
    paymentCode: midtransData?.payment_code ? String(midtransData.payment_code) : undefined,
    qrString: midtransData?.qr_string ? String(midtransData.qr_string) : undefined,
    qrImageUrl,
    redirectUrl,
    actions: actions.length > 0 ? actions : undefined,
    rawStatus: midtransData?.status_code ? String(midtransData.status_code) : undefined,
    expiresAt: midtransData?.expiry_time ? String(midtransData.expiry_time) : undefined,
  };
}

async function fetchMidtransStatus(orderId: string): Promise<any> {
  const response = await fetch(`${MIDTRANS_API_BASE_URL}/${encodeURIComponent(orderId)}/status`, {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: getMidtransAuthHeader(),
    },
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message =
      payload?.status_message || payload?.message || "Gagal mengambil status transaksi Midtrans.";
    throw new Error(message);
  }

  return payload;
}

// Memetakan row Supabase ke struktur Bill (termasuk items & contributors)
async function fetchBillWithDetails(billId: string): Promise<Bill | null> {
  const { data: bill, error } = await supabase.from("bills").select("*").eq("id", billId).single();

  if (error || !bill) return null;

  const { data: items } = await supabase.from("bill_items").select("*").eq("bill_id", billId);

  const { data: contributors } = await supabase
    .from("contributors")
    .select("*")
    .eq("bill_id", billId);

  return {
    id: bill.id,
    code: bill.code,
    title: bill.title,
    description: bill.description,
    totalAmount: bill.total_amount,
    status: bill.status,
    creatorId: bill.creator_id,
    createdAt: bill.created_at,
    items: (items || []).map((i: any) => ({
      id: i.id,
      name: i.name,
      price: i.price,
      quantity: i.quantity,
    })),
    contributors: (contributors || []).map((c: any) => ({
      id: c.id,
      name: c.name,
      shareAmount: c.share_amount,
      paymentStatus: c.payment_status,
      paidAt: c.paid_at,
      transactionId: c.transaction_id,
    })),
  };
}

async function fetchAllBills(): Promise<Bill[]> {
  const { data: bills, error } = await supabase
    .from("bills")
    .select("*")
    .order("created_at", { ascending: false });

  if (error || !bills) return [];

  const result: Bill[] = [];
  for (const bill of bills) {
    const full = await fetchBillWithDetails(bill.id);
    if (full) result.push(full);
  }
  return result;
}

async function processMidtransState(notification: any) {
  const orderId = String(notification.order_id || "");
  const statusCode = String(notification.status_code || "");
  const grossAmountRaw = String(notification.gross_amount || "");
  const receivedSignature = String(notification.signature_key || "");
  const transactionStatus = String(notification.transaction_status || "");
  const fraudStatus = notification.fraud_status ? String(notification.fraud_status) : undefined;
  const paymentType = notification.payment_type ? String(notification.payment_type) : "Midtrans";
  const transactionId = notification.transaction_id ? String(notification.transaction_id) : orderId;

  if (!orderId || !statusCode || !grossAmountRaw || !transactionStatus) {
    throw new Error("Payload Midtrans tidak lengkap.");
  }

  if (receivedSignature) {
    const expectedSignature = createMidtransSignature(orderId, statusCode, grossAmountRaw);
    if (receivedSignature !== expectedSignature) {
      const signatureError = new Error("Signature Midtrans tidak valid.");
      (signatureError as any).statusCode = 403;
      throw signatureError;
    }
  }

  const parsedFromOrderId = parseMidtransOrderId(orderId);
  const billId = notification.custom_field1 || parsedFromOrderId?.billId;
  const contributorId = notification.custom_field2 || parsedFromOrderId?.contributorId;

  if (!billId || !contributorId) {
    const err = new Error("billId atau contributorId tidak ditemukan pada payload Midtrans.");
    (err as any).statusCode = 400;
    throw err;
  }

  const bill = await fetchBillWithDetails(String(billId));
  if (!bill) {
    const err = new Error("Tagihan tidak ditemukan.");
    (err as any).statusCode = 404;
    throw err;
  }

  const contributor = bill.contributors.find((c) => c.id === String(contributorId));
  if (!contributor) {
    const err = new Error("Contributor tidak ditemukan.");
    (err as any).statusCode = 404;
    throw err;
  }

  const receivedAmount = Number(grossAmountRaw);
  const expectedAmount = Number(contributor.shareAmount);

  if (receivedAmount !== expectedAmount) {
    await supabase.from("transaction_histories").insert({
      id: "tx-mid-amount-fail-" + Date.now() + Math.floor(Math.random() * 1000),
      bill_id: bill.id,
      bill_title: bill.title,
      contributor_name: contributor.name,
      amount: receivedAmount,
      status: "FAILED",
      payment_method: `Midtrans ${paymentType}`,
    });

    const err = new Error(
      `Nominal Midtrans tidak sesuai. Diterima Rp ${receivedAmount}, seharusnya Rp ${expectedAmount}.`,
    );
    (err as any).statusCode = 400;
    throw err;
  }

  if (contributor.paymentStatus === "PAID") {
    return {
      success: true,
      status: "ALREADY_PAID",
      message: "Transaksi diterima, tetapi contributor sudah lunas sebelumnya.",
      updatedStatus: "PAID",
      billStatus: bill.status,
      transactionId,
    };
  }

  if (isFailedMidtransStatus(transactionStatus)) {
    await supabase
      .from("contributors")
      .update({
        payment_status: "FAILED",
        transaction_id: orderId,
      })
      .eq("id", contributor.id);

    await supabase.from("transaction_histories").insert({
      id: "tx-mid-fail-" + Date.now() + Math.floor(Math.random() * 1000),
      bill_id: bill.id,
      bill_title: bill.title,
      contributor_name: contributor.name,
      amount: receivedAmount,
      status: "FAILED",
      payment_method: `Midtrans ${paymentType}`,
    });

    await supabase.from("notifications").insert({
      id: "notif-mid-fail-" + Date.now(),
      bill_id: bill.id,
      bill_title: bill.title,
      message: `Pembayaran Midtrans dari ${contributor.name} gagal atau kedaluwarsa. Status: ${transactionStatus}.`,
      type: "INFO",
    });

    return {
      success: true,
      message: `Transaksi diproses sebagai gagal: ${transactionStatus}.`,
      updatedStatus: "FAILED",
      billStatus: bill.status,
      transactionId: orderId,
    };
  }

  if (!isSuccessfulMidtransStatus(transactionStatus, fraudStatus)) {
    return {
      success: true,
      message: `Status masih ${transactionStatus}. Invoice belum ditandai lunas.`,
      updatedStatus: "PENDING",
      billStatus: bill.status,
      transactionId: orderId,
    };
  }

  const paidAt = new Date().toISOString();

  await supabase
    .from("contributors")
    .update({
      payment_status: "PAID",
      paid_at: paidAt,
      transaction_id: transactionId,
    })
    .eq("id", contributor.id);

  await supabase.from("transaction_histories").insert({
    id: "tx-mid-ok-" + Date.now() + Math.floor(Math.random() * 1000),
    bill_id: bill.id,
    bill_title: bill.title,
    contributor_name: contributor.name,
    amount: receivedAmount,
    status: "SUCCESS",
    payment_method: `Midtrans ${paymentType}`,
  });

  await supabase.from("notifications").insert({
    id: "notif-mid-pay-" + Date.now(),
    bill_id: bill.id,
    bill_title: bill.title,
    message: `✅ Pembayaran Rp ${receivedAmount.toLocaleString("id-ID")} dari ${contributor.name} berhasil melalui Midtrans (${paymentType}).`,
    type: "PAYMENT_RECEIVED",
  });

  const updatedBill = await fetchBillWithDetails(String(billId));
  const allPaid = updatedBill?.contributors.every((c) => c.paymentStatus === "PAID");

  if (allPaid) {
    await supabase.from("bills").update({ status: "COMPLETED" }).eq("id", bill.id);

    await supabase.from("notifications").insert({
      id: "notif-mid-comp-" + Date.now(),
      bill_id: bill.id,
      bill_title: bill.title,
      message: `🎉 PATUNGAN LUNAS VIA MIDTRANS! Seluruh Rp ${Number(bill.totalAmount).toLocaleString("id-ID")} untuk '${bill.title}' telah berhasil dipenuhi.`,
      type: "BILL_COMPLETED",
    });
  }

  return {
    success: true,
    message: "Status Midtrans berhasil diproses.",
    updatedStatus: "PAID",
    billStatus: allPaid ? "COMPLETED" : "LOCKED",
    transactionId,
  };
}

// ============================================================
//  SERVER
// ============================================================
async function start() {
  const app = express();
  app.use(express.json());

  // ----------------------------------------------------------
  //  AUTH: REGISTER
  // ----------------------------------------------------------
  app.post("/api/auth/register", async (req, res) => {
    const { username, password, name, role, adminSecret } = req.body;

    if (!username || !password || !name) {
      return res.status(400).json({ error: "Kolom nama, username, dan password wajib diisi." });
    }

    const cleanUsername = username.trim().toLowerCase();
    const cleanName = name.trim();
    const wantsAdmin = role === "admin";
    const cleanRole: "admin" | "user" =
      wantsAdmin && ADMIN_REGISTRATION_SECRET && adminSecret === ADMIN_REGISTRATION_SECRET
        ? "admin"
        : "user";

    if (cleanUsername.length < 3) {
      return res.status(400).json({ error: "Username minimal terdiri dari 3 karakter." });
    }
    if (password.length < 4) {
      return res.status(400).json({ error: "Password minimal terdiri dari 4 karakter." });
    }

    // Cek duplikat
    const { data: existing } = await supabase
      .from("users")
      .select("id")
      .eq("username", cleanUsername)
      .single();

    if (existing) {
      return res
        .status(400)
        .json({ error: "Username sudah terdaftar. Silakan pilih username lain." });
    }

    const newId = "usr-" + Date.now() + Math.floor(Math.random() * 100);
    const { error } = await supabase.from("users").insert({
      id: newId,
      username: cleanUsername,
      name: cleanName,
      password_hash: hashPassword(password),
      role: cleanRole,
    });

    if (error) {
      return res.status(500).json({ error: "Gagal menyimpan akun. Coba lagi." });
    }

    // Notifikasi
    const roleLabel = cleanRole === "admin" ? "👑 Admin" : "👤 Pengguna";
    await supabase.from("notifications").insert({
      id: "notif-usr-" + Date.now(),
      bill_id: null,
      bill_title: "Pendaftaran Pengguna",
      message: `${roleLabel} baru '${cleanName}' (@${cleanUsername}) telah bergabung ke SplitBay!`,
      type: "INFO",
    });

    return res.json({ id: newId, username: cleanUsername, name: cleanName, role: cleanRole });
  });

  // ----------------------------------------------------------
  //  AUTH: LOGIN
  // ----------------------------------------------------------
  app.post("/api/auth/login", async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: "Username dan password wajib diisi." });
    }

    const cleanUsername = username.trim().toLowerCase();
    const hashedPassword = hashPassword(password);

    const { data: user } = await supabase
      .from("users")
      .select("*")
      .eq("username", cleanUsername)
      .eq("password_hash", hashedPassword)
      .single();

    if (!user) {
      return res.status(401).json({ error: "Username atau password salah." });
    }

    return res.json({
      id: user.id,
      username: user.username,
      name: user.name,
      role: user.role ?? "user",
      createdAt: user.created_at,
    });
  });

  // ----------------------------------------------------------
  //  BILLS: GET ALL
  // ----------------------------------------------------------
  app.get("/api/bills", async (_req, res) => {
    const bills = await fetchAllBills();
    res.json(bills);
  });

  // ----------------------------------------------------------
  //  BILLS: GET BY CODE OR ID
  // ----------------------------------------------------------
  app.get("/api/bills/:searchVal", async (req, res) => {
    const { searchVal } = req.params;

    // Coba cari by id dulu
    let bill = await fetchBillWithDetails(searchVal);

    // Kalau tidak ketemu, cari by code
    if (!bill) {
      const { data: byCode } = await supabase
        .from("bills")
        .select("id")
        .ilike("code", searchVal)
        .single();

      if (byCode) {
        bill = await fetchBillWithDetails(byCode.id);
      }
    }

    if (!bill) {
      return res.status(404).json({ error: "Sesi patungan tidak ditemukan dengan kode tersebut." });
    }

    res.json(bill);
  });

  // ----------------------------------------------------------
  //  BILLS: CREATE
  // ----------------------------------------------------------
  app.post("/api/bills", async (req, res) => {
    const { title, description, totalAmount, items, creatorId } = req.body;

    if (!title || !totalAmount) {
      return res.status(400).json({ error: "Nama patungan dan total harga wajib diisi." });
    }

    const billId = "bill-" + Date.now();
    const billCode = generateBillCode();

    const { error: billError } = await supabase.from("bills").insert({
      id: billId,
      code: billCode,
      title,
      description: description || "No description provided",
      total_amount: Number(totalAmount),
      status: "SHARING",
      creator_id: creatorId || null,
    });

    if (billError) {
      return res.status(500).json({ error: "Gagal membuat tagihan." });
    }

    // Insert items
    if (items && items.length > 0) {
      const itemRows = items.map((item: any) => ({
        id: item.id || "itm-" + Date.now() + Math.random(),
        bill_id: billId,
        name: item.name,
        price: item.price,
        quantity: item.quantity,
      }));
      await supabase.from("bill_items").insert(itemRows);
    }

    // Notifikasi
    await supabase.from("notifications").insert({
      id: "notif-" + Date.now(),
      bill_id: billId,
      bill_title: title,
      message: `Tagihan baru '${title}' dibuat oleh Kasir dengan total Rp ${Number(totalAmount).toLocaleString("id-ID")}. Kode: ${billCode}`,
      type: "INFO",
    });

    const newBill = await fetchBillWithDetails(billId);
    res.json(newBill);
  });

  // ----------------------------------------------------------
  //  BILLS: JOIN (tambah contributor)
  // ----------------------------------------------------------
  app.post("/api/bills/:id/join", async (req, res) => {
    const { id } = req.params;
    const { name } = req.body;

    if (!name || name.trim() === "") {
      return res.status(400).json({ error: "Nama pembayar wajib diisi untuk join patungan." });
    }

    const bill = await fetchBillWithDetails(id);
    if (!bill) return res.status(404).json({ error: "Tagihan tidak ditemukan." });

    if (bill.status === "LOCKED" || bill.status === "COMPLETED") {
      return res
        .status(400)
        .json({ error: "Tagihan sudah dikonfirmasi/lunas, tidak bisa lagi menambah pembayar." });
    }

    const cleanName = name.trim();
    const duplicate = bill.contributors.some(
      (c) => c.name.toLowerCase() === cleanName.toLowerCase(),
    );
    if (duplicate) {
      return res
        .status(400)
        .json({ error: "Nama ini sudah terpakai di patungan ini. Harap pakai nama unik." });
    }

    const newContributorId = "cnt-" + Date.now() + Math.floor(Math.random() * 100);
    await supabase.from("contributors").insert({
      id: newContributorId,
      bill_id: id,
      name: cleanName,
      share_amount: 0,
      payment_status: "PENDING",
      paid_at: null,
    });

    await supabase.from("notifications").insert({
      id: "notif-" + Date.now(),
      bill_id: id,
      bill_title: bill.title,
      message: `${cleanName} bergabung ke patungan '${bill.title}'.`,
      type: "JOIN",
    });

    const updated = await fetchBillWithDetails(id);
    res.json(updated);
  });

  // ----------------------------------------------------------
  //  CONTRIBUTORS: REMOVE
  // ----------------------------------------------------------
  app.post("/api/bills/:id/contributors/:contributorId/remove", async (req, res) => {
    const { id, contributorId } = req.params;

    const bill = await fetchBillWithDetails(id);
    if (!bill) return res.status(404).json({ error: "Tagihan tidak ditemukan." });

    if (bill.status === "LOCKED" || bill.status === "COMPLETED") {
      return res
        .status(400)
        .json({ error: "Tagihan sudah ditutup/selesai, tidak bisa menghapus anggota." });
    }

    const contributor = bill.contributors.find((c) => c.id === contributorId);
    if (!contributor) return res.status(404).json({ error: "Anggota tidak ditemukan." });

    await supabase.from("contributors").delete().eq("id", contributorId);

    await supabase.from("notifications").insert({
      id: "notif-" + Date.now(),
      bill_id: id,
      bill_title: bill.title,
      message: `${contributor.name} keluar dari patungan '${bill.title}'.`,
      type: "INFO",
    });

    const updated = await fetchBillWithDetails(id);
    res.json(updated);
  });

  // ----------------------------------------------------------
  //  CONTRIBUTORS: UPDATE SHARE AMOUNT
  // ----------------------------------------------------------
  app.put("/api/bills/:id/contributors/:contributorId", async (req, res) => {
    const { id, contributorId } = req.params;
    const { shareAmount } = req.body;

    const bill = await fetchBillWithDetails(id);
    if (!bill) return res.status(404).json({ error: "Tagihan tidak ditemukan." });

    if (bill.status === "LOCKED" || bill.status === "COMPLETED") {
      return res.status(400).json({ error: "Rincian patungan sudah dikunci. Tidak bisa diubah." });
    }

    const targetAmount = Number(shareAmount);
    if (isNaN(targetAmount) || targetAmount < 0) {
      return res.status(400).json({ error: "Jumlah pembayaran tidak valid." });
    }

    await supabase
      .from("contributors")
      .update({ share_amount: targetAmount })
      .eq("id", contributorId);

    const updated = await fetchBillWithDetails(id);
    res.json(updated);
  });

  // ----------------------------------------------------------
  //  BILLS: AUTO BALANCE
  // ----------------------------------------------------------
  app.post("/api/bills/:id/auto-balance", async (req, res) => {
    const { id } = req.params;
    const { type } = req.body;

    const bill = await fetchBillWithDetails(id);
    if (!bill) return res.status(404).json({ error: "Tagihan tidak ditemukan." });

    if (bill.status === "LOCKED" || bill.status === "COMPLETED") {
      return res.status(400).json({ error: "Tagihan sudah dikunci atau lunas." });
    }

    const count = bill.contributors.length;
    if (count === 0) {
      return res
        .status(400)
        .json({ error: "Belum ada anggota yang bergabung untuk membagi tagihan." });
    }

    if (type === "equal") {
      const equalShare = Math.floor(bill.totalAmount / count);
      const remainder = bill.totalAmount % count;

      for (let i = 0; i < bill.contributors.length; i++) {
        const amount = equalShare + (i === 0 ? remainder : 0);
        await supabase
          .from("contributors")
          .update({ share_amount: amount })
          .eq("id", bill.contributors[i].id);
      }
    } else {
      const currentSum = bill.contributors.reduce((s, c) => s + c.shareAmount, 0);
      const leftover = bill.totalAmount - currentSum;

      if (leftover <= 0) {
        return res.status(400).json({ error: "Tagihan sudah pas atau melebihi batas." });
      }

      const zeroMembers = bill.contributors.filter((c) => c.shareAmount === 0);
      const targetList = zeroMembers.length > 0 ? zeroMembers : bill.contributors;
      const targetCount = targetList.length;
      const equalShare = Math.floor(leftover / targetCount);
      const remainder = leftover % targetCount;

      for (let i = 0; i < targetList.length; i++) {
        const add = equalShare + (i === 0 ? remainder : 0);
        await supabase
          .from("contributors")
          .update({ share_amount: targetList[i].shareAmount + add })
          .eq("id", targetList[i].id);
      }
    }

    const updated = await fetchBillWithDetails(id);
    res.json(updated);
  });

  // ----------------------------------------------------------
  //  BILLS: LOCK
  // ----------------------------------------------------------
  app.post("/api/bills/:id/lock", async (req, res) => {
    const { id } = req.params;

    const bill = await fetchBillWithDetails(id);
    if (!bill) return res.status(404).json({ error: "Tagihan tidak ditemukan." });

    if (bill.status !== "SHARING") {
      return res
        .status(400)
        .json({ error: `Tagihan sudah berstatus ${bill.status}, tidak bisa dikunci.` });
    }

    const assignedSum = bill.contributors.reduce((s, c) => s + c.shareAmount, 0);

    if (assignedSum < bill.totalAmount) {
      return res.status(400).json({
        error: `Pembayaran masih kurang Rp ${(bill.totalAmount - assignedSum).toLocaleString("id-ID")}. Silakan sesuaikan atau gunakan fitur Auto-Balance.`,
      });
    }

    if (assignedSum > bill.totalAmount) {
      return res.status(400).json({
        error: `Pembayaran melebihi total harga Rp ${(assignedSum - bill.totalAmount).toLocaleString("id-ID")}. Harap kurangi kontribusi.`,
      });
    }

    await supabase.from("bills").update({ status: "LOCKED" }).eq("id", id);

    await supabase.from("notifications").insert({
      id: "notif-" + Date.now(),
      bill_id: id,
      bill_title: bill.title,
      message: `Konstruksi patungan '${bill.title}' berhasil dikunci! Rincian tagihan dipecah menjadi ${bill.contributors.length} invoice terpisah siap bayar.`,
      type: "INFO",
    });

    const updated = await fetchBillWithDetails(id);
    res.json(updated);
  });

  // ----------------------------------------------------------
  //  MIDTRANS: CREATE CORE API CHARGE TRANSACTION
  // ----------------------------------------------------------
  app.post("/api/payments/midtrans/create", async (req, res) => {
    try {
      const { billId, contributorId, paymentChannel } = req.body;
      const channel = toMidtransChannel(paymentChannel);

      if (!MIDTRANS_SERVER_KEY || MIDTRANS_SERVER_KEY.includes("ISI_DARI")) {
        return res.status(500).json({
          error: "MIDTRANS_SERVER_KEY belum dikonfigurasi di file .env.",
        });
      }

      if (!billId || !contributorId) {
        return res.status(400).json({ error: "billId dan contributorId wajib dikirim." });
      }

      const bill = await fetchBillWithDetails(String(billId));
      if (!bill) {
        return res.status(404).json({ error: "Tagihan tidak ditemukan." });
      }

      if (bill.status !== "LOCKED") {
        return res.status(400).json({
          error: "Tagihan harus dikunci terlebih dahulu sebelum dibayar melalui Midtrans.",
        });
      }

      const contributor = bill.contributors.find((c) => c.id === String(contributorId));
      if (!contributor) {
        return res.status(404).json({ error: "Anggota patungan tidak ditemukan." });
      }

      if (contributor.paymentStatus === "PAID") {
        return res.status(400).json({ error: "Invoice contributor ini sudah lunas." });
      }

      const grossAmount = Math.round(Number(contributor.shareAmount));
      if (!grossAmount || grossAmount <= 0) {
        return res.status(400).json({ error: "Nominal pembayaran tidak valid." });
      }

      const orderId = makeMidtransOrderId(bill.code, contributor.id);
      const payload = buildMidtransChargePayload({
        channel,
        orderId,
        grossAmount,
        bill,
        contributor,
      });

      const midtransResponse = await fetch(MIDTRANS_CHARGE_URL, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          Authorization: getMidtransAuthHeader(),
        },
        body: JSON.stringify(payload),
      });

      const midtransData: any = await midtransResponse.json().catch(() => ({}));

      console.log("MIDTRANS CORE API DEBUG", {
        chargeUrl: MIDTRANS_CHARGE_URL,
        isProduction: MIDTRANS_IS_PRODUCTION,
        hasServerKey: Boolean(MIDTRANS_SERVER_KEY),
        serverKeyPrefix: MIDTRANS_SERVER_KEY?.slice(0, 13),
        channel,
        payload,
        midtransStatus: midtransResponse.status,
        midtransData,
      });

      if (!midtransResponse.ok) {
        return res.status(midtransResponse.status).json({
          error: "Gagal membuat transaksi Midtrans Core API.",
          detail: midtransData,
        });
      }

      const instruction = buildMidtransInstruction(channel, orderId, midtransData);

      if (!instruction.orderId) {
        return res.status(502).json({
          error: "Midtrans tidak mengembalikan order ID pembayaran.",
          detail: midtransData,
        });
      }

      await supabase
        .from("contributors")
        .update({
          payment_status: "PENDING",
          transaction_id: instruction.orderId,
        })
        .eq("id", contributorId);

      await supabase.from("transaction_histories").insert({
        id: "tx-mid-pending-" + Date.now() + Math.floor(Math.random() * 1000),
        bill_id: bill.id,
        bill_title: bill.title,
        contributor_name: contributor.name,
        amount: grossAmount,
        status: "PENDING",
        payment_method: `Midtrans Core API (${channel})`,
      });

      await supabase.from("notifications").insert({
        id: "notif-mid-create-" + Date.now(),
        bill_id: bill.id,
        bill_title: bill.title,
        message: `Transaksi Midtrans dibuat untuk ${contributor.name}. Order ID: ${instruction.orderId}. Status masih pending.`,
        type: "INFO",
      });

      return res.json({
        success: true,
        message: "Credential pembayaran Midtrans berhasil dibuat.",
        instruction,
        midtrans: {
          statusCode: midtransData.status_code,
          statusMessage: midtransData.status_message,
          transactionId: midtransData.transaction_id,
          transactionStatus: midtransData.transaction_status,
        },
      });
    } catch (error: any) {
      console.error("Midtrans create transaction error:", error);
      return res.status(500).json({
        error: error.message || "Terjadi kesalahan saat membuat transaksi Midtrans.",
      });
    }
  });

  // ----------------------------------------------------------
  //  MIDTRANS: CHECK TRANSACTION STATUS
  // ----------------------------------------------------------
  app.post("/api/payments/midtrans/status", async (req, res) => {
    try {
      const { billId, contributorId, orderId } = req.body;

      if (!MIDTRANS_SERVER_KEY || MIDTRANS_SERVER_KEY.includes("ISI_DARI")) {
        return res
          .status(500)
          .json({ error: "MIDTRANS_SERVER_KEY belum dikonfigurasi di server." });
      }

      if (!billId || !contributorId) {
        return res.status(400).json({ error: "billId dan contributorId wajib dikirim." });
      }

      const bill = await fetchBillWithDetails(String(billId));
      if (!bill) return res.status(404).json({ error: "Tagihan tidak ditemukan." });

      const contributor = bill.contributors.find((c) => c.id === contributorId);
      if (!contributor) return res.status(404).json({ error: "Contributor tidak ditemukan." });

      const targetOrderId = String(orderId || contributor.transactionId || "");
      if (!targetOrderId) {
        return res
          .status(400)
          .json({ error: "Belum ada Order ID Midtrans untuk contributor ini." });
      }

      const statusPayload = await fetchMidtransStatus(targetOrderId);

      // Reuse business logic through local processor instead of changing state directly in frontend.
      const transactionStatus = String(statusPayload.transaction_status || "");
      const statusCode = String(statusPayload.status_code || "");
      const grossAmountRaw = String(statusPayload.gross_amount || contributor.shareAmount);
      const receivedSignature = String(statusPayload.signature_key || "");

      if (receivedSignature) {
        const expectedSignature = createMidtransSignature(
          targetOrderId,
          statusCode,
          grossAmountRaw,
        );
        if (receivedSignature !== expectedSignature) {
          return res.status(403).json({ error: "Signature status Midtrans tidak valid." });
        }
      }

      // Forward to shared handler by calling the same implementation function inline.
      const fakeReqBody = {
        ...statusPayload,
        order_id: targetOrderId,
        custom_field1: bill.id,
        custom_field2: contributor.id,
        custom_field3: bill.code,
      };

      const result = await processMidtransState(fakeReqBody);
      return res.json({
        ...result,
        transactionStatus,
        orderId: targetOrderId,
      });
    } catch (error: any) {
      console.error("Midtrans status check error:", error);
      return res
        .status(500)
        .json({ error: error.message || "Terjadi kesalahan saat mengecek status Midtrans." });
    }
  });

  // ----------------------------------------------------------
  //  WEBHOOK: PAYMENT
  // ----------------------------------------------------------
  app.post("/api/webhook/payment", async (req, res) => {
    if (!ALLOW_MOCK_WEBHOOK) {
      return res.status(403).json({
        error:
          "Mock webhook dinonaktifkan. Gunakan /api/payments/midtrans/create dan /api/webhook/midtrans.",
      });
    }

    const { billId, contributorId, amount, paymentMethod, secureToken } = req.body;

    if (!billId || !contributorId || !amount) {
      return res.status(400).json({ error: "Missing webhook payload details." });
    }

    if (secureToken && secureToken !== "MOCK_SPLITBAY_SECURE_TOKEN") {
      return res.status(401).json({ error: "Verifikasi webhook gagal: token tidak valid." });
    }

    const bill = await fetchBillWithDetails(billId);
    if (!bill) return res.status(404).json({ error: "Tagihan tidak terdaftar di SplitBay." });

    const contributor = bill.contributors.find((c) => c.id === contributorId);
    if (!contributor) return res.status(404).json({ error: "Anggota patungan tidak ditemukan." });

    const receivedAmount = Number(amount);

    if (receivedAmount !== contributor.shareAmount) {
      await supabase.from("transaction_histories").insert({
        id: "tx-hist-" + Date.now() + Math.floor(Math.random() * 1000),
        bill_id: bill.id,
        bill_title: bill.title,
        contributor_name: contributor.name,
        amount: receivedAmount,
        status: "FAILED",
        payment_method: paymentMethod || "Unknown Gateway",
      });

      return res.status(400).json({
        error: `Pembayaran gagal: Jumlah Rp ${receivedAmount} tidak sesuai tagihan Rp ${contributor.shareAmount}.`,
      });
    }

    if (contributor.paymentStatus === "PAID") {
      return res
        .status(200)
        .json({ status: "ALREADY_PAID", message: "Transaksi ini sudah lunas." });
    }

    const txId = "TX-HOOK-" + Math.floor(100000 + Math.random() * 900000);
    const paidAt = new Date().toISOString();

    await supabase
      .from("contributors")
      .update({
        payment_status: "PAID",
        paid_at: paidAt,
        transaction_id: txId,
      })
      .eq("id", contributorId);

    await supabase.from("transaction_histories").insert({
      id: "tx-hist-" + Date.now() + Math.floor(Math.random() * 10),
      bill_id: bill.id,
      bill_title: bill.title,
      contributor_name: contributor.name,
      amount: receivedAmount,
      status: "SUCCESS",
      payment_method: paymentMethod || "Virtual Account/QRIS",
    });

    await supabase.from("notifications").insert({
      id: "notif-pay-" + Date.now(),
      bill_id: bill.id,
      bill_title: bill.title,
      message: `🔔 Pembayaran Rp ${receivedAmount.toLocaleString("id-ID")} terverifikasi dari ${contributor.name} via Webhook (${paymentMethod || "QRIS"}).`,
      type: "PAYMENT_RECEIVED",
    });

    // Cek apakah semua sudah bayar
    const updatedBill = await fetchBillWithDetails(billId);
    const allPaid = updatedBill?.contributors.every((c) => c.paymentStatus === "PAID");

    if (allPaid) {
      await supabase.from("bills").update({ status: "COMPLETED" }).eq("id", billId);
      await supabase.from("notifications").insert({
        id: "notif-comp-" + Date.now(),
        bill_id: bill.id,
        bill_title: bill.title,
        message: `🎉 PATUNGAN LUNAS! Seluruh Rp ${bill.totalAmount.toLocaleString("id-ID")} untuk '${bill.title}' telah berhasil dipenuhi!`,
        type: "BILL_COMPLETED",
      });
    }

    return res.json({
      success: true,
      message: "Webhook verifikasi berhasil diproses.",
      updatedStatus: "PAID",
      billStatus: allPaid ? "COMPLETED" : "LOCKED",
      transactionId: txId,
    });
  });

  // ----------------------------------------------------------
  //  MIDTRANS: PAYMENT WEBHOOK
  // ----------------------------------------------------------
  app.post("/api/webhook/midtrans", async (req, res) => {
    try {
      if (!MIDTRANS_SERVER_KEY || MIDTRANS_SERVER_KEY.includes("ISI_DARI")) {
        return res
          .status(500)
          .json({ error: "MIDTRANS_SERVER_KEY belum dikonfigurasi di server." });
      }

      const result = await processMidtransState(req.body);
      return res.json(result);
    } catch (error: any) {
      console.error("Midtrans webhook error:", error);
      return res.status(error.statusCode || 500).json({
        error: error.message || "Terjadi kesalahan saat memproses webhook Midtrans.",
      });
    }
  });

  // ----------------------------------------------------------
  //  NOTIFICATIONS: GET ALL
  // ----------------------------------------------------------
  app.get("/api/notifications", async (_req, res) => {
    const { data } = await supabase
      .from("notifications")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);

    const mapped: SplitNotification[] = (data || []).map((n: any) => ({
      id: n.id,
      billId: n.bill_id,
      billTitle: n.bill_title,
      message: n.message,
      type: n.type,
      timestamp: n.created_at,
    }));

    res.json(mapped);
  });

  // ----------------------------------------------------------
  //  HISTORY: GET ALL
  // ----------------------------------------------------------
  app.get("/api/history", async (_req, res) => {
    const { data } = await supabase
      .from("transaction_histories")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);

    const mapped: TransactionHistory[] = (data || []).map((h: any) => ({
      id: h.id,
      billId: h.bill_id,
      billTitle: h.bill_title,
      contributorName: h.contributor_name,
      amount: h.amount,
      status: h.status,
      timestamp: h.created_at,
      paymentMethod: h.payment_method,
    }));

    res.json(mapped);
  });

  // ----------------------------------------------------------
  //  MENU: GET ALL AVAILABLE
  // ----------------------------------------------------------
  app.get("/api/menu", async (_req, res) => {
    const { data, error } = await supabase
      .from("menu_items")
      .select("*")
      .eq("is_available", true)
      .order("category")
      .order("name");

    if (error) {
      return res.status(500).json({ error: "Gagal mengambil data menu." });
    }

    res.json(data || []);
  });

  // ----------------------------------------------------------
  //  RESET (opsional — hapus semua data)
  // ----------------------------------------------------------
  app.post("/api/reset", async (_req, res) => {
    if (!ALLOW_RESET_DATABASE) {
      return res
        .status(403)
        .json({ error: "Reset database dinonaktifkan oleh konfigurasi server." });
    }

    await supabase.from("contributors").delete().neq("id", "");
    await supabase.from("bill_items").delete().neq("id", "");
    await supabase.from("bills").delete().neq("id", "");
    await supabase.from("notifications").delete().neq("id", "");
    await supabase.from("transaction_histories").delete().neq("id", "");
    res.json({ success: true, message: "Sistem berhasil di-reset ke kondisi awal." });
  });

  // ----------------------------------------------------------
  //  VITE / STATIC
  // ----------------------------------------------------------
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`✅ SplitBay Server berjalan di http://localhost:${PORT}`);
    console.log(`🗄️  Terhubung ke Supabase: ${SUPABASE_URL}`);
  });
}

start().catch((err) => {
  console.error("❌ Gagal menjalankan SplitBay:", err);
});
