// backup.js — резервное копирование и восстановление

async function createBackup() {
  const data = await db.exportAll();
  const payload = {
    app: 'BISMILLAH BARAKA',
    version: 1,
    exported_at: todayISO(),
    data,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const dateStr = dateOnly(todayISO());
  const a = document.createElement('a');
  a.href = url;
  a.download = `BISMILLAH_BARAKA_backup_${dateStr}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function validateBackupStructure(payload) {
  if (!payload || typeof payload !== 'object') return false;
  if (payload.app !== 'BISMILLAH BARAKA') return false;
  if (!payload.data || typeof payload.data !== 'object') return false;
  const requiredStores = ['orders', 'products', 'dishes', 'settings'];
  for (const s of requiredStores) {
    if (!(s in payload.data)) return false;
  }
  return true;
}

async function restoreBackup(file) {
  const text = await file.text();
  let payload;
  try {
    payload = JSON.parse(text);
  } catch (e) {
    throw new Error('Файл повреждён или не является корректным JSON');
  }
  if (!validateBackupStructure(payload)) {
    throw new Error('Структура файла резервной копии некорректна');
  }
  await db.importAll(payload.data);
  return true;
}
