// debts.js — долги

async function createDebt(data) {
  const initial = toHalala(data.initial_amount);
  const debt = {
    type: data.type, // client | business
    name: data.name || '',
    phone: data.phone || '',
    description: data.description || '',
    initial_amount: initial,
    paid_amount: 0,
    remaining: initial,
    date: data.date || todayISO(),
    status: 'Открыт',
  };
  return db.add('debts', debt);
}

function recalcDebtStatus(debt) {
  if (debt.paid_amount <= 0) debt.status = 'Открыт';
  else if (debt.paid_amount >= debt.initial_amount) debt.status = 'Погашен';
  else debt.status = 'Частично погашен';
}

async function addDebtPayment(debtId, amountHalala, comment) {
  const debt = await db.get('debts', debtId);
  if (!debt) throw new Error('Долг не найден');

  await db.add('debt_payments', { debt_id: debtId, amount: amountHalala, date: todayISO(), comment: comment || '' });

  debt.paid_amount = Math.min(debt.initial_amount, (debt.paid_amount || 0) + amountHalala);
  debt.remaining = Math.max(0, debt.initial_amount - debt.paid_amount);
  recalcDebtStatus(debt);
  await db.put('debts', debt);

  // Отражаем движение денег: если клиент гасит долг бизнесу — приход; если бизнес гасит долг — расход
  await db.add('cash_movements', {
    type: debt.type === 'client' ? 'income' : 'expense',
    amount: amountHalala,
    category: 'Долги',
    description: `Погашение долга: ${debt.name}`,
    payment_method: 'Наличные',
    reference: { kind: 'debt', id: debtId },
    date: todayISO(),
  });

  return debt;
}

async function getAllDebts() {
  const list = await db.getAll('debts');
  return list.sort((a, b) => new Date(b.date) - new Date(a.date));
}

async function getDebtWithPayments(id) {
  const debt = await db.get('debts', id);
  if (!debt) return null;
  const payments = await db.getByIndex('debt_payments', 'debt_id', id);
  return { ...debt, payments };
}

async function deleteDebt(id) {
  const payments = await db.getByIndex('debt_payments', 'debt_id', id);
  for (const p of payments) await db.delete('debt_payments', p.id);
  return db.delete('debts', id);
}
