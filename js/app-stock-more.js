// app-stock-more.js — экраны Склад, Закупки, Блюда, Зарплаты, Отчёты, Backup

// ---------- СКЛАД ----------
async function renderStock() {
  const products = await db.getAll('products');
  APP.innerHTML = `
    <div class="screen-header">
      <h1>Склад</h1>
      <button class="btn btn-primary btn-sm" id="stock-add-btn">+ Товар</button>
    </div>
    <div class="list">
      ${products.length === 0 ? '<div class="empty-state">Товаров пока нет</div>' : products.map(p => `
        <div class="list-item" onclick="openProductDetail(${p.id})">
          <div class="list-item-main">
            <div class="list-item-title">${escapeHtml(p.name)} ${p.quantity < p.min_quantity ? '⚠️' : ''}</div>
            <div class="list-item-sub">${escapeHtml(p.category)} · ср. цена ${formatSAR(p.avg_purchase_price)}/${UNITS[p.unit]}</div>
          </div>
          <div class="list-item-amount ${p.quantity < p.min_quantity ? 'amount-negative' : ''}">${p.quantity} ${UNITS[p.unit]}</div>
        </div>
      `).join('')}
    </div>
  `;
  document.getElementById('stock-add-btn').onclick = () => {
    openModal('Новый товар', `
      <label>Название</label>
      <input type="text" id="pr-name">
      <label>Категория</label>
      <input type="text" id="pr-category" placeholder="Например: Крупы">
      <label>Единица измерения</label>
      <select id="pr-unit">${Object.entries(UNITS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select>
      <label>Минимальный остаток</label>
      <input type="number" step="0.001" id="pr-min" value="0">
      <button class="btn btn-primary" id="pr-save">Сохранить</button>
    `);
    document.getElementById('pr-save').onclick = async () => {
      const name = document.getElementById('pr-name').value.trim();
      if (!name) { toast('Введите название'); return; }
      await createProduct({
        name, category: document.getElementById('pr-category').value || 'Другое',
        unit: document.getElementById('pr-unit').value,
        min_quantity: document.getElementById('pr-min').value,
      });
      closeModal();
      toast('Товар добавлен');
      renderStock();
    };
  };
}

async function openProductDetail(id) {
  const product = await db.get('products', id);
  const movements = await getStockMovements(id);
  openModal(product.name, `
    <div class="stat-grid stat-grid-2">
      ${card('Остаток', `${product.quantity} ${UNITS[product.unit]}`)}
      ${card('Мин. остаток', `${product.min_quantity} ${UNITS[product.unit]}`)}
      ${card('Ср. закуп. цена', formatSAR(product.avg_purchase_price))}
      ${card('Последняя закупка', product.last_purchase_date ? formatDate(product.last_purchase_date) : '—')}
    </div>
    <h4 style="margin:12px 0 6px;">Корректировка остатка</h4>
    <div class="inline-row">
      <input type="number" step="0.001" id="adj-qty" placeholder="± количество">
      <button class="btn btn-secondary btn-sm" id="adj-save">OK</button>
    </div>
    <h4 style="margin:16px 0 6px;">История движений</h4>
    <div class="list">
      ${movements.length === 0 ? '<div class="empty-state">Движений нет</div>' : movements.map(m => `
        <div class="list-item">
          <div class="list-item-main">
            <div class="list-item-title">${STOCK_MOVE_TYPES[m.type] || m.type}</div>
            <div class="list-item-sub">${formatDate(m.date)}</div>
          </div>
          <div class="list-item-amount ${m.qty >= 0 ? 'amount-positive' : 'amount-negative'}">${m.qty >= 0 ? '+' : ''}${m.qty} ${UNITS[product.unit]}</div>
        </div>
      `).join('')}
    </div>
    <button class="btn btn-danger btn-outline" id="prod-delete-btn">Удалить товар</button>
  `, { dismissible: true });

  document.getElementById('adj-save').onclick = async () => {
    const delta = roundQty(document.getElementById('adj-qty').value);
    if (!delta) { toast('Введите количество'); return; }
    await recordStockMovement(id, 'adjustment', delta, { comment: 'Ручная корректировка' });
    toast('Остаток скорректирован');
    closeModal();
    renderStock();
  };
  document.getElementById('prod-delete-btn').onclick = async () => {
    if (await confirmDialog('Удалить товар? История движений сохранится отдельно.')) {
      await deleteProduct(id);
      closeModal();
      toast('Товар удалён');
      renderStock();
    }
  };
}

