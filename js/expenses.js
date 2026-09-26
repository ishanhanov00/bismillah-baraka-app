// expenses.js — расходы

const DEFAULT_EXPENSE_CATEGORIES = ['Продукты', 'Аренда', 'Электричество', 'Вода', 'Газ', 'Доставка', 'Зарплата', 'Реклама', 'Упаковка', 'Транспорт', 'Ремонт', 'Другое'];

async function createExpense(data) {
  const amount = toHalala(data.amount);
  const expense = {
    date: data.date || todayISO(),
    category: data.category || 'Другое',
    amount,
    payment_method: data.payment_method || 'Наличные',
    description: data.description || '',
    comment: data.comment || '',
  };
  const id = await db.add('expenses', expense);

  await db.add('cash_movements', {
    type: 'expense',
    amount,
    category: expense.category,
    description: expense.description || 'Расход',
    payment_method: expense.payment_method,
    reference: { kind: 'expense', id },
    date: expense.date,
  });

  return id;
}

async function deleteExpense(id) {
  return db.delete('expenses', id);
}

async function getAllExpenses() {
  const list = await db.getAll('expenses');
  return list.sort((a, b) => new Date(b.date) - new Date(a.date));
}

async function getExpenseCategories() {
  const setting = await db.get('settings', 'expense_categories');
  return setting ? setting.value : DEFAULT_EXPENSE_CATEGORIES;
}

async function setExpenseCategories(categories) {
  return db.put('settings', { key: 'expense_categories', value: categories });
}
