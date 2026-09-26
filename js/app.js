// app.js — маршрутизация, рендеринг экранов, общая логика UI

const APP = document.getElementById('app-content');
const MODAL_ROOT = document.getElementById('modal-root');
const NAV = document.getElementById('bottom-nav');

const ROUTES = {
  '/dashboard': renderDashboard,
  '/orders': renderOrdersList,
  '/orders/new': renderOrderForm,
  '/cash': renderCash,
  '/expenses': renderExpenses,
  '/debts': renderDebts,
  '/stock': renderStock,
  '/purchases': renderPurchases,
  '/dishes': renderDishes,
  '/salaries': renderSalaries,
  '/reports': renderReports,
  '/backup': renderBackup,
  '/more': renderMore,
  '/settings': renderSettings,
};

function currentPath() {
  return (location.hash || '#/dashboard').slice(1);
}

function navigate(path) {
  location.hash = path;
}

async function router() {
  const full = currentPath();
  const [path, param] = splitParam(full);
  APP.scrollTop = 0;
  updateNavActive(path);
  try {
    if (path === '/orders' && param) return renderOrderDetail(param);
    if (path === '/dishes' && param) return renderDishDetail(param);
    if (path === '/debts' && param) return renderDebtDetail(param);
    if (path === '/salaries' && param) return renderSalaryDetail(param);
    const fn = ROUTES[path] || renderDashboard;
    await fn();
  } catch (err) {
    console.error(err);
    APP.innerHTML = `<div class="empty-state">Ошибка загрузки экрана.<br><small>${escapeHtml(err.message)}</small></div>`;
  }
}

// пути вида /orders/123 -> ['/orders','123']
function splitParam(full) {
  const parts = full.split('/').filter(Boolean);
  if (parts.length >= 2 && !isNaN(Number(parts[1]))) {
    return ['/' + parts[0], Number(parts[1])];
  }
  return ['/' + parts.join('/'), null];
}

function updateNavActive(path) {
  const group = navGroup(path);
  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.group === group);
  });
}

function navGroup(path) {
  if (path === '/dashboard') return 'home';
  if (path.startsWith('/orders')) return 'orders';
  if (['/cash', '/expenses', '/debts'].includes(path)) return 'money';
  if (path === '/stock') return 'stock';
  return 'more';
}

window.addEventListener('hashchange', router);
window.addEventListener('DOMContentLoaded', async () => {
  await db.open();
  await seedSettingsIfEmpty();
  registerServiceWorker();
  await router();
});

async function seedSettingsIfEmpty() {
  const biz = await db.get('settings', 'business_name');
  if (!biz) await db.put('settings', { key: 'business_name', value: 'BISMILLAH BARAKA' });
}

// ---------- Модальные окна ----------
function openModal(title, bodyHtml, opts = {}) {
  MODAL_ROOT.innerHTML = `
    <div class="modal-overlay" id="modal-overlay">
      <div class="modal-sheet">
        <div class="modal-header">
          <h3>${escapeHtml(title)}</h3>
          <button class="modal-close" id="modal-close-btn" aria-label="Закрыть">&times;</button>
        </div>
        <div class="modal-body">${bodyHtml}</div>
      </div>
    </div>`;
  MODAL_ROOT.classList.add('open');
  document.getElementById('modal-close-btn').onclick = closeModal;
  document.getElementById('modal-overlay').onclick = (e) => {
    if (e.target.id === 'modal-overlay' && opts.dismissible !== false) closeModal();
  };
}

function closeModal() {
  MODAL_ROOT.classList.remove('open');
  MODAL_ROOT.innerHTML = '';
}

function confirmDialog(message) {
  return new Promise((resolve) => {
    openModal('Подтверждение', `
      <p style="margin-bottom:16px;">${escapeHtml(message)}</p>
      <div class="btn-row">
        <button class="btn btn-secondary" id="confirm-no">Отмена</button>
        <button class="btn btn-danger" id="confirm-yes">Подтвердить</button>
      </div>
    `);
    document.getElementById('confirm-no').onclick = () => { closeModal(); resolve(false); };
    document.getElementById('confirm-yes').onclick = () => { closeModal(); resolve(true); };
  });
}

function toast(message) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = message;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 300); }, 2200);
}

function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./service-worker.js').catch(() => {});
  }
}

// ---------- Общие UI-хелперы ----------
function card(label, value, extraClass = '') {
  return `<div class="stat-card ${extraClass}"><div class="stat-label">${escapeHtml(label)}</div><div class="stat-value">${value}</div></div>`;
}