// ---------- ЗАКУПКИ ----------
async function renderPurchases() {
  const purchases = await getAllPurchases();
  const products = await db.getAll('products');
  APP.innerHTML = `
    <div class="screen-header">
      <h1>Закупки</h1>
      <button class="btn btn-primary btn-sm" id="pur-add-btn">+ Закупка</button>
    </div>
    <div class="list">
      ${purchases.length === 0 ? '<div class="empty-state">Закупок пока нет</div>' : purchases.map(p => `
        <div class="list-item">
          <div class="list-item-main">
            <div class="list-item-title">${escapeHtml(p.supplier || 'Без поставщика')}</div>
            <div class="list-item-sub">${formatDate(p.date)}${p.paid ? '' : ' · не оплачено'}</div>
          </div>
          <div class="list-item-amount">${formatSAR(p.total_amount)}</div>
        </div>
      `).join('')}
    </div>
  `;

  document.getElementById('pur-add-btn').onclick = () => {
    if (products.length === 0) { toast('Сначала добавьте товары на склад'); return; }
    openModal('Новая закупка', `
      <label>Поставщик</label>
      <input type="text" id="pu-supplier">
      <label>Товары</label>
      <div id="pu-items"></div>
      <button class="btn btn-secondary btn-sm" id="pu-add-item" type="button">+ Добавить товар</button>
      <label>Способ оплаты</label>
      <select id="pu-method">${PAYMENT_METHODS.map(m => `<option value="${m}">${m}</option>`).join('')}</select>
      <label><input type="checkbox" id="pu-paid" checked> Уже оплачено (отразить в кассе)</label>
      <label>Комментарий</label>
      <input type="text" id="pu-comment">
      <div class="total-row">Итого: <span id="pu-total">0.00 SAR</span></div>
      <button class="btn btn-primary" id="pu-save">Сохранить</button>
    `);

    const container = document.getElementById('pu-items');
    function addRow() {
      const div = document.createElement('div');
      div.className = 'order-item-row';
      div.innerHTML = `
        <select class="pi-product">
          <option value="">— товар —</option>
          ${products.map(p => `<option value="${p.id}" data-unit="${p.unit}">${escapeHtml(p.name)}</option>`).join('')}
        </select>
        <input type="number" step="0.001" class="pi-qty" placeholder="Кол-во" style="width:70px;">
        <input type="number" step="0.01" class="pi-price" placeholder="Цена/ед" style="width:80px;">
        <button type="button" class="oi-remove">✕</button>
      `;
      container.appendChild(div);
      div.querySelectorAll('input').forEach(inp => inp.addEventListener('input', recalcPuTotal));
      div.querySelector('.oi-remove').addEventListener('click', () => { div.remove(); recalcPuTotal(); });
    }
    function recalcPuTotal() {
      let total = 0;
      container.querySelectorAll('.order-item-row').forEach(row => {
        const qty = Number(row.querySelector('.pi-qty').value) || 0;
        const price = toHalala(row.querySelector('.pi-price').value);
        total += qty * price;
      });
      document.getElementById('pu-total').textContent = formatSAR(total);
    }
    document.getElementById('pu-add-item').onclick = addRow;
    addRow();

    document.getElementById('pu-save').onclick = async () => {
      const items = [];
      container.querySelectorAll('.order-item-row').forEach(row => {
        const productId = row.querySelector('.pi-product').value;
        const qty = Number(row.querySelector('.pi-qty').value) || 0;
        const price = toHalala(row.querySelector('.pi-price').value);
        if (productId && qty > 0) items.push({ product_id: Number(productId), qty, unit_price_halala: price });
      });
      if (items.length === 0) { toast('Добавьте хотя бы один товар'); return; }
      await createPurchase({
        supplier: document.getElementById('pu-supplier').value,
        payment_method: document.getElementById('pu-method').value,
        paid: document.getElementById('pu-paid').checked,
        comment: document.getElementById('pu-comment').value,
        items,
      });
      closeModal();
      toast('Закупка сохранена');
      renderPurchases();
    };
  };
}

