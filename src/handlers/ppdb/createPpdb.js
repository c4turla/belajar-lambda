const { query, jsonResponse } = require('/opt/nodejs/db');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

exports.handler = async (event) => {
  try {
    const body = JSON.parse(event.body || '{}');
    const {
      nama_lengkap,
      nisn,
      nama_wali,
      telepon,
      email,
      asal_sekolah,
      jenjang_dituju,
    } = body;

    if (!nama_lengkap || !nama_wali || !telepon || !email || !jenjang_dituju) {
      return jsonResponse(400, {
        error:
          'Field nama_lengkap, nama_wali, telepon, email, dan jenjang_dituju wajib diisi',
      });
    }
    if (!EMAIL_RE.test(email)) {
      return jsonResponse(400, { error: 'Format email tidak valid' });
    }

    const result = await query(
      `INSERT INTO ppdb
        (nama_lengkap, nisn, nama_wali, telepon, email, asal_sekolah, jenjang_dituju)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        nama_lengkap,
        nisn || null,
        nama_wali,
        telepon,
        email,
        asal_sekolah || null,
        jenjang_dituju,
      ]
    );

    return jsonResponse(201, {
      message: 'Pendaftaran berhasil',
      id: result.insertId,
    });
  } catch (err) {
    console.error(err);
    return jsonResponse(500, { error: 'Gagal menyimpan pendaftaran PPDB' });
  }
};
