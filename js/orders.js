// orders.js — заказы

let orderCounter = null;
async function nextOrderNumber() {
  const setting = await db.get('settings', 'order_counter');
  const next = (setting ? setting.value : 0) + 1;
  await db.put('settings', { key: 'order_counter', value: next });
  return next;
}

// items: [{dish_id, qty, price_halala}]
async function createOrder(data) {
  const number = await nextOrderNumber();
  let itemsTotal = 0;
  for (const it of data.items) itemsTotal += it.qty * it.price_halala;
  const deliveryFee = toHalala(data.delivery_fee || 0);
  const total = itemsTotal + deliveryFee;

  const order = {
    number,
    date: data.date || todayISO(),
    customer_name: data.customer_name || '',
    phone: data.phone || '',
    delivery_fee: deliveryFee,
    total_amount: total,
    payment_method: data.payment_method || 'Наличные',
    comment: data.comment || '',
    status: data.status || 'Новый',
    paid_amount: 0,
    debt_amount: total,
  };
  const orderId = await db.add('orders', order);

  for (const it of data.items) {
    await db.add('order_items', {
      order_id: orderId,
      dish_id: it.dish_id,
      qty: it.qty,
      price: it.price_halala,
      total: it.qty * it.price_halala,
    });
  }

  return orderId;
}

async function updateOrderStatus(orderId, status) {
  const order = await db.get('orders', orderId);
  const prevStatus = order.status;
  order.status = status;
  await db.put('orders', order);

  // При переходе в "Доставлен" впервые — списать склад по рецептам
  if (status === 'Доставлен' && prevStatus !== 'Доставлен') {
    const items = await db.getByIndex('order_items', 'order_id', orderId);
    for (const it of items) {
      const recipe = await getRecipeForDish(it.dish_id);
      if (recipe) await consumeDishIngredients(it.dish_id, it.qty, orderId);
    }
  }
  return order;
}

async function getOrderWithItems(orderId) {
  const order = await db.get('orders', orderId);
  if (!order) return null;
  const items = await db.getByIndex('order_items', 'order_id', orderId);
  const payments = await db.getByIndex('payments', 'order_id', orderId);
  return { ...order, items, payments };
}

async function getAllOrders() {
  const list = await db.getAll('orders');
  return list.sort((a, b) => new Date(b.date) - new Date(a.date));
}

async function deleteOrder(orderId) {
  const items = await db.getByIndex('order_items', 'order_id', orderId);
  for (const it of items) await db.delete('order_items', it.id);
  const payments = await db.getByIndex('payments', 'order_id', orderId);
  for (const p of payments) await db.delete('payments', p.id);
  return db.delete('orders', orderId);
}

// Себестоимость и прибыль заказа (по всем позициям)
async function getOrderCost(orderId) {
  const items = await db.getByIndex('order_items', 'order_id', orderId);
  let cost = 0;
  for (const it of items) {
    const { cost: dishCost } = await calcDishCost(it.dish_id);
    cost += dishCost * it.qty;
  }
  return cost;
}
