// reports.js — сводные отчёты

async function buildSummaryReport(period, customFrom, customTo) {
  const { from, to } = periodRange(period, customFrom, customTo);

  const orders = (await db.getAll('orders')).filter(o => inRange(o.date, from, to));
  const expenses = (await db.getAll('expenses')).filter(e => inRange(e.date, from, to));
  const purchases = (await db.getAll('purchases')).filter(p => inRange(p.date, from, to));
  const cashMovements = (await db.getAll('cash_movements')).filter(c => inRange(c.date, from, to));
  const debts = await db.getAll('debts');
  const salaryPayments = (await db.getAll('salary_payments')).filter(s => inRange(s.date, from, to));

  const ordersCount = orders.filter(o => o.status !== 'Отменён').length;
  const revenue = orders.filter(o => o.status !== 'Отменён').reduce((s, o) => s + o.total_amount, 0);
  const paid = cashMovements.filter(c => c.type === 'income' && c.category === 'Продажи').reduce((s, c) => s + c.amount, 0);
  const totalDebt = debts.reduce((s, d) => s + d.remaining, 0);
  const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0);
  const totalPurchases = purchases.reduce((s, p) => s + p.total_amount, 0);

  let totalCost = 0;
  for (const o of orders) {
    if (o.status === 'Отменён') continue;
    totalCost += await getOrderCost(o.id);
  }
  const grossProfit = revenue - totalCost;
  const salariesTotal = salaryPayments.reduce((s, p) => s + p.amount, 0);
  const netResult = grossProfit - totalExpenses - salariesTotal;
  const cashBalance = await getCashBalance();
  const stockValue = await getTotalStockValue();

  return {
    from, to, ordersCount, revenue, paid, totalDebt, totalExpenses, totalPurchases,
    totalCost, grossProfit, salariesTotal, netResult, cashBalance, stockValue,
  };
}

async function buildDishReport(period, customFrom, customTo) {
  const { from, to } = periodRange(period, customFrom, customTo);
  const orders = (await db.getAll('orders')).filter(o => inRange(o.date, from, to) && o.status !== 'Отменён');
  const dishStats = {};

  for (const order of orders) {
    const items = await db.getByIndex('order_items', 'order_id', order.id);
    for (const it of items) {
      if (!dishStats[it.dish_id]) dishStats[it.dish_id] = { qty: 0, revenue: 0, cost: 0 };
      dishStats[it.dish_id].qty += it.qty;
      dishStats[it.dish_id].revenue += it.total;
    }
  }

  const result = [];
  for (const dishId of Object.keys(dishStats)) {
    const dish = await db.get('dishes', Number(dishId));
    const { cost: unitCost } = await calcDishCost(Number(dishId));
    const stat = dishStats[dishId];
    const cost = unitCost * stat.qty;
    result.push({
      dish: dish || { name: '—', photo: null },
      sold: stat.qty,
      revenue: stat.revenue,
      cost,
      profit: stat.revenue - cost,
      margin: stat.revenue > 0 ? Math.round(((stat.revenue - cost) / stat.revenue) * 1000) / 10 : 0,
    });
  }
  return result.sort((a, b) => b.revenue - a.revenue);
}

async function buildExpenseReport(period, customFrom, customTo) {
  const { from, to } = periodRange(period, customFrom, customTo);
  const expenses = (await db.getAll('expenses')).filter(e => inRange(e.date, from, to));
  const byCategory = {};
  for (const e of expenses) {
    byCategory[e.category] = (byCategory[e.category] || 0) + e.amount;
  }
  const total = expenses.reduce((s, e) => s + e.amount, 0);
  return { byCategory, total };
}
