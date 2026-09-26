// app-orders-money.js — экраны Заказы, Касса, Расходы, Долги

// ---------- ЗАКАЗЫ ----------
async function renderOrdersList() {
  const orders = await getAllOrders();
  APP.innerHTML = `
    <div class="screen-header">
      <h1>Заказы</h1>
      <button class="btn btn-primary btn-sm" onclick="navigate('/orders/new')">+ Новый</button>
    </div>
    <div class="list">
      ${orders.length === 0 ? '<div class="empty-state">Пока нет заказов</div>' : orders.map(o => `
        <div class="list-item" onclick="navigate('/orders/${o.id}')">
          <div class="list-item-main">
            <div class="list-item-title">№${o.number} — ${escapeHtml(o.customer_name || 'Без имени')}</div>
            <div class="list-item-sub">${formatDate(o.date)}</div>
          </div>
          <div class="list-item-right">
            <div class="list-item-amount">${formatSAR(o.total_amount)}</div>
            <span class="badge ${statusBadgeClass(o.status)}">${o.status}</span>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

async function renderOrderForm() {
  const dishes = (await db.getAll('dishes')).filter(d => d.active);
  APP.innerHTML = `
    <div class="screen-header"><h1>Новый заказ</h1></div>
    <div class="form-card">
      <label>Имя клиента</label>
      <input type="text" id="of-name" placeholder="Имя">
      <label>Телефон</label>
      <input type="tel" id="of-phone" placeholder="+966...">
      <label>Способ оплаты</label>
      <select id="of-payment">${PAYMENT_METHODS.map(m => `<option value="${m}">${m}</option>`).join('')}</select>
      <label>Статус</label>
      <select id="of-status">${ORDER_STATUSES.map(s => `<option value="${s}">${s}</option>`).join('')}</select>

      <label>Блюда</label>
      <div id="of-items"></div>
      <button class="btn btn-secondary btn-sm" id="of-add-item" type="button">+ Добавить блюдо</button>

      <label>Стоимость доставки (SAR)</label>
      <input type="number" step="0.01" id="of-delivery" value="0">
      <label>Комментарий</label>
      <textarea id="of-comment" placeholder="Комментарий к заказу"></textarea>

      <div class="total-row">Итого: <span id="of-total">0.00 SAR</span></div>
      <button class="btn btn-primary" id="of-save">Сохранить заказ</button>
    </div>
  `;

  const itemsContainer = document.getElementById('of-items');
  const rows = [];

  function addItemRow() {
    const rowId = uid();
    rows.push(rowId);
    const div = document.createElement('div');
    div.className = 'order-item-row';
    div.dataset.rowId = rowId;
    div.innerHTML = `
      <select class="oi-dish">
        <option value="">— выбрать блюдо —</option>
        ${dishes.map(d => `<option value="${d.id}" data-price="${d.price}">${escapeHtml(d.name)} (${formatSAR(d.price)})</option>`).join('')}
      </select>
      <input type="number" class="oi-qty" min="1" value="1" style="width:64px;">
      <button type="button" class="oi-remove">✕</button>
    `;
    itemsContainer.appendChild(div);
    div.querySelector('.oi-dish').addEventListener('change', recalcTotal);
    div.querySelector('.oi-qty').addEventListener('input', recalcTotal);
    div.querySelector('.oi-remove').addEventListener('click', () => { div.remove(); recalcTotal(); });
  }

  function recalcTotal() {
    let total = 0;
    itemsContainer.querySelectorAll('.order-item-row').forEach(row => {
      const sel = row.querySelector('.oi-dish');
      const qty = Number(row.querySelector('.oi-qty').value) || 0;
      const price = Number(sel.selectedOptions[0]?.dataset.price || 0);
      total += price * qty;
    });
    const delivery = toHalala(document.getElementById('of-delivery').value);
    total += delivery;
    document.getElementById('of-total').textContent = formatSAR(total);
  }

  document.getElementById('of-add-item').onclick = addItemRow;
  document.getElementById('of-delivery').addEventListener('input', recalcTotal);
  addItemRow();

  document.getElementById('of-save').onclick = async () => {
    const items = [];
    itemsContainer.querySelectorAll('.order-item-row').forEach(row => {
      const sel = row.querySelector('.oi-dish');
      const qty = Number(row.querySelector('.oi-qty').value) || 0;
      if (sel.value && qty > 0) {
        items.push({ dish_id: Number(sel.value), qty, price_halala: Number(sel.selectedOptions[0].dataset.price) });
      }
    });
    if (items.length === 0) { toast('Добавьте хотя бы одно блюдо'); return; }

    const orderId = await createOrder({
      customer_name: document.getElementById('of-name').value,
      phone: document.getElementById('of-phone').value,
      payment_method: document.getElementById('of-payment').value,
      status: document.getElementById('of-status').value,
      delivery_fee: document.getElementById('of-delivery').value,
      comment: document.getElementById('of-comment').value,
      items,
    });
    toast('Заказ создан');
    navigate('/orders/' + orderId);
  };
}

async function renderOrderDetail(id) {
  const order = await getOrderWithItems(id);
  if (!order) { navigate('/orders'); return; }
  const dishItems = await Promise.all(order.items.map(async it => {
    const dish = await db.get('dishes', it.dish_id);
    return { ...it, dishName: dish ? dish.name : '—' };
  }));
  const cost = await getOrderCost(id);
  const profit = order.total_amount - cost;

  APP.innerHTML = `
    <div class="screen-header">
      <button class="back-btn" onclick="navigate('/orders')">‹ Заказы</button>
      <h1>Заказ №${order.number}</h1>
    </div>
    <div class="detail-card">
      <div class="detail-row"><span>Клиент</span><b>${escapeHtml(order.customer_name || '—')}</b></div>
      <div class="detail-row"><span>Телефон</span><b>${escapeHtml(order.phone || '—')}</b></div>
      <div class="detail-row"><span>Дата</span><b>${formatDate(order.date)}</b></div>
      <div class="detail-row"><span>Статус</span>
        <select id="od-status">${ORDER_STATUSES.map(s => `<option value="${s}" ${s === order.status ? 'selected' : ''}>${s}</option>`).join('')}</select>
      </div>
      <div class="detail-row"><span>Оплата</span><b>${escapeHtml(order.payment_method)}</b></div>
      ${order.comment ? `<div class="detail-row"><span>Комментарий</span><b>${escapeHtml(order.comment)}</b></div>` : ''}
    </div>

    <h3 class="section-title">Позиции</h3>
    <div class="list">
      ${dishItems.map(it => `
        <div class="list-item">
          <div class="list-item-main"><div class="list-item-title">${escapeHtml(it.dishName)} × ${it.qty}</div></div>
          <div class="list-item-amount">${formatSAR(it.total)}</div>
        </div>`).join('')}
      ${order.delivery_fee ? `<div class="list-item"><div class="list-item-title">Доставка</div><div class="list-item-amount">${formatSAR(order.delivery_fee)}</div></div>` : ''}
    </div>

    <div class="stat-grid">
      ${card('Итого', formatSAR(order.total_amount))}
      ${card('Оплачено', formatSAR(order.paid_amount))}
      ${card('Долг', formatSAR(order.debt_amount), order.debt_amount > 0 ? 'stat-negative' : '')}
      ${card('Себестоимость', formatSAR(cost))}
      ${card('Прибыль', formatSAR(profit), profit >= 0 ? 'stat-positive' : 'stat-negative')}
    </div>

    <h3 class="section-title">Оплаты</h3>
    <div class="list">
      ${order.payments.length === 0 ? '<div class="empty-state">Оплат ещё не было</div>' : order.payments.map(p => `
        <div class="list-item"><div class="list-item-main"><div class="list-item-title">${escapeHtml(p.payment_method)}</div><div class="list-item-sub">${formatDate(p.date)}</div></div><div class="list-item-amount">${formatSAR(p.amount)}</div></div>
      `).join('')}
    </div>
    ${order.debt_amount > 0 ? `<button class="btn btn-primary" id="od-add-payment">+ Добавить оплату</button>` : ''}
    <button class="btn btn-danger btn-outline" id="od-delete">Удалить заказ</button>
  `;

  document.getElementById('od-status').onchange = async (e) => {
    await updateOrderStatus(id, e.target.value);
    toast('Статус обновлён');
    renderOrderDetail(id);
  };

  const payBtn = document.getElementById('od-add-payment');
  if (payBtn) payBtn.onclick = () => openPaymentModal(order);

  document.getElementById('od-delete').onclick = async () => {
    if (await confirmDialog('Удалить заказ безвозвратно?')) {
      await deleteOrder(id);
      toast('Заказ удалён');
      navigate('/orders');
    }
  };
}

function openPaymentModal(order) {
  openModal('Добавить оплату', `
    <label>Сумма (SAR)</label>
    <input type="number" step="0.01" id="pm-amount" value="${fromHalala(order.debt_amount)}">
    <label>Способ оплаты</label>
    <select id="pm-method">${PAYMENT_METHODS.map(m => `<option value="${m}">${m}</option>`).join('')}</select>
    <label>Комментарий</label>
    <input type="text" id="pm-comment">
    <button class="btn btn-primary" id="pm-save">Сохранить</button>
  `);
  document.getElementById('pm-save').onclick = async () => {
    const amount = toHalala(document.getElementById('pm-amount').value);
    if (amount <= 0) { toast('Введите сумму'); return; }
    await addOrderPayment(order.id, amount, document.getElementById('pm-method').value, document.getElementById('pm-comment').value);
    closeModal();
    toast('Оплата добавлена');
    renderOrderDetail(order.id);
  };
}

// ---------- КАССА ----------
async function renderCash() {
  const movements = await getAllCashMovements();
  const balance = await getCashBalance();
  APP.innerHTML = `
    <div class="screen-header">
      <h1>Касса</h1>
      <button class="btn btn-primary btn-sm" id="cash-add-btn">+ Движение</button>
    </div>
    <div class="stat-grid stat-grid-2">
      ${card('Остаток', formatSAR(balance), 'stat-highlight')}
      ${card('Движений', movements.length)}
    </div>
    <div class="list">
      ${movements.length === 0 ? '<div class="empty-state">Движений пока нет</div>' : movements.map(m => `
        <div class="list-item">
          <div class="list-item-main">
            <div class="list-item-title">${escapeHtml(m.category)}${m.description ? ' — ' + escapeHtml(m.description) : ''}</div>
            <div class="list-item-sub">${formatDate(m.date)} · ${escapeHtml(m.payment_method)}</div>
          </div>
          <div class="list-item-amount ${m.type === 'income' ? 'amount-positive' : 'amount-negative'}">
            ${m.type === 'income' ? '+' : '−'}${formatSAR(m.amount)}
          </div>
        </div>
      `).join('')}
    </div>
  `;
  document.getElementById('cash-add-btn').onclick = () => {
    openModal('Новое движение', `
      <label>Тип</label>
      <select id="cm-type"><option value="income">Приход</option><option value="expense">Расход</option></select>
      <label>Сумма (SAR)</label>
      <input type="number" step="0.01" id="cm-amount">
      <label>Категория</label>
      <input type="text" id="cm-category" placeholder="Например: Продажи">
      <label>Описание</label>
      <input type="text" id="cm-desc">
      <label>Способ оплаты</label>
      <select id="cm-method">${PAYMENT_METHODS.map(m => `<option value="${m}">${m}</option>`).join('')}</select>
      <button class="btn btn-primary" id="cm-save">Сохранить</button>
    `);
    document.getElementById('cm-save').onclick = async () => {
      const amount = document.getElementById('cm-amount').value;
      if (toHalala(amount) <= 0) { toast('Введите сумму'); return; }
      await addManualCashMovement({
        type: document.getElementById('cm-type').value,
        amount,
        category: document.getElementById('cm-category').value || 'Другое',
        description: document.getElementById('cm-desc').value,
        payment_method: document.getElementById('cm-method').value,
      });
      closeModal();
      toast('Движение добавлено');
      renderCash();
    };
  };
}

// ---------- РАСХОДЫ ----------
async function renderExpenses() {
  const expenses = await getAllExpenses();
  const categories = await getExpenseCategories();
  APP.innerHTML = `
    <div class="screen-header">
      <h1>Расходы</h1>
      <button class="btn btn-primary btn-sm" id="exp-add-btn">+ Расход</button>
    </div>
    <div class="list">
      ${expenses.length === 0 ? '<div class="empty-state">Расходов пока нет</div>' : expenses.map(e => `
        <div class="list-item">
          <div class="list-item-main">
            <div class="list-item-title">${escapeHtml(e.category)}</div>
            <div class="list-item-sub">${formatDate(e.date)}${e.description ? ' · ' + escapeHtml(e.description) : ''}</div>
          </div>
          <div class="list-item-right">
            <div class="list-item-amount amount-negative">−${formatSAR(e.amount)}</div>
            <button class="icon-btn" onclick="deleteExpenseAndRefresh(${e.id})">🗑</button>
          </div>
        </div>
      `).join('')}
    </div>
  `;
  document.getElementById('exp-add-btn').onclick = () => {
    openModal('Новый расход', `
      <label>Категория</label>
      <select id="exp-category">${categories.map(c => `<option value="${c}">${c}</option>`).join('')}</select>
      <label>Сумма (SAR)</label>
      <input type="number" step="0.01" id="exp-amount">
      <label>Способ оплаты</label>
      <select id="exp-method">${PAYMENT_METHODS.map(m => `<option value="${m}">${m}</option>`).join('')}</select>
      <label>Описание</label>
      <input type="text" id="exp-desc">
      <label>Комментарий</label>
      <input type="text" id="exp-comment">
      <button class="btn btn-primary" id="exp-save">Сохранить</button>
    `);
    document.getElementById('exp-save').onclick = async () => {
      const amount = document.getElementById('exp-amount').value;
      if (toHalala(amount) <= 0) { toast('Введите сумму'); return; }
      await createExpense({
        category: document.getElementById('exp-category').value,
        amount,
        payment_method: document.getElementById('exp-method').value,
        description: document.getElementById('exp-desc').value,
        comment: document.getElementById('exp-comment').value,
      });
      closeModal();
      toast('Расход добавлен');
      renderExpenses();
    };
  };
}

async function deleteExpenseAndRefresh(id) {
  if (await confirmDialog('Удалить расход?')) {
    await deleteExpense(id);
    toast('Удалено');
    renderExpenses();
  }
}

// ---------- ДОЛГИ ----------
async function renderDebts() {
  const debts = await getAllDebts();
  APP.innerHTML = `
    <div class="screen-header">
      <h1>Долги</h1>
      <button class="btn btn-primary btn-sm" id="debt-add-btn">+ Долг</button>
    </div>
    <div class="list">
      ${debts.length === 0 ? '<div class="empty-state">Долгов пока нет</div>' : debts.map(d => `
        <div class="list-item" onclick="navigate('/debts/${d.id}')">
          <div class="list-item-main">
            <div class="list-item-title">${escapeHtml(d.name)}</div>
            <div class="list-item-sub">${DEBT_TYPES[d.type]}</div>
          </div>
          <div class="list-item-right">
            <div class="list-item-amount">${formatSAR(d.remaining)}</div>
            <span class="badge ${d.status === 'Погашен' ? 'badge-green' : d.status === 'Частично погашен' ? 'badge-orange' : 'badge-red'}">${d.status}</span>
          </div>
        </div>
      `).join('')}
    </div>
  `;
  document.getElementById('debt-add-btn').onclick = () => {
    openModal('Новый долг', `
      <label>Тип</label>
      <select id="debt-type">
        <option value="client">${DEBT_TYPES.client}</option>
        <option value="business">${DEBT_TYPES.business}</option>
      </select>
      <label>Имя</label>
      <input type="text" id="debt-name">
      <label>Телефон</label>
      <input type="tel" id="debt-phone">
      <label>Сумма (SAR)</label>
      <input type="number" step="0.01" id="debt-amount">
      <label>Описание</label>
      <input type="text" id="debt-desc">
      <button class="btn btn-primary" id="debt-save">Сохранить</button>
    `);
    document.getElementById('debt-save').onclick = async () => {
      const amount = document.getElementById('debt-amount').value;
      if (toHalala(amount) <= 0) { toast('Введите сумму'); return; }
      await createDebt({
        type: document.getElementById('debt-type').value,
        name: document.getElementById('debt-name').value,
        phone: document.getElementById('debt-phone').value,
        initial_amount: amount,
        description: document.getElementById('debt-desc').value,
      });
      closeModal();
      toast('Долг добавлен');
      renderDebts();
    };
  };
}

async function renderDebtDetail(id) {
  const debt = await getDebtWithPayments(id);
  if (!debt) { navigate('/debts'); return; }
  APP.innerHTML = `
    <div class="screen-header">
      <button class="back-btn" onclick="navigate('/debts')">‹ Долги</button>
      <h1>${escapeHtml(debt.name)}</h1>
    </div>
    <div class="detail-card">
      <div class="detail-row"><span>Тип</span><b>${DEBT_TYPES[debt.type]}</b></div>
      <div class="detail-row"><span>Телефон</span><b>${escapeHtml(debt.phone || '—')}</b></div>
      <div class="detail-row"><span>Описание</span><b>${escapeHtml(debt.description || '—')}</b></div>
      <div class="detail-row"><span>Статус</span><span class="badge ${debt.status === 'Погашен' ? 'badge-green' : debt.status === 'Частично погашен' ? 'badge-orange' : 'badge-red'}">${debt.status}</span></div>
    </div>
    <div class="stat-grid stat-grid-3">
      ${card('Сумма', formatSAR(debt.initial_amount))}
      ${card('Оплачено', formatSAR(debt.paid_amount))}
      ${card('Остаток', formatSAR(debt.remaining))}
    </div>
    <h3 class="section-title">История погашений</h3>
    <div class="list">
      ${debt.payments.length === 0 ? '<div class="empty-state">Погашений ещё не было</div>' : debt.payments.map(p => `
        <div class="list-item"><div class="list-item-main"><div class="list-item-sub">${formatDate(p.date)}</div></div><div class="list-item-amount">${formatSAR(p.amount)}</div></div>
      `).join('')}
    </div>
    ${debt.remaining > 0 ? `<button class="btn btn-primary" id="debt-pay-btn">+ Внести погашение</button>` : ''}
    <button class="btn btn-danger btn-outline" id="debt-delete-btn">Удалить долг</button>
  `;
  const payBtn = document.getElementById('debt-pay-btn');
  if (payBtn) payBtn.onclick = () => {
    openModal('Погашение долга', `
      <label>Сумма (SAR)</label>
      <input type="number" step="0.01" id="dp-amount" value="${fromHalala(debt.remaining)}">
      <label>Комментарий</label>
      <input type="text" id="dp-comment">
      <button class="btn btn-primary" id="dp-save">Сохранить</button>
    `);
    document.getElementById('dp-save').onclick = async () => {
      const amount = toHalala(document.getElementById('dp-amount').value);
      if (amount <= 0) { toast('Введите сумму'); return; }
      await addDebtPayment(id, amount, document.getElementById('dp-comment').value);
      closeModal();
      toast('Погашение внесено');
      renderDebtDetail(id);
    };
  };
  document.getElementById('debt-delete-btn').onclick = async () => {
    if (await confirmDialog('Удалить долг безвозвратно?')) {
      await deleteDebt(id);
      toast('Удалено');
      navigate('/debts');
    }
  };
}
