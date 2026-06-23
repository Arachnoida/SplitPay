import "dotenv/config";
import express from "express";
import path from "path";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";
import { createServer as createViteServer } from "vite";
import { Bill, Contributor, SplitNotification, TransactionHistory } from "./src/types";

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

const MIDTRANS_SNAP_URL = MIDTRANS_IS_PRODUCTION
  ? "https://app.midtrans.com/snap/v1/transactions"
  : "https://app.sandbox.midtrans.com/snap/v1/transactions";

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

function makeMidtransOrderId(): string {
  return `SP-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
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
    const { username, password, name, role } = req.body;

    if (!username || !password || !name) {
      return res.status(400).json({ error: "Kolom nama, username, dan password wajib diisi." });
    }

    const cleanUsername = username.trim().toLowerCase();
    const cleanName = name.trim();
    const cleanRole: "admin" | "user" = role === "admin" ? "admin" : "user";

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
  //  MIDTRANS: CREATE SNAP TRANSACTION
  // ----------------------------------------------------------
  app.post("/api/payments/midtrans/create", async (req, res) => {
    try {
      const { billId, contributorId } = req.body;

      if (!MIDTRANS_SERVER_KEY || MIDTRANS_SERVER_KEY.includes("ISI_DARI")) {
        return res.status(500).json({
          error: "MIDTRANS_SERVER_KEY belum dikonfigurasi di file .env.",
        });
      }

      if (!billId || !contributorId) {
        return res.status(400).json({ error: "billId dan contributorId wajib dikirim." });
      }

      const bill = await fetchBillWithDetails(billId);
      if (!bill) {
        return res.status(404).json({ error: "Tagihan tidak ditemukan." });
      }

      if (bill.status !== "LOCKED") {
        return res.status(400).json({
          error: "Tagihan harus dikunci terlebih dahulu sebelum dibayar melalui Midtrans.",
        });
      }

      const contributor = bill.contributors.find((c) => c.id === contributorId);
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

      const orderId = makeMidtransOrderId();

      const payload = {
        transaction_details: {
          order_id: orderId,
          gross_amount: grossAmount,
        },
        customer_details: {
          first_name: contributor.name,
        },
        item_details: [
          {
            id: contributor.id,
            price: grossAmount,
            quantity: 1,
            name: `SplitPay - ${bill.title} - ${contributor.name}`.slice(0, 50),
          },
        ],
        callbacks: {
          finish: `${APP_BASE_URL}?bill=${encodeURIComponent(bill.code)}`,
        },
        custom_field1: bill.id,
        custom_field2: contributor.id,
        custom_field3: bill.code,
      };

      const midtransResponse = await fetch(MIDTRANS_SNAP_URL, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          Authorization: getMidtransAuthHeader(),
        },
        body: JSON.stringify(payload),
      });

      const midtransData: any = await midtransResponse.json().catch(() => ({}));

      if (!midtransResponse.ok) {
        return res.status(midtransResponse.status).json({
          error: "Gagal membuat transaksi Midtrans.",
          detail: midtransData,
        });
      }

      return res.json({
        success: true,
        orderId,
        token: midtransData.token,
        redirectUrl: midtransData.redirect_url,
      });
    } catch (error: any) {
      console.error("Midtrans create transaction error:", error);
      return res.status(500).json({
        error: "Terjadi kesalahan saat membuat transaksi Midtrans.",
      });
    }
  });

  // ----------------------------------------------------------
  //  WEBHOOK: PAYMENT
  // ----------------------------------------------------------
  app.post("/api/webhook/payment", async (req, res) => {
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
      const notification = req.body;

      const orderId = String(notification.order_id || "");
      const statusCode = String(notification.status_code || "");
      const grossAmountRaw = String(notification.gross_amount || "");
      const receivedSignature = String(notification.signature_key || "");
      const transactionStatus = String(notification.transaction_status || "");
      const fraudStatus = notification.fraud_status ? String(notification.fraud_status) : undefined;
      const paymentType = notification.payment_type
        ? String(notification.payment_type)
        : "Midtrans";
      const transactionId = notification.transaction_id
        ? String(notification.transaction_id)
        : orderId;

      if (!orderId || !statusCode || !grossAmountRaw || !transactionStatus) {
        return res.status(400).json({ error: "Payload webhook Midtrans tidak lengkap." });
      }

      if (!MIDTRANS_SERVER_KEY || MIDTRANS_SERVER_KEY.includes("ISI_DARI")) {
        return res.status(500).json({
          error: "MIDTRANS_SERVER_KEY belum dikonfigurasi di server.",
        });
      }

      if (receivedSignature) {
        const expectedSignature = createMidtransSignature(orderId, statusCode, grossAmountRaw);

        if (receivedSignature !== expectedSignature) {
          return res.status(403).json({
            error: "Signature webhook Midtrans tidak valid.",
          });
        }
      }

      const parsedFromOrderId = parseMidtransOrderId(orderId);

      const billId = notification.custom_field1 || parsedFromOrderId?.billId;
      const contributorId = notification.custom_field2 || parsedFromOrderId?.contributorId;

      if (!billId || !contributorId) {
        return res.status(400).json({
          error: "billId atau contributorId tidak ditemukan pada payload Midtrans.",
        });
      }

      const bill = await fetchBillWithDetails(String(billId));
      if (!bill) {
        return res.status(404).json({ error: "Tagihan tidak ditemukan." });
      }

      const contributor = bill.contributors.find((c) => c.id === contributorId);
      if (!contributor) {
        return res.status(404).json({ error: "Contributor tidak ditemukan." });
      }

      const receivedAmount = Number(grossAmountRaw);
      const expectedAmount = Number(contributor.shareAmount);

      if (receivedAmount !== expectedAmount) {
        await supabase.from("transaction_histories").insert({
          id: "tx-mid-fail-" + Date.now() + Math.floor(Math.random() * 1000),
          bill_id: bill.id,
          bill_title: bill.title,
          contributor_name: contributor.name,
          amount: receivedAmount,
          status: "FAILED",
          payment_method: `Midtrans ${paymentType}`,
        });

        return res.status(400).json({
          error: `Nominal Midtrans tidak sesuai. Diterima Rp ${receivedAmount}, seharusnya Rp ${expectedAmount}.`,
        });
      }

      if (contributor.paymentStatus === "PAID") {
        return res.json({
          success: true,
          status: "ALREADY_PAID",
          message: "Webhook diterima, tetapi contributor sudah lunas sebelumnya.",
        });
      }

      if (isFailedMidtransStatus(transactionStatus)) {
        await supabase
          .from("contributors")
          .update({
            payment_status: "FAILED",
            transaction_id: transactionId,
          })
          .eq("id", contributorId);

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

        return res.json({
          success: true,
          message: `Webhook Midtrans diproses sebagai transaksi gagal: ${transactionStatus}.`,
        });
      }

      if (!isSuccessfulMidtransStatus(transactionStatus, fraudStatus)) {
        return res.json({
          success: true,
          message: `Webhook Midtrans diterima. Status masih ${transactionStatus}, belum ditandai lunas.`,
        });
      }

      const paidAt = new Date().toISOString();

      await supabase
        .from("contributors")
        .update({
          payment_status: "PAID",
          paid_at: paidAt,
          transaction_id: transactionId,
        })
        .eq("id", contributorId);

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
        await supabase.from("bills").update({ status: "COMPLETED" }).eq("id", billId);

        await supabase.from("notifications").insert({
          id: "notif-mid-comp-" + Date.now(),
          bill_id: bill.id,
          bill_title: bill.title,
          message: `🎉 PATUNGAN LUNAS VIA MIDTRANS! Seluruh Rp ${Number(bill.totalAmount).toLocaleString("id-ID")} untuk '${bill.title}' telah berhasil dipenuhi.`,
          type: "BILL_COMPLETED",
        });
      }

      return res.json({
        success: true,
        message: "Webhook Midtrans berhasil diproses.",
        updatedStatus: "PAID",
        billStatus: allPaid ? "COMPLETED" : "LOCKED",
        transactionId,
      });
    } catch (error: any) {
      console.error("Midtrans webhook error:", error);
      return res.status(500).json({
        error: "Terjadi kesalahan saat memproses webhook Midtrans.",
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
