// utils.js — деньги в halala (целые числа), форматирование, помощники

// Перевод SAR (может быть строкой с запятой/точкой) -> halala (int)
function toHalala(sarValue) {
  if (sarValue === '' || sarValue === null || sarValue === undefined) return 0;
  const normalized = String(sarValue).replace(',', '.').trim();
  const num = parseFloat(normalized);
  if (isNaN(num)) return 0;
  return Math.round(num * 100);
}

// halala (int) -> строка SAR "12.34"
function fromHalala(halala) {
  const n = Number(halala) || 0;
  return (n / 100).toFixed(2);
}

// Форматирование суммы для отображения: "12.34 SAR"
function formatSAR(halala) {
  return `${fromHalala(halala)} SAR`;
}

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('ru-RU') + ' ' + d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

function todayISO() {
  return new Date().toISOString();
}

function dateOnly(iso) {
  return (iso || '').slice(0, 10);
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// Безопасное сложение количества (до 3 знаков после запятой), хранится как число
function roundQty(n) {
  return Math.round((Number(n) || 0) * 1000) / 1000;
}

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function startOfDay(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function endOfDay(d) { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; }

function periodRange(period, customFrom, customTo) {
  const now = new Date();
  let from, to;
  if (period === 'today') { from = startOfDay(now); to = endOfDay(now); }
  else if (period === 'yesterday') { const y = new Date(now); y.setDate(y.getDate() - 1); from = startOfDay(y); to = endOfDay(y); }
  else if (period === 'week') { const w = new Date(now); w.setDate(w.getDate() - 7); from = startOfDay(w); to = endOfDay(now); }
  else if (period === 'month') { const m = new Date(now); m.setMonth(m.getMonth() - 1); from = startOfDay(m); to = endOfDay(now); }
  else if (period === 'custom') { from = startOfDay(new Date(customFrom)); to = endOfDay(new Date(customTo)); }
  else { from = startOfDay(now); to = endOfDay(now); }
  return { from, to };
}

function inRange(iso, from, to) {
  const t = new Date(iso).getTime();
  return t >= from.getTime() && t <= to.getTime();
}

const UNITS = { kg: 'кг', g: 'г', l: 'л', ml: 'мл', pcs: 'шт', pack: 'упаковка' };
const PAYMENT_METHODS = ['Наличные', 'Карта', 'Перевод', 'Другое'];
const ORDER_STATUSES = ['Новый', 'Подтверждён', 'Готовится', 'Готов', 'Доставляется', 'Доставлен', 'Отменён'];
const DEBT_TYPES = { client: 'Клиент должен бизнесу', business: 'Бизнес должен человеку/поставщику' };
const DEBT_STATUSES = ['Открыт', 'Частично погашен', 'Погашен'];
const STOCK_MOVE_TYPES = { purchase: 'Закупка', sale: 'Продажа', production: 'Производство', writeoff: 'Списание', adjustment: 'Корректировка' };
