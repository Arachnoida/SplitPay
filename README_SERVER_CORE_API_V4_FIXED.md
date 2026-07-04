# SplitPay Server Core API V4 Fixed

Patch ini mengganti endpoint create payment dari Snap Redirect ke Midtrans Core API Charge.

Perbaikan utama:
- `/api/payments/midtrans/create` memakai `MIDTRANS_CHARGE_URL = https://api.sandbox.midtrans.com/v2/charge`.
- Response backend mengembalikan `instruction.orderId` secara eksplisit dari `midtransData.order_id` atau fallback lokal `orderId`.
- BCA/BNI/BRI/CIMB menampilkan VA number dari `va_numbers`.
- Permata menampilkan `permata_va_number`.
- Mandiri menampilkan `billerCode` dan `billKey`.
- GoPay/QRIS/ShopeePay menampilkan `actions`, `qrImageUrl`, dan `redirectUrl` jika tersedia.
- `processMidtransState` dibuat `async` agar aman untuk webhook dan status check.
- Mock webhook tetap dikunci oleh `ALLOW_MOCK_WEBHOOK`.

Cara pakai:
1. Replace `server.ts` di root project dengan file ini.
2. Pastikan `.env` berisi Midtrans Sandbox key.
3. Restart backend.
4. Coba buat transaksi dari invoice parsial.
