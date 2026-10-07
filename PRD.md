# PRD — Website Sekolah Serverless (Latihan AWS Lambda)

| | |
|---|---|
| **Nama Proyek** | Website Profil & Layanan Sekolah Berbasis Serverless |
| **Status** | Draft v1.0 |
| **Tanggal** | 2026-10-06 |
| **Tujuan Dokumen** | Latihan membangun aplikasi web full-serverless di AWS, dengan fokus pada AWS Lambda yang terhubung ke database relasional |

---

## 1. Latar Belakang & Tujuan

Proyek ini dibuat sebagai **sarana latihan AWS Lambda**, menggunakan studi kasus yang mudah dipahami: website profil sekolah. Alih-alih server tradisional (EC2/VPS yang selalu nyala), seluruh backend dijalankan di atas AWS Lambda yang dipanggil lewat Amazon API Gateway, dan frontend disajikan secara statis lewat Amazon S3 + CloudFront.

Tujuan spesifik latihan ini:

1. Memahami pola arsitektur **serverless REST API** (API Gateway → Lambda).
2. Memahami cara **Lambda terhubung ke database relasional (RDS MySQL)** secara aman menggunakan **RDS Proxy** dan **Secrets Manager** — ini adalah bagian yang paling sering jadi tantangan nyata saat belajar Lambda, karena melibatkan VPC, security group, dan connection pooling.
3. Memahami penggunaan **Lambda Layer** untuk berbagi kode (koneksi DB) antar banyak function.
4. Memahami deployment terkelola dengan **AWS SAM** (Infrastructure as Code).
5. Memahami hosting frontend statis (S3 + CloudFront) yang terpisah dari backend.

## 2. Target Pengguna

