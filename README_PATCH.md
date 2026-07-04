# SplitPay Architecture Patch V3

Patch ini merapikan tiga masalah arsitektur utama pada SplitPay:

1. Role access.
   - Portal Kasir tetap admin-only.
   - Ruang Patungan dapat diakses admin dan user.
   - User biasa dapat membuka kode patungan, join, melihat invoice parsial, dan melakukan pembayaran.

2. Midtrans payment flow.
   - Tombol mock `Kirim Simulasi Webhook Lunas` dihapus dari flow utama.
   - Frontend hanya membuat transaksi Midtrans dan membuka halaman checkout Midtrans.
   - Status contributor tetap `PENDING` sampai webhook Midtrans valid atau Get Status API mengembalikan status sukses.
   - Mock webhook internal `/api/webhook/payment` hanya aktif jika `ALLOW_MOCK_WEBHOOK=true`.

3. Registrasi akun.
   - Registrasi publik selalu membuat akun `user`.
   - Admin tidak lagi bisa dipilih bebas dari frontend.
   - Admin hanya dibuat manual dari database atau dengan `ADMIN_REGISTRATION_SECRET` jika endpoint backend dikembangkan untuk itu.

## File yang diganti

```text
server.ts
src/App.tsx
src/components/AuthScreen.tsx
src/components/CustomerWorkspace.tsx
```

## Cara apply

Replace file pada project kamu dengan file di patch ini sesuai path masing-masing.

## .env yang disarankan

```env
APP_URL=http://localhost:3000
APP_BASE_URL=http://localhost:3000

SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_KEY=PASTE_SERVICE_ROLE_KEY_HERE

MIDTRANS_SERVER_KEY=SB-Mid-server-xxxxx
MIDTRANS_CLIENT_KEY=SB-Mid-client-xxxxx
MIDTRANS_IS_PRODUCTION=false

ALLOW_MOCK_WEBHOOK=false
ALLOW_RESET_DATABASE=true
ADMIN_REGISTRATION_SECRET=isi-secret-lokal-jika-dibutuhkan
```

Saat webhook ingin dites sungguhan dari Midtrans Sandbox, `APP_BASE_URL` harus URL publik HTTPS dari ngrok/cloudflared, bukan localhost.

Contoh:

```bash
ngrok http 3000
```

Lalu set:

```env
APP_BASE_URL=https://xxxx-xxxx.ngrok-free.app
```

Webhook URL di dashboard Midtrans Sandbox:

```text
https://xxxx-xxxx.ngrok-free.app/api/webhook/midtrans
```

## Cara mengetes flow baru

1. Login sebagai admin.
2. Buat bill di Portal Kasir.
3. Buka Ruang Patungan.
4. Tambahkan anggota atau login sebagai user dan join memakai kode.
5. Bagi nominal sampai meter seimbang.
6. Klik `Kunci dan Terbitkan Invoice`.
7. Pada invoice contributor, pilih metode target Midtrans.
8. Klik `Buat Transaksi`.
9. Buka link Midtrans yang muncul.
10. Lakukan pembayaran memakai Midtrans Sandbox Simulator.
11. Jika webhook belum masuk karena backend masih lokal, klik `Cek Status` setelah simulator berhasil.

## Catatan penting

- Sandbox tidak boleh dibayar dengan aplikasi bank/e-wallet sungguhan.
- Mandiri Bill Payment memakai Biller Code dan Bill Key yang diterbitkan oleh Midtrans, bukan nomor VA buatan frontend.
- Jika `Cek Status` masih pending, berarti transaksi di Midtrans belum settlement/capture atau simulator belum benar-benar menyelesaikan pembayaran.