// ---------- БЛЮДА И РЕЦЕПТЫ ----------
async function renderDishes() {
  const dishes = await db.getAll('dishes');
  APP.innerHTML = `
    <div class="screen-header">
      <h1>Блюда</h1>
      <button class="btn btn-primary btn-sm" id="dish-add-btn">+ Блюдо</button>
    </div>
    <div class="list">
      ${dishes.length === 0 ? '<div class="empty-state">Блюд пока нет</div>' : dishes.map(d => `
        <div class="list-item" onclick="navigate('/dishes/${d.id}')">
          <div class="list-item-main">
            <div class="list-item-title">${escapeHtml(d.name)} ${!d.active ? '(неактивно)' : ''}</div>
            <div class="list-item-sub">${escapeHtml(d.category)}</div>
          </div>
          <div class="list-item-amount">${formatSAR(d.price)}</div>
        </div>
      `).join('')}
    </div>
  `;
  document.getElementById('dish-add-btn').onclick = () => {
    openModal('Новое блюдо', `
      <label>Название</label>
      <input type="text" id="dh-name">
      <label>Категория</label>
      <input type="text" id="dh-category" placeholder="Например: Плов">
      <label>Цена продажи (SAR)</label>
      <input type="number" step="0.01" id="dh-price">
      <label>Описание</label>
      <input type="text" id="dh-desc">
      <button class="btn btn-primary" id="dh-save">Сохранить</button>
    `);
    document.getElementById('dh-save').onclick = async () => {
      const name = document.getElementById('dh-name').value.trim();
      if (!name) { toast('Введите название'); return; }
      const id = await createDish({
        name, category: document.getElementById('dh-category').value || 'Другое',
        price: document.getElementById('dh-price').value,
        description: document.getElementById('dh-desc').value,
      });
      closeModal();
      toast('Блюдо добавлено');
      navigate('/dishes/' + id);
    };
  };
}

