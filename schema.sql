-- Skema database Website Sekolah Serverless
-- Jalankan file ini sekali setelah RDS MySQL instance aktif, misal:
--   mysql -h <endpoint-rds> -u admin -p < schema.sql
-- (lihat README.md bagian "Langkah 1 — Setup Database")

CREATE DATABASE IF NOT EXISTS sekolah_db
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE sekolah_db;

-- ===================== sekolah =====================
CREATE TABLE IF NOT EXISTS sekolah (
  id INT PRIMARY KEY AUTO_INCREMENT,
  nama VARCHAR(150) NOT NULL,
  alamat VARCHAR(255),
  telepon VARCHAR(30),
  email VARCHAR(100),
  visi TEXT,
  misi TEXT,
  sejarah TEXT,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- ===================== guru =====================
CREATE TABLE IF NOT EXISTS guru (
  id INT PRIMARY KEY AUTO_INCREMENT,
  nama VARCHAR(150) NOT NULL,
  nip VARCHAR(30),
  jabatan VARCHAR(100),
  mata_pelajaran VARCHAR(150),
  foto_url VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ===================== berita =====================
CREATE TABLE IF NOT EXISTS berita (
  id INT PRIMARY KEY AUTO_INCREMENT,
  judul VARCHAR(200) NOT NULL,
  ringkasan VARCHAR(500),
  isi TEXT NOT NULL,
  gambar_url VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ===================== galeri =====================
CREATE TABLE IF NOT EXISTS galeri (
  id INT PRIMARY KEY AUTO_INCREMENT,
  judul VARCHAR(150) NOT NULL,
  deskripsi VARCHAR(500),
  gambar_url VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ===================== ppdb =====================
CREATE TABLE IF NOT EXISTS ppdb (
  id INT PRIMARY KEY AUTO_INCREMENT,
  nama_lengkap VARCHAR(150) NOT NULL,
  nisn VARCHAR(20),
  nama_wali VARCHAR(150) NOT NULL,
  telepon VARCHAR(30) NOT NULL,
  email VARCHAR(100) NOT NULL,
  asal_sekolah VARCHAR(150),
  jenjang_dituju VARCHAR(50) NOT NULL,
  status ENUM('baru', 'diverifikasi', 'diterima', 'ditolak') NOT NULL DEFAULT 'baru',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ===================== kontak =====================
CREATE TABLE IF NOT EXISTS kontak (
  id INT PRIMARY KEY AUTO_INCREMENT,
  nama VARCHAR(150) NOT NULL,
  email VARCHAR(100) NOT NULL,
  subjek VARCHAR(200) NOT NULL,
  pesan TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ===================== Data contoh (dummy) =====================
INSERT INTO sekolah (nama, alamat, telepon, email, visi, misi, sejarah) VALUES
('SMA Negeri 1 Harapan Bangsa',
 'Jl. Pendidikan No. 10, Jakarta',
 '021-5550123',
 'info@sman1harapanbangsa.sch.id',
 'Menjadi sekolah unggul yang berakhlak mulia, berprestasi, dan berwawasan global.',
 'Menyelenggarakan pendidikan berkualitas; mengembangkan potensi siswa secara akademik dan non-akademik; membangun karakter disiplin dan integritas.',
 'Sekolah ini berdiri sejak tahun 1985 dan telah meluluskan ribuan siswa berprestasi.');

INSERT INTO guru (nama, nip, jabatan, mata_pelajaran, foto_url) VALUES
('Dra. Siti Rahayu, M.Pd.', '196501011990032001', 'Kepala Sekolah', NULL, NULL),
('Budi Santoso, S.Pd.', '197803152005011002', 'Guru', 'Matematika', NULL),
('Rina Marlina, S.Pd.', '198212102010012003', 'Guru', 'Bahasa Inggris', NULL),
('Agus Hidayat, S.Kom.', '198505202011011004', 'Guru', 'Informatika', NULL);

INSERT INTO berita (judul, ringkasan, isi, gambar_url) VALUES
('Penerimaan Peserta Didik Baru Tahun Ajaran 2026/2027 Dibuka',
 'Pendaftaran PPDB tahun ajaran baru resmi dibuka mulai hari ini.',
 'Sekolah kami dengan bangga mengumumkan bahwa pendaftaran peserta didik baru untuk tahun ajaran 2026/2027 telah dibuka. Calon siswa dapat mendaftar secara online melalui formulir PPDB di website ini.',
 NULL),
('Juara 1 Lomba Karya Tulis Ilmiah Tingkat Provinsi',
 'Tim siswa kami berhasil meraih juara 1 pada lomba KTI tingkat provinsi.',
 'Selamat kepada tim siswa yang telah mengharumkan nama sekolah dengan meraih juara 1 dalam Lomba Karya Tulis Ilmiah tingkat provinsi yang diselenggarakan bulan lalu.',
 NULL);

INSERT INTO galeri (judul, deskripsi, gambar_url) VALUES
('Upacara Bendera', 'Kegiatan upacara bendera rutin setiap hari Senin', 'https://via.placeholder.com/600x400?text=Upacara+Bendera'),
('Kegiatan Ekstrakurikuler', 'Dokumentasi kegiatan ekstrakurikuler pramuka', 'https://via.placeholder.com/600x400?text=Ekstrakurikuler');
