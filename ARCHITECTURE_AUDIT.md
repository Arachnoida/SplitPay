# SplitPay Architecture Audit V3

## Masalah yang ditemukan

### 1. Role gating keliru

Ruang Patungan dikunci untuk admin, padahal kebutuhan bisnis SplitPay adalah admin membuat tagihan dan user join memakai kode. Akibatnya user biasa melihat halaman Akses Ditolak.

### 2. Payment flow masih mock

Frontend sebelumnya memanggil `/api/webhook/payment` dan langsung membuat contributor menjadi `PAID`. Itu bukan integrasi Midtrans yang valid karena status pembayaran diubah oleh tombol frontend, bukan oleh notification dari Midtrans.

### 3. Credential pembayaran dipalsukan di frontend

Nomor VA, QRIS, dan barcode sebelumnya dibuat deterministik dari ID contributor. Secara UX terlihat keren, tetapi salah secara integrasi payment gateway. Credential bayar harus berasal dari Midtrans, bukan dibuat oleh React component.

### 4. Mandiri disamakan dengan VA biasa

Mandiri Bill Payment pada Midtrans memakai Biller Code dan Bill Key. Karena itu UI tidak boleh menampilkan satu nomor VA Mandiri palsu.

### 5. Role admin bisa dipilih saat registrasi publik

Frontend sebelumnya memberi opsi daftar sebagai admin. Untuk sistem pembayaran, ini tidak aman. Registrasi publik seharusnya default user.

## Prinsip arsitektur baru

### Frontend

Frontend bertugas:

- membuka ruang patungan,
- join memakai kode,
- mengatur nominal sebelum invoice dikunci,
- meminta backend membuat transaksi Midtrans,
- membuka link checkout Midtrans,
- meminta backend mengecek status jika webhook belum masuk.

Frontend tidak boleh:

- mengubah status invoice menjadi lunas secara langsung,
- membuat nomor VA/QRIS/barcode palsu,
- menyimpan server key Midtrans,
- memberi kebebasan user publik menjadi admin.

### Backend

Backend bertugas:

- membuat Snap transaction ke Midtrans,
- menyimpan order_id sebagai reference pending,
- menerima webhook Midtrans,
- memvalidasi signature,
- memastikan nominal sesuai share amount,
- menandai contributor PAID hanya untuk status settlement/capture valid,
- menandai bill COMPLETED jika semua contributor sudah PAID.

## Role matrix

| Fitur | Guest | User | Admin |
|---|---:|---:|---:|
| Dashboard | Ya | Ya | Ya |
| Login/Register | Ya | Ya | Ya |
| Join kode patungan | Ya/User disarankan | Ya | Ya |
| Lihat Ruang Patungan | Ya | Ya | Ya |
| Membuat bill | Tidak | Tidak | Ya |
| Mengunci invoice | Tidak secara ideal | Tidak secara ideal | Ya |
| Membayar invoice parsial | Tidak/User disarankan | Ya | Ya |
| Melihat riwayat | Ya untuk demo | Ya | Ya |
| Reset database | Dev only | Dev only | Dev only |

Catatan: karena project ini belum memakai JWT/session backend, role matrix di atas masih enforced terutama di UI dan konfigurasi dev. Untuk production, semua endpoint mutasi harus dilindungi auth middleware.
