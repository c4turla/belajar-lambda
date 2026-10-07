# Website Sekolah Serverless — Panduan Setup AWS Lambda

Panduan ini menjelaskan langkah demi langkah untuk men-deploy proyek ini ke AWS, dari nol sampai website bisa diakses publik. Lihat juga [PRD.md](PRD.md) untuk detail fitur, model data, dan spesifikasi API.

> Catatan: Project ini sengaja memakai pola **RDS MySQL + RDS Proxy** (bukan DynamoDB) supaya kamu latihan skenario Lambda-ke-database-relasional yang paling umum ditemui di dunia nyata — termasuk konfigurasi VPC dan connection pooling.

## Daftar Isi
1. [Prasyarat](#1-prasyarat)
2. [Struktur Project](#2-struktur-project)
3. [Langkah 1 — Setup Database (RDS MySQL)](#3-langkah-1--setup-database-rds-mysql)
4. [Langkah 2 — Setup RDS Proxy & Secrets Manager](#4-langkah-2--setup-rds-proxy--secrets-manager)
5. [Langkah 3 — Pahami template.yaml](#5-langkah-3--pahami-templateyaml)
6. [Langkah 4 — Build & Deploy Backend (SAM)](#6-langkah-4--build--deploy-backend-sam)
7. [Langkah 5 — Deploy Frontend (S3 + CloudFront)](#7-langkah-5--deploy-frontend-s3--cloudfront)
8. [Langkah 6 — Testing Lokal](#8-langkah-6--testing-lokal)
9. [Troubleshooting](#9-troubleshooting)
10. [Cleanup (Hapus Semua Resource)](#10-cleanup-hapus-semua-resource)

---

## 1. Prasyarat

Install dan siapkan di komputer kamu:

| Tool | Kegunaan | Link |
|---|---|---|
| AWS Account | Tempat semua resource dibuat | https://aws.amazon.com |
| AWS CLI v2 | Konfigurasi credential, dipakai SAM | https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html |
| AWS SAM CLI | Build & deploy backend serverless | https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html |
| Node.js 20.x | Runtime Lambda & `npm` | https://nodejs.org |
| Docker Desktop | Diperlukan `sam local` untuk emulasi Lambda di komputer kamu | https://www.docker.com/products/docker-desktop |
| MySQL client (mysql CLI / MySQL Workbench / DBeaver) | Menjalankan `schema.sql` ke RDS | - |

Setelah AWS CLI terpasang, jalankan:

```bash
aws configure
```

Isi `AWS Access Key ID`, `AWS Secret Access Key`, default region (contoh `ap-southeast-1` untuk Jakarta), dan output format (`json`).

## 2. Struktur Project

```
lambda/
├── PRD.md               # dokumen requirement produk
├── README.md            # file ini
├── template.yaml         # AWS SAM template (backend)
├── samconfig.toml        # konfigurasi deploy (parameter contoh)
├── schema.sql            # DDL + data contoh untuk MySQL
├── package.json          # script npm bantu (sam build/deploy)
├── src/
│   ├── layers/db/nodejs/  # Lambda Layer: koneksi DB bersama (mysql2 + Secrets Manager)
│   └── handlers/          # 7 Lambda function (1 folder per modul)
└── frontend/              # HTML/CSS/JS statis untuk di-upload ke S3+CloudFront
```

## 3. Langkah 1 — Setup Database (RDS MySQL)

Resource database **tidak** dibuat lewat `template.yaml` (sengaja dipisah dari stack SAM) supaya kamu benar-benar memahami tiap komponen jaringan secara manual. Jika sudah terbiasa, kamu bisa pindahkan ini ke IaC terpisah (CloudFormation/Terraform) di latihan berikutnya.

1. **Buat VPC** (atau pakai VPC default akun kamu). Pastikan ada minimal 2 subnet di 2 Availability Zone berbeda untuk RDS.
2. **Buat Security Group untuk RDS**, misal nama `sg-rds-sekolah`, inbound rule: izinkan port `3306` dari **Security Group Lambda** (akan dibuat di langkah berikut — kamu bisa buat dulu SG kosong untuk Lambda, misal `sg-lambda-sekolah`, lalu reference SG tersebut di sini).
3. Buka **AWS Console → RDS → Create database**:
   - Engine: **MySQL** (versi 8.0)
   - Templates: **Free tier** (untuk latihan) atau **Dev/Test**
   - DB instance identifier: `sekolah-db`
   - Master username: `admin` (atau sesuai preferensi)
   - Master password: biarkan AWS generate otomatis, atau set manual — **catat password ini**, akan dipakai di Secrets Manager
   - DB instance class: `db.t3.micro`
   - Storage: 20 GB gp3 (cukup untuk latihan)
   - Connectivity: pilih VPC yang sama dengan Lambda nanti, **Public access: No**
   - VPC security group: pilih `sg-rds-sekolah` yang sudah dibuat
   - Initial database name: `sekolah_db`
4. Tunggu status instance menjadi **Available**, lalu catat **Endpoint** (akan dipakai sementara untuk setup awal, bukan untuk production call dari Lambda — Lambda akan memanggil lewat RDS Proxy, bukan endpoint RDS langsung).
5. **Jalankan `schema.sql`** ke database ini dari komputer kamu (butuh akses sementara — misal lewat bastion host/VPN, atau aktifkan Public access sementara lalu matikan lagi setelah selesai, atau pakai AWS Systems Manager Session Manager port forwarding):

   ```bash
   mysql -h <endpoint-rds> -u admin -p sekolah_db < schema.sql
   ```

   > Jika kamu tidak mau membuka akses publik sama sekali, cara paling aman adalah menjalankan `schema.sql` dari sebuah EC2 kecil/Cloud9 di VPC yang sama, atau lewat SSM Session Manager port forwarding ke RDS.

## 4. Langkah 2 — Setup RDS Proxy & Secrets Manager

### 4.1 Buat Secret di Secrets Manager
AWS Console → **Secrets Manager → Store a new secret**:
- Secret type: **Credentials for Amazon RDS database**
- Username & password: isi sesuai master user RDS yang kamu buat di langkah 3
- Pilih database instance `sekolah-db`
- Secret name: `sekolah-db-credentials`
- Selesaikan wizard, lalu **catat ARN secret ini** (dipakai sebagai parameter `DbSecretArn`).

### 4.2 Buat RDS Proxy
AWS Console → **RDS → Proxies → Create proxy**:
- Proxy identifier: `sekolah-db-proxy`
- Engine family: **MySQL**
- Database: pilih `sekolah-db`
- Connection pool max connections: `100%` (default cukup untuk latihan)
- Secrets Manager secret: pilih `sekolah-db-credentials` yang baru dibuat
- IAM role: biarkan AWS membuat role baru otomatis (role ini dipakai RDS Proxy untuk membaca secret, **bukan** role Lambda)
- VPC & Subnet: **sama dengan RDS**
- VPC security group: **buat/pilih security group khusus untuk Proxy**, misal `sg-rds-proxy-sekolah`, dengan inbound rule port 3306 dari `sg-lambda-sekolah`
- **Require Transport Layer Security**: boleh diaktifkan untuk latihan keamanan tambahan (opsional)

Tunggu status menjadi **Available**, lalu catat **Proxy endpoint** (contoh: `sekolah-db-proxy.proxy-xxxxxxxxx.ap-southeast-1.rds.amazonaws.com`) — ini dipakai sebagai parameter `DbProxyEndpoint`.

### 4.3 Buat Security Group untuk Lambda
Jika belum dibuat di langkah 3, buat security group `sg-lambda-sekolah` (tanpa inbound rule khusus, outbound default allow-all sudah cukup). SG ini yang akan dipakai sebagai parameter `VpcSecurityGroupId`, dan juga harus kamu tambahkan sebagai **source** yang diizinkan di inbound rule security group RDS Proxy (`sg-rds-proxy-sekolah`) pada port 3306.

**Ringkasan parameter yang sudah kamu kumpulkan sejauh ini:**

| Parameter | Dari langkah | Contoh nilai |
|---|---|---|
| `VpcSubnetIds` | Subnet VPC (privat, tempat Lambda berjalan) | `subnet-0abc123,subnet-0def456` |
| `VpcSecurityGroupId` | Security Group Lambda | `sg-0123456789abcdef0` |
| `DbProxyEndpoint` | Endpoint RDS Proxy (4.2) | `sekolah-db-proxy.proxy-xxxxx....rds.amazonaws.com` |
| `DbName` | Initial database name (3.3) | `sekolah_db` |
| `DbSecretArn` | ARN Secret (4.1) | `arn:aws:secretsmanager:ap-southeast-1:123456789012:secret:sekolah-db-credentials-AbCdEf` |

## 5. Langkah 3 — Pahami template.yaml

Buka [template.yaml](template.yaml). Beberapa bagian penting:

- **`Globals.Function.VpcConfig`** — semua Lambda otomatis dijalankan di dalam VPC/subnet yang kamu isi, supaya bisa terhubung ke RDS Proxy yang juga privat.
- **`DbLayer`** — Lambda Layer berisi modul `db.js` (koneksi `mysql2` + pengambilan kredensial dari Secrets Manager). Semua 7 function memakai layer ini lewat `Globals.Function.Layers`, jadi kode koneksi DB tidak perlu ditulis ulang di tiap function.
- **`AWSSecretsManagerGetSecretValuePolicy`** — SAM Policy Template bawaan yang otomatis membuatkan IAM permission `secretsmanager:GetSecretValue` **hanya** untuk secret ARN yang kamu tentukan (prinsip least-privilege).
- **`SekolahApi`** — resource API Gateway dengan CORS supaya bisa dipanggil dari browser (frontend di domain CloudFront yang berbeda).

Kamu tidak perlu mengubah file ini untuk deploy pertama kali — cukup isi parameter.

## 6. Langkah 4 — Build & Deploy Backend (SAM)

Dari root folder project (`lambda/`):

```bash
sam build
```

Perintah ini akan: install dependency di `src/layers/db/nodejs/package.json` (mysql2, AWS SDK Secrets Manager client) ke dalam layer, lalu menyiapkan semua Lambda function di `.aws-sam/build/`.

Lalu deploy dengan mode interaktif (pertama kali saja):

```bash
sam deploy --guided
```

SAM akan menanyakan:
- **Stack Name**: `website-sekolah-serverless`
- **AWS Region**: sesuaikan (misal `ap-southeast-1`)
- **Parameter VpcSubnetIds**: isi subnet ID dari [Langkah 2](#4-langkah-2--setup-rds-proxy--secrets-manager)
- **Parameter VpcSecurityGroupId**: isi SG Lambda
- **Parameter DbProxyEndpoint**: isi endpoint RDS Proxy
- **Parameter DbName**: `sekolah_db`
- **Parameter DbSecretArn**: isi ARN secret
- **Parameter CorsAllowOrigin**: isi `*` dulu (nanti bisa diupdate ke domain CloudFront spesifik setelah Langkah 5)
- **Confirm changes before deploy**: `Y`
- **Allow SAM CLI IAM role creation**: `Y`
- **Save arguments to configuration file**: `Y` (akan menimpa `samconfig.toml` dengan nilai asli yang kamu masukkan)

Setelah selesai, SAM menampilkan **Outputs**, catat nilai `ApiBaseUrl` — ini dipakai di langkah frontend.

Untuk deploy ulang setelah ada perubahan kode, cukup jalankan:

```bash
sam build && sam deploy
```

(tidak perlu `--guided` lagi karena parameter sudah tersimpan di `samconfig.toml`)

### Smoke test cepat lewat curl

```bash
curl https://<ApiBaseUrl>/sekolah
curl https://<ApiBaseUrl>/berita
curl https://<ApiBaseUrl>/guru
curl https://<ApiBaseUrl>/galeri
curl -X POST https://<ApiBaseUrl>/kontak \
  -H "Content-Type: application/json" \
  -d '{"nama":"Budi","email":"budi@example.com","subjek":"Tes","pesan":"Halo"}'
```

## 7. Langkah 5 — Deploy Frontend (S3 + CloudFront)

1. Isi `frontend/assets/js/config.js` dengan nilai `ApiBaseUrl` dari Output `sam deploy` di langkah sebelumnya:

   ```js
   const API_BASE_URL = "https://xxxxxxxxxx.execute-api.ap-southeast-1.amazonaws.com/Prod";
   ```

2. Buat bucket S3 khusus frontend (nama harus unik global):

   ```bash
   aws s3 mb s3://website-sekolah-frontend-<nama-unik-kamu>
   ```

3. Upload seluruh isi folder `frontend/`:

   ```bash
   aws s3 sync frontend/ s3://website-sekolah-frontend-<nama-unik-kamu> --delete
   ```

4. Buat **CloudFront Distribution** (lewat Console lebih mudah untuk pemula):
   - Origin: bucket S3 di atas, gunakan **Origin Access Control (OAC)** (bukan public bucket) supaya S3 tetap privat dan hanya bisa diakses lewat CloudFront
   - Default root object: `index.html`
   - Viewer protocol policy: **Redirect HTTP to HTTPS**
5. Setelah distribution **Deployed**, buka domain CloudFront (contoh `d1234abcd.cloudfront.net`) — website sekolah seharusnya sudah bisa diakses.
6. **(Rekomendasi keamanan)** Update parameter `CorsAllowOrigin` di `samconfig.toml` dari `*` menjadi `https://d1234abcd.cloudfront.net` (domain CloudFront kamu), lalu `sam deploy` ulang supaya API hanya bisa dipanggil dari domain frontend resmi.

## 8. Langkah 6 — Testing Lokal

Sebelum deploy, kamu bisa test Lambda di komputer sendiri (emulasi lewat Docker):

```bash
sam build
sam local start-api --parameter-overrides \
  VpcSubnetIds=subnet-xxx,subnet-yyy \
  VpcSecurityGroupId=sg-xxx \
  DbProxyEndpoint=<endpoint-proxy> \
  DbName=sekolah_db \
  DbSecretArn=<arn-secret> \
  CorsAllowOrigin=*
```

> Catatan: `sam local` menjalankan container Lambda di komputer kamu, **bukan** di dalam VPC AWS — supaya bisa konek ke RDS Proxy (yang privat), komputer kamu perlu akses jaringan ke VPC tersebut (misal lewat VPN/Site-to-Site, atau cukup test endpoint yang tidak butuh DB dulu). Untuk latihan paling simpel, testing paling andal tetap lewat `curl` ke API yang sudah di-deploy (Langkah 4).

Lalu di terminal lain:

```bash
curl http://127.0.0.1:3000/sekolah
```

Buka juga `frontend/index.html` langsung di browser (atau pakai extension "Live Server") — arahkan `config.js` ke `http://127.0.0.1:3000` untuk testing frontend+backend sekaligus secara lokal.

## 9. Troubleshooting

| Gejala | Kemungkinan Penyebab | Solusi |
|---|---|---|
| Lambda timeout / tidak ada response sama sekali | Lambda di VPC tapi security group tidak mengizinkan akses ke RDS Proxy | Pastikan SG RDS Proxy mengizinkan inbound 3306 dari SG Lambda, bukan sebaliknya |
| `ENOTFOUND` / `ETIMEDOUT` saat Lambda konek DB | Subnet yang dipilih untuk Lambda bukan subnet yang sama VPC dengan RDS Proxy | Pastikan `VpcSubnetIds` berada di VPC yang sama dengan RDS Proxy |
| `AccessDeniedException` dari Secrets Manager | ARN secret salah, atau policy belum ter-attach | Cek ulang `DbSecretArn`, pastikan `AWSSecretsManagerGetSecretValuePolicy` di `template.yaml` mengarah ke ARN yang benar |
| CORS error di console browser ("No Access-Control-Allow-Origin") | `CorsAllowOrigin` tidak sesuai domain frontend, atau response error (4xx/5xx) tidak menyertakan header CORS | Pastikan parameter `CorsAllowOrigin` benar, redeploy; perhatikan bahwa semua response (termasuk error) di `db.js`/handler sudah menambahkan header CORS |
| Response lambat di request pertama | Cold start Lambda di dalam VPC (attach ENI) | Normal untuk latihan; untuk produksi bisa pakai Provisioned Concurrency |
| `sam build` gagal install dependency layer | Belum ada koneksi internet / registry npm bermasalah saat build | Coba `sam build --use-container` supaya build di dalam Docker image resmi AWS |
| Data lama tidak muncul di frontend setelah redeploy | Cache CloudFront | Invalidate cache: `aws cloudfront create-invalidation --distribution-id <id> --paths "/*"` |

## 10. Cleanup (Hapus Semua Resource)

⚠️ **Penting**: RDS, RDS Proxy, dan CloudFront **tetap menagih biaya** meskipun tidak dipakai. Setelah selesai latihan, bersihkan semua resource dengan urutan berikut:

```bash
# 1. Hapus stack backend (API Gateway + Lambda + Layer)
sam delete

# 2. Hapus isi bucket S3 lalu bucket-nya
aws s3 rm s3://website-sekolah-frontend-<nama-unik-kamu> --recursive
aws s3 rb s3://website-sekolah-frontend-<nama-unik-kamu>
```

Lalu **manual lewat Console** (karena resource ini sengaja dibuat di luar stack SAM):
3. Hapus **CloudFront Distribution** (disable dulu, tunggu status Disabled, baru bisa delete).
4. Hapus **RDS Proxy** (`sekolah-db-proxy`).
5. Hapus **RDS instance** (`sekolah-db`) — centang "Skip final snapshot" jika memang tidak perlu backup.
6. Hapus **Secret** di Secrets Manager (`sekolah-db-credentials`) — defaultnya ada masa recovery 7-30 hari, bisa dipercepat hapus permanen lewat `aws secretsmanager delete-secret --secret-id sekolah-db-credentials --force-delete-without-recovery`.
7. Hapus **Security Group** (`sg-rds-sekolah`, `sg-rds-proxy-sekolah`, `sg-lambda-sekolah`) jika dibuat khusus untuk latihan ini dan tidak dipakai resource lain.

---

Selamat belajar AWS Lambda! Untuk detail fitur dan API, lihat [PRD.md](PRD.md).
#   b e l a j a r - l a m b d a  
 