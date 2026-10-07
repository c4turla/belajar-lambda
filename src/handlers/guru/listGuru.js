const { query, jsonResponse } = require('/opt/nodejs/db');

exports.handler = async () => {
  try {
    const rows = await query(
      'SELECT id, nama, jabatan, mata_pelajaran, foto_url FROM guru ORDER BY nama ASC'
    );
    return jsonResponse(200, rows);
  } catch (err) {
    console.error(err);
    return jsonResponse(500, { error: 'Gagal mengambil daftar guru' });
  }
};
