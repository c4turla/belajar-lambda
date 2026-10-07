const { query, jsonResponse } = require('/opt/nodejs/db');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

exports.handler = async (event) => {
  try {
    const body = JSON.parse(event.body || '{}');
    const { nama, email, subjek, pesan } = body;

    if (!nama || !email || !subjek || !pesan) {
      return jsonResponse(400, {
        error: 'Field nama, email, subjek, dan pesan wajib diisi',
      });
    }
    if (!EMAIL_RE.test(email)) {
      return jsonResponse(400, { error: 'Format email tidak valid' });
    }

    const result = await query(
      'INSERT INTO kontak (nama, email, subjek, pesan) VALUES (?, ?, ?, ?)',
      [nama, email, subjek, pesan]
    );

    return jsonResponse(201, {
      message: 'Pesan terkirim',
      id: result.insertId,
    });
  } catch (err) {
    console.error(err);
    return jsonResponse(500, { error: 'Gagal mengirim pesan kontak' });
  }
};
