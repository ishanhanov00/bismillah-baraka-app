// recipes.js — блюда, рецепты, себестоимость

async function createDish(data) {
  const dish = {
    name: data.name,
    photo: data.photo || null, // base64 или null
    category: data.category || 'Другое',
    price: toHalala(data.price),
    description: data.description || '',
    active: data.active !== false,
  };
  return db.add('dishes', dish);
}

async function updateDish(id, data) {
  const dish = await db.get('dishes', id);
  Object.assign(dish, data);
  return db.put('dishes', dish);
}

async function deleteDish(id) {
  const recipe = await getRecipeForDish(id);
  if (recipe) {
    const items = await db.getByIndex('recipe_items', 'recipe_id', recipe.id);
    for (const it of items) await db.delete('recipe_items', it.id);
    await db.delete('recipes', recipe.id);
  }
  return db.delete('dishes', id);
}

async function getRecipeForDish(dishId) {
  const list = await db.getByIndex('recipes', 'dish_id', dishId);
  return list[0] || null;
}

// items: [{product_id, qty}]
async function saveRecipe(dishId, items) {
  let recipe = await getRecipeForDish(dishId);
  let recipeId;
  if (!recipe) {
    recipeId = await db.add('recipes', { dish_id: dishId });
  } else {
    recipeId = recipe.id;
    const old = await db.getByIndex('recipe_items', 'recipe_id', recipeId);
    for (const it of old) await db.delete('recipe_items', it.id);
  }
  for (const it of items) {
    await db.add('recipe_items', { recipe_id: recipeId, product_id: it.product_id, qty: roundQty(it.qty) });
  }
  return recipeId;
}

async function getRecipeItems(dishId) {
  const recipe = await getRecipeForDish(dishId);
  if (!recipe) return [];
  return db.getByIndex('recipe_items', 'recipe_id', recipe.id);
}

// Возвращает себестоимость блюда в halala, на основе средней закупочной цены ингредиентов
async function calcDishCost(dishId) {
  const items = await getRecipeItems(dishId);
  let cost = 0;
  const breakdown = [];
  for (const it of items) {
    const product = await db.get('products', it.product_id);
    const price = product ? (product.avg_purchase_price || 0) : 0;
    const itemCost = Math.round(it.qty * price);
    cost += itemCost;
    breakdown.push({ product_id: it.product_id, name: product ? product.name : '—', qty: it.qty, unit: product ? product.unit : '', cost: itemCost });
  }
  return { cost, breakdown };
}

async function getDishMargin(dishId) {
  const dish = await db.get('dishes', dishId);
  const { cost } = await calcDishCost(dishId);
  const profit = dish.price - cost;
  const margin = dish.price > 0 ? Math.round((profit / dish.price) * 1000) / 10 : 0;
  return { price: dish.price, cost, profit, margin };
}

// Списать ингредиенты блюда со склада согласно рецепту (при продаже/доставке заказа)
async function consumeDishIngredients(dishId, dishQty, orderId) {
  const items = await getRecipeItems(dishId);
  for (const it of items) {
    const totalQty = roundQty(it.qty * dishQty);
    await recordStockMovement(it.product_id, 'sale', -totalQty, {
      reference: { kind: 'order', id: orderId },
      comment: `Продажа блюда`,
    });
  }
}
