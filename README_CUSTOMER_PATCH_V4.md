# SplitPay CustomerWorkspace Core API V4 Patch

Patch ini mengganti UI pembayaran invoice parsial agar kompatibel dengan `server.ts` Core API V4.

## Perubahan utama

1. Menghapus flow Snap redirect sebagai flow utama pada CustomerWorkspace.
2. Dropdown metode pembayaran disederhanakan menjadi:
   - BCA Virtual Account
   - BNI Virtual Account
   - BRI Virtual Account
   - CIMB Virtual Account
   - Permata Virtual Account
   - Mandiri Bill Payment
   - GoPay / QRIS
   - ShopeePay
   - QRIS
3. Tombol `Buat Transaksi` memanggil `/api/payments/midtrans/create` dan membaca `instruction` dari response backend.
4. VA number tampil langsung pada kartu invoice parsial.
5. Mandiri menampilkan `Company Code / Biller Code` dan `Bill Key / Payment Code`.
6. QR/GoPay/ShopeePay menampilkan QR image atau action/deeplink bila dikembalikan oleh Midtrans Core API.
7. Status lunas tetap diproses hanya melalui `/api/webhook/midtrans` atau `/api/payments/midtrans/status`.

## Cara pasang

Copy file berikut ke project kamu:

```text
src/components/CustomerWorkspace.tsx
```

Lalu restart dev server frontend/backend.

## Catatan

Patch ini membutuhkan `server.ts` dari `splitpay_server_core_api_v4.zip`. Kalau backend masih memakai Snap V3, response shape-nya berbeda dan UI tidak akan menemukan field `instruction`.