async function renderDishDetail(id) {
  const dish = await db.get('dishes', id);
  if (!dish) { navigate('/dishes'); return; }
  const products = await db.getAll('products');
  const recipeItems = await getRecipeItems(id);
  const { cost, breakdown } = await calcDishCost(id);
  const margin = await getDishMargin(id);

  APP.innerHTML = `
    <div class="screen-header">
      <button class="back-btn" onclick="navigate('/dishes')">‹ Блюда</button>
      <h1>${escapeHtml(dish.name)}</h1>
    </div>
    <div class="detail-card">
      <div class="detail-row"><span>Категория</span><b>${escapeHtml(dish.category)}</b></div>
      <div class="detail-row"><span>Цена продажи</span><b>${formatSAR(dish.price)}</b></div>
      <div class="detail-row"><span>Активно</span>
        <input type="checkbox" id="dish-active" ${dish.active ? 'checked' : ''}>
      </div>
    </div>
    <div class="stat-grid stat-grid-2">
      ${card('Себестоимость', formatSAR(margin.cost))}
      ${card('Прибыль', formatSAR(margin.profit), margin.profit >= 0 ? 'stat-positive' : 'stat-negative')}
      ${card('Маржа', margin.margin + '%')}
    </div>

    <h3 class="section-title">Рецепт (ингредиенты)</h3>
    <div id="recipe-rows">
      ${recipeItems.map(ri => recipeRowHtml(ri, products)).join('')}
    </div>
    <button class="btn btn-secondary btn-sm" id="recipe-add-row" type="button">+ Ингредиент</button>
    <button class="btn btn-primary" id="recipe-save-btn">Сохранить рецепт</button>

    <h3 class="section-title">Расчёт себестоимости</h3>
    <div class="list">
      ${breakdown.length === 0 ? '<div class="empty-state">Рецепт пуст</div>' : breakdown.map(b => `
        <div class="list-item"><div class="list-item-main"><div class="list-item-title">${escapeHtml(b.name)}</div><div class="list-item-sub">${b.qty} ${UNITS[b.unit] || ''}</div></div><div class="list-item-amount">${formatSAR(b.cost)}</div></div>
      `).join('')}
    </div>

    <button class="btn btn-danger btn-outline" id="dish-delete-btn">Удалить блюдо</button>
  `;

  const recipeContainer = document.getElementById('recipe-rows');
  function addRecipeRow(productId, qty) {
    const div = document.createElement('div');
    div.className = 'order-item-row';
    div.innerHTML = `
      <select class="ri-product">
        <option value="">— товар —</option>
        ${products.map(p => `<option value="${p.id}" ${String(p.id) === String(productId) ? 'selected' : ''}>${escapeHtml(p.name)} (${UNITS[p.unit]})</option>`).join('')}
      </select>
      <input type="number" step="0.001" class="ri-qty" placeholder="Кол-во" value="${qty || ''}" style="width:80px;">
      <button type="button" class="oi-remove">✕</button>
    `;
    recipeContainer.appendChild(div);
    div.querySelector('.oi-remove').addEventListener('click', () => div.remove());
  }
  document.getElementById('recipe-add-row').onclick = () => addRecipeRow();

  document.getElementById('recipe-save-btn').onclick = async () => {
    const items = [];
    recipeContainer.querySelectorAll('.order-item-row').forEach(row => {
      const productId = row.querySelector('.ri-product').value;
      const qty = Number(row.querySelector('.ri-qty').value) || 0;
      if (productId && qty > 0) items.push({ product_id: Number(productId), qty });
    });
    await saveRecipe(id, items);
    await updateDish(id, { active: document.getElementById('dish-active').checked });
    toast('Рецепт сохранён');
    renderDishDetail(id);
  };

  document.getElementById('dish-delete-btn').onclick = async () => {
    if (await confirmDialog('Удалить блюдо и его рецепт?')) {
      await deleteDish(id);
      toast('Блюдо удалено');
      navigate('/dishes');
    }
  };
}

function recipeRowHtml(ri, products) {
  return `<div class="order-item-row">
    <select class="ri-product">
      <option value="">— товар —</option>
      ${products.map(p => `<option value="${p.id}" ${p.id === ri.product_id ? 'selected' : ''}>${escapeHtml(p.name)} (${UNITS[p.unit]})</option>`).join('')}
    </select>
    <input type="number" step="0.001" class="ri-qty" value="${ri.qty}" style="width:80px;">
    <button type="button" class="oi-remove" onclick="this.parentElement.remove()">✕</button>
  </div>`;
}

// ---------- ЗАРПЛАТЫ ----------
async function renderSalaries() {
  const employees = await getAllEmployees();
  APP.innerHTML = `
    <div class="screen-header">
      <h1>Зарплаты</h1>
      <button class="btn btn-primary btn-sm" id="emp-add-btn">+ Работник</button>
    </div>
    <div class="list">
      ${employees.length === 0 ? '<div class="empty-state">Работников пока нет</div>' : employees.map(e => `
        <div class="list-item" onclick="navigate('/salaries/${e.id}')">
          <div class="list-item-main">
            <div class="list-item-title">${escapeHtml(e.name)}</div>
            <div class="list-item-sub">${escapeHtml(e.position || '—')}</div>
          </div>
          <div class="list-item-right">
            <div class="list-item-amount">${formatSAR(e.remaining)}</div>
            <div class="list-item-sub">из ${formatSAR(e.salary)}</div>
          </div>
        </div>
      `).join('')}
    </div>
  `;
  document.getElementById('emp-add-btn').onclick = () => {
    openModal('Новый работник', `
      <label>Имя</label>
      <input type="text" id="emp-name">
      <label>Должность</label>
      <input type="text" id="emp-position">
      <label>Зарплата (SAR)</label>
      <input type="number" step="0.01" id="emp-salary">
      <button class="btn btn-primary" id="emp-save">Сохранить</button>
    `);
    document.getElementById('emp-save').onclick = async () => {
      const name = document.getElementById('emp-name').value.trim();
      if (!name) { toast('Введите имя'); return; }
      await createEmployee({
        name, position: document.getElementById('emp-position').value,
        salary: document.getElementById('emp-salary').value,
      });
      closeModal();
      toast('Работник добавлен');
      renderSalaries();
    };
  };
}