function selectOptions(items, valueKey, labelKey, selected) {
  return items.map(it => `<option value="${it[valueKey]}" ${String(it[valueKey]) === String(selected) ? 'selected' : ''}>${escapeHtml(it[labelKey])}</option>`).join('');
}

function statusBadgeClass(status) {
  const map = {
    'Новый': 'badge-blue', 'Подтверждён': 'badge-blue', 'Готовится': 'badge-orange',
    'Готов': 'badge-orange', 'Доставляется': 'badge-purple', 'Доставлен': 'badge-green', 'Отменён': 'badge-red',
  };
  return map[status] || 'badge-blue';
}

// ---------- Dashboard ----------
async function renderDashboard() {
  const report = await buildSummaryReport('today');
  const lowStock = await getLowStockProducts();

  APP.innerHTML = `
    <div class="screen-header">
      <h1>BISMILLAH BARAKA</h1>
      <div class="screen-sub">Сегодня, ${new Date().toLocaleDateString('ru-RU')}</div>
    </div>
    ${lowStock.length ? `<div class="alert-banner">⚠️ Товаров ниже минимума: ${lowStock.length}. <a href="#/stock">Смотреть склад</a></div>` : ''}
    <div class="stat-grid">
      ${card('Заказов', report.ordersCount)}
      ${card('Выручка', formatSAR(report.revenue))}
      ${card('Расходы', formatSAR(report.totalExpenses))}
      ${card('Себестоимость', formatSAR(report.totalCost))}
      ${card('Валовая прибыль', formatSAR(report.grossProfit), report.grossProfit >= 0 ? 'stat-positive' : 'stat-negative')}
      ${card('Зарплаты', formatSAR(report.salariesTotal))}
      ${card('Долги', formatSAR(report.totalDebt))}
      ${card('Остаток денег', formatSAR(report.cashBalance), 'stat-highlight')}
      ${card('Остаток склада', formatSAR(report.stockValue))}
    </div>
    <div class="quick-actions">
      <button class="action-btn primary" onclick="navigate('/orders/new')">➕ Новый заказ</button>
      <div class="action-grid">
        <button class="action-btn" onclick="navigate('/cash')">💰 Касса</button>
        <button class="action-btn" onclick="navigate('/expenses')">💸 Расход</button>
        <button class="action-btn" onclick="navigate('/debts')">📒 Долги</button>
        <button class="action-btn" onclick="navigate('/stock')">📦 Склад</button>
        <button class="action-btn" onclick="navigate('/purchases')">🛒 Закупки</button>
        <button class="action-btn" onclick="navigate('/dishes')">🍽️ Блюда</button>
        <button class="action-btn" onclick="navigate('/salaries')">👥 Зарплаты</button>
        <button class="action-btn" onclick="navigate('/reports')">📊 Отчёты</button>
        <button class="action-btn" onclick="navigate('/backup')">🗄️ Backup</button>
      </div>
    </div>
  `;
}

function renderMore() {
  APP.innerHTML = `
    <div class="screen-header"><h1>Ещё</h1></div>
    <div class="list-menu">
      <button class="list-menu-item" onclick="navigate('/purchases')">🛒 Закупки</button>
      <button class="list-menu-item" onclick="navigate('/dishes')">🍽️ Блюда и рецепты</button>
      <button class="list-menu-item" onclick="navigate('/expenses')">💸 Расходы</button>
      <button class="list-menu-item" onclick="navigate('/debts')">📒 Долги</button>
      <button class="list-menu-item" onclick="navigate('/salaries')">👥 Зарплаты</button>
      <button class="list-menu-item" onclick="navigate('/reports')">📊 Отчёты</button>
      <button class="list-menu-item" onclick="navigate('/backup')">🗄️ Backup / Restore</button>
      <button class="list-menu-item" onclick="navigate('/settings')">⚙️ Настройки</button>
    </div>
  `;
}

async function renderSettings() {
  const biz = await db.get('settings', 'business_name');
  APP.innerHTML = `
    <div class="screen-header"><h1>Настройки</h1></div>
    <div class="form-card">
      <label>Название бизнеса</label>
      <input type="text" id="set-biz-name" value="${escapeHtml(biz ? biz.value : 'BISMILLAH BARAKA')}">
      <div class="field-hint">Валюта: SAR (фиксировано). Язык: Русский (фиксировано).</div>
      <button class="btn btn-primary" id="save-settings-btn">Сохранить</button>
    </div>
  `;
  document.getElementById('save-settings-btn').onclick = async () => {
    await db.put('settings', { key: 'business_name', value: document.getElementById('set-biz-name').value });
    toast('Настройки сохранены');
  };
}