- **Pengunjung umum** — calon wali murid, siswa, masyarakat yang ingin melihat informasi sekolah.
- **Calon siswa** — mengisi formulir PPDB (Pendaftaran Peserta Didik Baru) secara online.
- (Di luar scope v1) Admin sekolah yang mengelola konten lewat dashboard — lihat bagian [7. Out of Scope](#7-out-of-scope).

## 3. Arsitektur Sistem

```
                        ┌──────────────────────────┐
                        │        Pengguna           │
                        └─────────────┬────────────┘
                                      │ HTTPS
                     ┌────────────────┴─────────────────┐
                     ▼                                   ▼
          ┌─────────────────────┐              ┌──────────────────────┐
          │  CloudFront + S3     │              │   API Gateway (REST)  │
          │  (frontend statis:   │   fetch()    │   /sekolah  /berita   │
          │  html, css, js)      │ ───────────▶ │   /guru  /galeri      │
          └─────────────────────┘              │   /ppdb  /kontak      │
                                                 └──────────┬───────────┘
                                                            │ invoke
                                                            ▼
                                                 ┌──────────────────────┐
                                                 │   AWS Lambda (Node.js)│
                                                 │   7 function, 1 shared│
                                                 │   Layer (db.js)       │
                                                 │   berjalan di dalam   │
                                                 │   VPC                 │
                                                 └──────────┬───────────┘
                                                            │ kredensial dari
                                                            │ Secrets Manager
                                                            ▼
                                                 ┌──────────────────────┐
                                                 │     RDS Proxy         │
                                                 │  (connection pooling) │
                                                 └──────────┬───────────┘
                                                            ▼
                                                 ┌──────────────────────┐
                                                 │   Amazon RDS MySQL    │
                                                 │   (db.t3.micro)       │
                                                 └──────────────────────┘
```

**Komponen inti:**

| Komponen | Layanan AWS | Catatan |
|---|---|---|
| Frontend statis | S3 (static website) + CloudFront | HTML/CSS/JS vanilla, tanpa build step |
| API | API Gateway (REST API) | CORS diaktifkan untuk domain CloudFront |
| Compute | AWS Lambda (Node.js 20.x) | 7 function, masing-masing 1 tanggung jawab |
| Shared logic | Lambda Layer | Modul koneksi DB (`db.js`) dipakai ulang semua function |
| Database | Amazon RDS for MySQL | Single instance, single schema |
| Connection pooling | **RDS Proxy** | Supaya koneksi Lambda ke DB tidak membanjiri DB saat traffic naik/cold start banyak |
| Kredensial | AWS Secrets Manager | Lambda tidak pernah menyimpan password di kode/env var biasa |
| Jaringan | VPC (subnet privat untuk Lambda+RDS) | Lambda & RDS Proxy & RDS berada di VPC/subnet yang sama |
| IaC | AWS SAM | Deploy seluruh backend sebagai satu CloudFormation stack |

## 4. Lingkup Fitur (Scope v1)

### 4.1 Profil Sekolah (`GET /sekolah`)
*Sebagai pengunjung, saya ingin melihat profil sekolah (nama, alamat, visi-misi, sejarah singkat, kontak) di halaman beranda.*
Data diambil dari 1 baris tabel `sekolah`.

### 4.2 Berita & Pengumuman (`GET /berita`, `GET /berita/{id}`)
*Sebagai pengunjung, saya ingin melihat daftar berita/pengumuman sekolah dan membaca detailnya.*
List diurutkan dari yang terbaru (`created_at DESC`).

### 4.3 Data Guru & Staff (`GET /guru`)
*Sebagai pengunjung, saya ingin melihat daftar guru & staff beserta jabatan dan mata pelajaran yang diampu.*

### 4.4 Galeri Foto (`GET /galeri`)
*Sebagai pengunjung, saya ingin melihat galeri foto kegiatan sekolah.*
Metadata (judul, deskripsi, url gambar) disimpan di DB; file gambar sendiri cukup berupa URL (bisa dari S3 bucket terpisah atau URL eksternal) — upload file tidak termasuk scope v1.

### 4.5 PPDB — Pendaftaran Peserta Didik Baru (`POST /ppdb`)
*Sebagai calon siswa/wali murid, saya ingin mengisi formulir pendaftaran online.*
Field: nama lengkap, NISN (opsional), nama orang tua/wali, no. telepon, email, asal sekolah, jenjang yang dituju. Data di-insert ke tabel `ppdb` dengan status default `baru`.

### 4.6 Kontak (`POST /kontak`)
*Sebagai pengunjung, saya ingin mengirim pesan/pertanyaan ke sekolah lewat formulir kontak.*
Field: nama, email, subjek, pesan. Data di-insert ke tabel `kontak`.

## 5. Model Data

### 5.1 `sekolah`
| Kolom | Tipe | Keterangan |
|---|---|---|
| id | INT PK | selalu 1 row |
| nama | VARCHAR(150) | |
| alamat | VARCHAR(255) | |
| telepon | VARCHAR(30) | |
| email | VARCHAR(100) | |
| visi | TEXT | |
| misi | TEXT | |
| sejarah | TEXT | |
| updated_at | TIMESTAMP | |

### 5.2 `guru`
| Kolom | Tipe | Keterangan |
|---|---|---|
| id | INT PK AUTO_INCREMENT | |
| nama | VARCHAR(150) | |
| nip | VARCHAR(30) | nullable |
| jabatan | VARCHAR(100) | mis. "Kepala Sekolah", "Guru Matematika" |
| mata_pelajaran | VARCHAR(150) | nullable |
| foto_url | VARCHAR(255) | nullable |
| created_at | TIMESTAMP | |

### 5.3 `berita`
| Kolom | Tipe | Keterangan |
|---|---|---|
| id | INT PK AUTO_INCREMENT | |
| judul | VARCHAR(200) | |
| ringkasan | VARCHAR(500) | |
| isi | TEXT | |
| gambar_url | VARCHAR(255) | nullable |
| created_at | TIMESTAMP | |

### 5.4 `galeri`
| Kolom | Tipe | Keterangan |
|---|---|---|
| id | INT PK AUTO_INCREMENT | |
| judul | VARCHAR(150) | |
| deskripsi | VARCHAR(500) | nullable |
| gambar_url | VARCHAR(255) | |
| created_at | TIMESTAMP | |

### 5.5 `ppdb`
| Kolom | Tipe | Keterangan |
|---|---|---|
| id | INT PK AUTO_INCREMENT | |
| nama_lengkap | VARCHAR(150) | |
| nisn | VARCHAR(20) | nullable |
| nama_wali | VARCHAR(150) | |
| telepon | VARCHAR(30) | |
| email | VARCHAR(100) | |
| asal_sekolah | VARCHAR(150) | nullable |
| jenjang_dituju | VARCHAR(50) | mis. "Kelas 7", "Kelas 10" |
| status | ENUM('baru','diverifikasi','diterima','ditolak') | default `baru` |
| created_at | TIMESTAMP | |

### 5.6 `kontak`
| Kolom | Tipe | Keterangan |
|---|---|---|
| id | INT PK AUTO_INCREMENT | |
| nama | VARCHAR(150) | |
| email | VARCHAR(100) | |
| subjek | VARCHAR(200) | |
| pesan | TEXT | |
| created_at | TIMESTAMP | |

DDL lengkap ada di [schema.sql](schema.sql).

## 6. Spesifikasi API

Base path (contoh): `https://{api-id}.execute-api.{region}.amazonaws.com/Prod`

| Method | Path | Fungsi Lambda | Deskripsi | Body Request | Response 200 |
|---|---|---|---|---|---|
| GET | `/sekolah` | `getProfilSekolah` | Ambil profil sekolah | - | `{ id, nama, alamat, telepon, email, visi, misi, sejarah }` |
| GET | `/berita` | `listBerita` | List semua berita (terbaru dulu) | - | `[{ id, judul, ringkasan, gambar_url, created_at }]` |
| GET | `/berita/{id}` | `getBerita` | Detail 1 berita | - | `{ id, judul, isi, gambar_url, created_at }` |
| GET | `/guru` | `listGuru` | List guru & staff | - | `[{ id, nama, jabatan, mata_pelajaran, foto_url }]` |
| GET | `/galeri` | `listGaleri` | List galeri foto | - | `[{ id, judul, deskripsi, gambar_url }]` |
| POST | `/ppdb` | `createPpdb` | Submit pendaftaran siswa baru | `{ nama_lengkap, nisn?, nama_wali, telepon, email, asal_sekolah?, jenjang_dituju }` | `{ message: "Pendaftaran berhasil", id }` |
| POST | `/kontak` | `createKontak` | Submit pesan kontak | `{ nama, email, subjek, pesan }` | `{ message: "Pesan terkirim", id }` |

**Format error** (semua endpoint): `{ "error": "pesan error" }` dengan status code 400 (validasi) atau 500 (server/DB error).

**CORS**: semua response menyertakan header `Access-Control-Allow-Origin` (dikonfigurasi ke domain CloudFront saat deploy, `*` untuk latihan lokal).

## 7. Non-Functional Requirements

### Keamanan
- Kredensial database **tidak pernah** hardcode di kode atau disimpan sebagai plaintext env var — diambil dari **AWS Secrets Manager** saat runtime.
- Lambda hanya diberi IAM permission minimum: `secretsmanager:GetSecretValue` (scoped ke 1 secret ARN) dan koneksi jaringan ke RDS Proxy lewat Security Group.
- RDS & RDS Proxy berada di **subnet privat** (tidak ada akses publik langsung ke database).
- Input dari form PPDB & Kontak divalidasi minimal (field wajib, format email) sebelum query ke DB, untuk mencegah data kosong/sampah — bukan untuk mencegah SQL Injection karena semua query **selalu** memakai parameterized query (prepared statement), tidak pernah string concatenation.

### Performa
- Lambda yang berjalan di dalam VPC punya cold start lebih tinggi (perlu attach ENI). RDS Proxy membantu menyerap lonjakan koneksi saat banyak cold start terjadi bersamaan.
- Koneksi database dibuat **di luar handler** (reuse antar invocation saat container Lambda masih warm) untuk mengurangi overhead per-request.
- Frontend statis di-cache lewat CloudFront supaya load cepat dan tidak membebani origin.

### Observability
- Seluruh log Lambda otomatis masuk ke **Amazon CloudWatch Logs** (1 log group per function).
- (Opsional, next step) tambahkan X-Ray tracing untuk melihat latency tiap komponen (API Gateway → Lambda → RDS Proxy).

### Estimasi Biaya (asumsi traffic rendah, untuk latihan)
| Layanan | Estimasi/bulan |
|---|---|
| Lambda (free tier 1 juta request) | ~$0 |
| API Gateway (free tier 1 juta request/bulan, 12 bulan pertama) | ~$0–1 |
| RDS db.t3.micro (Single-AZ) | ~$12–15 |
| **RDS Proxy** | ~$10–15 (dihitung per vCPU instance RDS, ini biaya tetap meskipun kecil — perlu diperhatikan karena **tidak gratis** dan tetap menagih walau idle) |
| S3 + CloudFront (traffic kecil) | ~$1–3 |
| **Total** | **~$25–35/bulan** |

> ⚠️ Catatan penting: RDS, RDS Proxy, dan NAT Gateway (jika dipakai untuk akses internet dari Lambda di subnet privat) adalah komponen yang **tetap menagih walau tidak ada traffic**. Lihat bagian Cleanup di [README.md](README.md) untuk cara mematikan semua resource setelah selesai latihan.

## 8. Out of Scope (v1)

- Login/autentikasi admin & dashboard pengelolaan konten (CMS) — berita/guru/galeri saat ini dianggap diisi langsung lewat SQL atau tool admin manual.
- Upload file gambar langsung dari browser (saat ini `gambar_url` diisi manual/link eksternal).
- Multi-tenant (banyak sekolah dalam 1 sistem).
- Notifikasi email otomatis saat ada pendaftaran PPDB baru atau pesan kontak baru (bisa jadi pengembangan lanjutan dengan SES/SNS).
- Pembayaran/biaya pendaftaran online.

Semua poin di atas adalah kandidat **Fase 2** setelah latihan dasar Lambda+RDS ini dikuasai.

## 9. Milestone Implementasi

| Fase | Deliverable |
|---|---|
| **Fase 1 — Infrastruktur Dasar** | VPC/subnet, RDS MySQL, Secrets Manager secret, RDS Proxy, schema.sql dijalankan |
| **Fase 2 — Backend Serverless** | `template.yaml` (SAM), Lambda Layer `db.js`, 7 Lambda handler, deploy & test lewat `sam local` / Postman |
| **Fase 3 — Frontend** | Halaman statis (beranda, berita, guru, galeri, PPDB, kontak) terhubung ke API Gateway |
| **Fase 4 — Deploy Produksi & Verifikasi** | Upload frontend ke S3+CloudFront, smoke test end-to-end, dokumentasi cleanup |

## 10. Kriteria Sukses

- [ ] `sam deploy` berhasil membuat seluruh stack backend tanpa error.
- [ ] Semua 7 endpoint API bisa dipanggil dan mengembalikan data dari RDS MySQL lewat RDS Proxy.
- [ ] Formulir PPDB dan Kontak di frontend berhasil menyimpan data baru ke database (dibuktikan dengan query langsung ke DB).
- [ ] Website bisa diakses lewat URL CloudFront dan menampilkan data dinamis dari backend.
- [ ] Tidak ada kredensial database yang ter-commit ke kode sumber.