async function renderSalaryDetail(id) {
  const emp = await getEmployeeWithPayments(id);
  if (!emp) { navigate('/salaries'); return; }
  APP.innerHTML = `
    <div class="screen-header">
      <button class="back-btn" onclick="navigate('/salaries')">‹ Зарплаты</button>
      <h1>${escapeHtml(emp.name)}</h1>
    </div>
    <div class="detail-card">
      <div class="detail-row"><span>Должность</span><b>${escapeHtml(emp.position || '—')}</b></div>
    </div>
    <div class="stat-grid stat-grid-3">
      ${card('Зарплата', formatSAR(emp.salary))}
      ${card('Выплачено', formatSAR(emp.paid_amount))}
      ${card('Остаток', formatSAR(emp.remaining))}
    </div>
    <h3 class="section-title">История выплат</h3>
    <div class="list">
      ${emp.payments.length === 0 ? '<div class="empty-state">Выплат ещё не было</div>' : emp.payments.map(p => `
        <div class="list-item"><div class="list-item-main"><div class="list-item-title">${p.type === 'advance' ? 'Аванс' : 'Выплата'}</div><div class="list-item-sub">${formatDate(p.date)}</div></div><div class="list-item-amount">${formatSAR(p.amount)}</div></div>
      `).join('')}
    </div>
    <button class="btn btn-primary" id="emp-pay-btn">+ Выплата / Аванс</button>
    <button class="btn btn-secondary btn-outline" id="emp-reset-btn">Начать новый месяц</button>
    <button class="btn btn-danger btn-outline" id="emp-delete-btn">Удалить работника</button>
  `;
  document.getElementById('emp-pay-btn').onclick = () => {
    openModal('Выплата', `
      <label>Тип</label>
      <select id="ep-type"><option value="payment">Выплата</option><option value="advance">Аванс</option></select>
      <label>Сумма (SAR)</label>
      <input type="number" step="0.01" id="ep-amount" value="${fromHalala(emp.remaining)}">
      <label>Комментарий</label>
      <input type="text" id="ep-comment">
      <button class="btn btn-primary" id="ep-save">Сохранить</button>
    `);
    document.getElementById('ep-save').onclick = async () => {
      const amount = toHalala(document.getElementById('ep-amount').value);
      if (amount <= 0) { toast('Введите сумму'); return; }
      await paySalary(id, amount, document.getElementById('ep-type').value, document.getElementById('ep-comment').value);
      closeModal();
      toast('Выплата сохранена');
      renderSalaryDetail(id);
    };
  };
  document.getElementById('emp-reset-btn').onclick = async () => {
    if (await confirmDialog('Обнулить выплаты и начать новый расчётный месяц?')) {
      await resetMonthlySalary(id);
      toast('Новый месяц начат');
      renderSalaryDetail(id);
    }
  };
  document.getElementById('emp-delete-btn').onclick = async () => {
    if (await confirmDialog('Удалить работника?')) {
      await deleteEmployee(id);
      toast('Удалено');
      navigate('/salaries');
    }
  };
}

// ---------- ОТЧЁТЫ ----------
let currentReportPeriod = 'today';

async function renderReports() {
  await renderReportsBody();
}

