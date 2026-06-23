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

// Memetakan row Supabase ke struktur Bill (termasuk items & contributors)
async function fetchBillWithDetails(billId: string): Promise<Bill | null> {
  const { data: bill, error } = await supabase
    .from("bills")
    .select("*")
    .eq("id", billId)
    .single();

  if (error || !bill) return null;

  const { data: items } = await supabase
    .from("bill_items")
    .select("*")
    .eq("bill_id", billId);

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
      return res.status(400).json({ error: "Username sudah terdaftar. Silakan pilih username lain." });
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
      return res.status(400).json({ error: "Tagihan sudah dikonfirmasi/lunas, tidak bisa lagi menambah pembayar." });
    }

    const cleanName = name.trim();
    const duplicate = bill.contributors.some(
      (c) => c.name.toLowerCase() === cleanName.toLowerCase()
    );
    if (duplicate) {
      return res.status(400).json({ error: "Nama ini sudah terpakai di patungan ini. Harap pakai nama unik." });
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
      return res.status(400).json({ error: "Tagihan sudah ditutup/selesai, tidak bisa menghapus anggota." });
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
      return res.status(400).json({ error: "Belum ada anggota yang bergabung untuk membagi tagihan." });
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
      return res.status(400).json({ error: `Tagihan sudah berstatus ${bill.status}, tidak bisa dikunci.` });
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
      return res.status(200).json({ status: "ALREADY_PAID", message: "Transaksi ini sudah lunas." });
    }

    const txId = "TX-HOOK-" + Math.floor(100000 + Math.random() * 900000);
    const paidAt = new Date().toISOString();

    await supabase.from("contributors").update({
      payment_status: "PAID",
      paid_at: paidAt,
      transaction_id: txId,
    }).eq("id", contributorId);

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