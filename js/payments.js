// payments.js — оплаты заказов и движения кассы

async function addOrderPayment(orderId, amountHalala, method, comment) {
  const order = await db.get('orders', orderId);
  if (!order) throw new Error('Заказ не найден');

  await db.add('payments', {
    order_id: orderId,
    amount: amountHalala,
    payment_method: method || 'Наличные',
    comment: comment || '',
    date: todayISO(),
  });

  order.paid_amount = (order.paid_amount || 0) + amountHalala;
  order.debt_amount = Math.max(0, order.total_amount - order.paid_amount);
  await db.put('orders', order);

  await db.add('cash_movements', {
    type: 'income',
    amount: amountHalala,
    category: 'Продажи',
    description: `Оплата заказа №${order.number}`,
    payment_method: method || 'Наличные',
    reference: { kind: 'order', id: orderId },
    date: todayISO(),
  });

  return order;
}

async function addManualCashMovement({ type, amount, category, description, payment_method, date }) {
  return db.add('cash_movements', {
    type, // income | expense
    amount: toHalala(amount),
    category: category || 'Другое',
    description: description || '',
    payment_method: payment_method || 'Наличные',
    reference: null,
    date: date || todayISO(),
  });
}

async function getAllCashMovements() {
  const list = await db.getAll('cash_movements');
  return list.sort((a, b) => new Date(b.date) - new Date(a.date));
}

async function getCashBalance() {
  const list = await db.getAll('cash_movements');
  let balance = 0;
  for (const m of list) balance += m.type === 'income' ? m.amount : -m.amount;
  return balance;
}

async function deleteCashMovement(id) {
  return db.delete('cash_movements', id);
}