async function renderReportsBody() {
  const summary = await buildSummaryReport(currentReportPeriod);
  const dishReport = await buildDishReport(currentReportPeriod);
  const expenseReport = await buildExpenseReport(currentReportPeriod);

  APP.innerHTML = `
    <div class="screen-header"><h1>Отчёты</h1></div>
    <div class="period-tabs">
      ${['today', 'yesterday', 'week', 'month'].map(p => `
        <button class="period-tab ${p === currentReportPeriod ? 'active' : ''}" data-period="${p}">${periodLabel(p)}</button>
      `).join('')}
    </div>
    <div class="stat-grid">
      ${card('Заказов', summary.ordersCount)}
      ${card('Выручка', formatSAR(summary.revenue))}
      ${card('Оплачено', formatSAR(summary.paid))}
      ${card('Долги', formatSAR(summary.totalDebt))}
      ${card('Расходы', formatSAR(summary.totalExpenses))}
      ${card('Закупки', formatSAR(summary.totalPurchases))}
      ${card('Себестоимость', formatSAR(summary.totalCost))}
      ${card('Валовая прибыль', formatSAR(summary.grossProfit))}
      ${card('Зарплаты', formatSAR(summary.salariesTotal))}
      ${card('Чистый результат', formatSAR(summary.netResult), summary.netResult >= 0 ? 'stat-positive' : 'stat-negative')}
      ${card('Остаток денег', formatSAR(summary.cashBalance))}
      ${card('Остаток склада', formatSAR(summary.stockValue))}
    </div>

    <h3 class="section-title">По блюдам</h3>
    <div class="list">
      ${dishReport.length === 0 ? '<div class="empty-state">Нет данных за период</div>' : dishReport.map(d => `
        <div class="list-item">
          <div class="list-item-main">
            <div class="list-item-title">${escapeHtml(d.dish.name)}</div>
            <div class="list-item-sub">Продано: ${d.sold} · Прибыль: ${formatSAR(d.profit)} (${d.margin}%)</div>
          </div>
          <div class="list-item-amount">${formatSAR(d.revenue)}</div>
        </div>
      `).join('')}
    </div>

    <h3 class="section-title">По расходам</h3>
    <div class="list">
      ${Object.keys(expenseReport.byCategory).length === 0 ? '<div class="empty-state">Нет данных за период</div>' : Object.entries(expenseReport.byCategory).map(([cat, amount]) => `
        <div class="list-item"><div class="list-item-main"><div class="list-item-title">${escapeHtml(cat)}</div></div><div class="list-item-amount">${formatSAR(amount)}</div></div>
      `).join('')}
      <div class="list-item"><div class="list-item-main"><div class="list-item-title"><b>Итого</b></div></div><div class="list-item-amount"><b>${formatSAR(expenseReport.total)}</b></div></div>
    </div>
  `;

  document.querySelectorAll('.period-tab').forEach(btn => {
    btn.onclick = () => { currentReportPeriod = btn.dataset.period; renderReportsBody(); };
  });
}

function periodLabel(p) {
  return { today: 'Сегодня', yesterday: 'Вчера', week: 'Неделя', month: 'Месяц' }[p] || p;
}

// ---------- BACKUP ----------
async function renderBackup() {
  APP.innerHTML = `
    <div class="screen-header"><h1>Backup</h1></div>
    <div class="form-card">
      <p>Резервная копия сохраняет все данные приложения (заказы, кассу, склад, блюда, зарплаты) в один JSON-файл.</p>
      <button class="btn btn-primary" id="backup-create-btn">📤 Создать резервную копию</button>
    </div>
    <div class="form-card">
      <p>Восстановление <b>полностью заменит</b> текущие данные приложения данными из выбранного файла.</p>
      <input type="file" id="backup-file-input" accept="application/json" style="margin-bottom:12px;">
      <button class="btn btn-danger" id="backup-restore-btn">📥 Восстановить из файла</button>
    </div>
  `;
  document.getElementById('backup-create-btn').onclick = async () => {
    await createBackup();
    toast('Резервная копия создана');
  };
  document.getElementById('backup-restore-btn').onclick = async () => {
    const input = document.getElementById('backup-file-input');
    if (!input.files.length) { toast('Выберите файл'); return; }
    const ok = await confirmDialog('Все текущие данные будут заменены данными из backup. Продолжить?');
    if (!ok) return;
    try {
      await restoreBackup(input.files[0]);
      toast('Данные восстановлены');
      navigate('/dashboard');
    } catch (err) {
      toast('Ошибка: ' + err.message);
    }
  };
}
