// stock.js — товары и движения склада

async function createProduct(data) {
  const product = {
    name: data.name,
    category: data.category || 'Другое',
    unit: data.unit || 'kg',
    quantity: 0,
    min_quantity: roundQty(data.min_quantity || 0),
    avg_purchase_price: 0, // halala per unit
    last_purchase_price: 0,
    last_purchase_date: null,
  };
  return db.add('products', product);
}

async function updateProduct(id, data) {
  const p = await db.get('products', id);
  Object.assign(p, data);
  return db.put('products', p);
}

async function deleteProduct(id) {
  return db.delete('products', id);
}

// Записать движение склада и обновить остаток товара
// type: purchase | sale | production | writeoff | adjustment
// qty: положительное число (направление задаётся типом/знаком delta)
async function recordStockMovement(productId, type, deltaQty, opts = {}) {
  const product = await db.get('products', productId);
  if (!product) throw new Error('Товар не найден');
  const newQty = roundQty(product.quantity + deltaQty);
  product.quantity = newQty;

  if (type === 'purchase' && opts.unitPriceHalala !== undefined) {
    const oldQty = product.quantity - deltaQty;
    const oldValue = oldQty * (product.avg_purchase_price || 0);
    const addedValue = deltaQty * opts.unitPriceHalala;
    const totalQty = oldQty + deltaQty;
    product.avg_purchase_price = totalQty > 0 ? Math.round((oldValue + addedValue) / totalQty) : opts.unitPriceHalala;
    product.last_purchase_price = opts.unitPriceHalala;
    product.last_purchase_date = todayISO();
  }

  await db.put('products', product);

  const movement = {
    product_id: productId,
    type,
    qty: deltaQty,
    resulting_quantity: newQty,
    unit_price: opts.unitPriceHalala || null,
    reference: opts.reference || null, // { kind: 'order'|'purchase', id }
    date: todayISO(),
    comment: opts.comment || '',
  };
  await db.add('stock_movements', movement);
  return product;
}

async function getStockMovements(productId) {
  const list = await db.getByIndex('stock_movements', 'product_id', productId);
  return list.sort((a, b) => new Date(b.date) - new Date(a.date));
}

async function getLowStockProducts() {
  const all = await db.getAll('products');
  return all.filter(p => p.quantity < p.min_quantity);
}

async function getTotalStockValue() {
  const all = await db.getAll('products');
  return all.reduce((sum, p) => sum + Math.round(p.quantity * (p.avg_purchase_price || 0)), 0);
}
