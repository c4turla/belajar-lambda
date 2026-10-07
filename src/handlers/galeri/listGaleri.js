const { query, jsonResponse } = require('/opt/nodejs/db');

exports.handler = async () => {
  try {
    const rows = await query(
      'SELECT id, judul, deskripsi, gambar_url FROM galeri ORDER BY created_at DESC'
    );
    return jsonResponse(200, rows);
  } catch (err) {
    console.error(err);
    return jsonResponse(500, { error: 'Gagal mengambil galeri' });
  }
};
