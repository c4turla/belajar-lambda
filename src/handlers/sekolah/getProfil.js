const { query, jsonResponse } = require('/opt/nodejs/db');

exports.handler = async () => {
  try {
    const rows = await query('SELECT * FROM sekolah LIMIT 1');
    if (rows.length === 0) {
      return jsonResponse(404, { error: 'Profil sekolah belum diisi' });
    }
    return jsonResponse(200, rows[0]);
  } catch (err) {
    console.error(err);
    return jsonResponse(500, { error: 'Gagal mengambil profil sekolah' });
  }
};
