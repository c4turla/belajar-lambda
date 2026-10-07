const { query, jsonResponse } = require('/opt/nodejs/db');

exports.handler = async (event) => {
  try {
    const id = event.pathParameters && event.pathParameters.id;
    if (!id || Number.isNaN(Number(id))) {
      return jsonResponse(400, { error: 'ID berita tidak valid' });
    }

    const rows = await query('SELECT * FROM berita WHERE id = ?', [id]);
    if (rows.length === 0) {
      return jsonResponse(404, { error: 'Berita tidak ditemukan' });
    }
    return jsonResponse(200, rows[0]);
  } catch (err) {
    console.error(err);
    return jsonResponse(500, { error: 'Gagal mengambil detail berita' });
  }
};
