// purchases.js — закупки товаров

// items: [{product_id, qty, unit_price_halala}]
async function createPurchase({ supplier, date, payment_method, comment, paid, items }) {
  const purchase = {
    supplier: supplier || '',
    date: date || todayISO(),
    payment_method: payment_method || 'Наличные',
    comment: comment || '',
    paid: !!paid,
    total_amount: 0,
  };
  let total = 0;
  for (const it of items) total += Math.round(it.qty * it.unit_price_halala);
  purchase.total_amount = total;
  const purchaseId = await db.add('purchases', purchase);

  for (const it of items) {
    await db.add('purchase_items', {
      purchase_id: purchaseId,
      product_id: it.product_id,
      qty: roundQty(it.qty),
      unit_price: it.unit_price_halala,
      total: Math.round(it.qty * it.unit_price_halala),
    });
    await recordStockMovement(it.product_id, 'purchase', roundQty(it.qty), {
      unitPriceHalala: it.unit_price_halala,
      reference: { kind: 'purchase', id: purchaseId },
    });
  }

  if (purchase.paid) {
    await db.add('cash_movements', {
      type: 'expense',
      amount: total,
      category: 'Закупки',
      description: `Закупка у ${supplier || 'поставщика'}`,
      payment_method: purchase.payment_method,
      reference: { kind: 'purchase', id: purchaseId },
      date: purchase.date,
    });
  }

  return purchaseId;
}

async function getPurchaseWithItems(id) {
  const purchase = await db.get('purchases', id);
  if (!purchase) return null;
  const items = await db.getByIndex('purchase_items', 'purchase_id', id);
  return { ...purchase, items };
}

async function getAllPurchases() {
  const list = await db.getAll('purchases');
  return list.sort((a, b) => new Date(b.date) - new Date(a.date));
}
