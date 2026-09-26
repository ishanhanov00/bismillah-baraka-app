// salaries.js — зарплаты работников

async function createEmployee(data) {
  const salary = toHalala(data.salary);
  const employee = {
    name: data.name,
    position: data.position || '',
    salary,
    paid_amount: 0,
    remaining: salary,
    comment: data.comment || '',
  };
  return db.add('salaries', employee);
}

async function updateEmployee(id, data) {
  const emp = await db.get('salaries', id);
  Object.assign(emp, data);
  if (data.salary !== undefined) {
    emp.salary = toHalala(data.salary);
    emp.remaining = Math.max(0, emp.salary - (emp.paid_amount || 0));
  }
  return db.put('salaries', emp);
}

async function deleteEmployee(id) {
  const payments = await db.getByIndex('salary_payments', 'salary_id', id);
  for (const p of payments) await db.delete('salary_payments', p.id);
  return db.delete('salaries', id);
}

// type: 'advance' | 'payment' — оба уменьшают остаток и являются выплатой
async function paySalary(employeeId, amountHalala, type, comment) {
  const emp = await db.get('salaries', employeeId);
  if (!emp) throw new Error('Работник не найден');

  await db.add('salary_payments', {
    salary_id: employeeId,
    amount: amountHalala,
    type: type || 'payment',
    date: todayISO(),
    comment: comment || '',
  });

  emp.paid_amount = (emp.paid_amount || 0) + amountHalala;
  emp.remaining = Math.max(0, emp.salary - emp.paid_amount);
  await db.put('salaries', emp);

  await db.add('cash_movements', {
    type: 'expense',
    amount: amountHalala,
    category: 'Зарплата',
    description: `Выплата зарплаты: ${emp.name}`,
    payment_method: 'Наличные',
    reference: { kind: 'salary', id: employeeId },
    date: todayISO(),
  });

  return emp;
}

async function resetMonthlySalary(employeeId) {
  const emp = await db.get('salaries', employeeId);
  emp.paid_amount = 0;
  emp.remaining = emp.salary;
  return db.put('salaries', emp);
}

async function getAllEmployees() {
  return db.getAll('salaries');
}

async function getEmployeeWithPayments(id) {
  const emp = await db.get('salaries', id);
  if (!emp) return null;
  const payments = await db.getByIndex('salary_payments', 'salary_id', id);
  return { ...emp, payments };
}
