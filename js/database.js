// database.js — обёртка над IndexedDB
const DB_NAME = 'bismillah_baraka_db';
const DB_VERSION = 1;

const STORES = [
  { name: 'orders', keyPath: 'id', autoIncrement: true, indexes: ['status', 'date'] },
  { name: 'order_items', keyPath: 'id', autoIncrement: true, indexes: ['order_id', 'product_dish_id'] },
  { name: 'payments', keyPath: 'id', autoIncrement: true, indexes: ['order_id', 'date'] },
  { name: 'expenses', keyPath: 'id', autoIncrement: true, indexes: ['date', 'category'] },
  { name: 'debts', keyPath: 'id', autoIncrement: true, indexes: ['type', 'status'] },
  { name: 'debt_payments', keyPath: 'id', autoIncrement: true, indexes: ['debt_id', 'date'] },
  { name: 'products', keyPath: 'id', autoIncrement: true, indexes: ['category'] },
  { name: 'stock_movements', keyPath: 'id', autoIncrement: true, indexes: ['product_id', 'date', 'type'] },
  { name: 'purchases', keyPath: 'id', autoIncrement: true, indexes: ['date'] },
  { name: 'purchase_items', keyPath: 'id', autoIncrement: true, indexes: ['purchase_id', 'product_id'] },
  { name: 'dishes', keyPath: 'id', autoIncrement: true, indexes: ['category', 'active'] },
  { name: 'recipes', keyPath: 'id', autoIncrement: true, indexes: ['dish_id'] },
  { name: 'recipe_items', keyPath: 'id', autoIncrement: true, indexes: ['recipe_id', 'product_id'] },
  { name: 'salaries', keyPath: 'id', autoIncrement: true, indexes: [] },
  { name: 'salary_payments', keyPath: 'id', autoIncrement: true, indexes: ['salary_id', 'date'] },
  { name: 'cash_movements', keyPath: 'id', autoIncrement: true, indexes: ['date', 'type', 'category'] },
  { name: 'settings', keyPath: 'key', autoIncrement: false, indexes: [] },
];

class Database {
  constructor() { this.db = null; }

  open() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        for (const s of STORES) {
          if (!db.objectStoreNames.contains(s.name)) {
            const store = db.createObjectStore(s.name, { keyPath: s.keyPath, autoIncrement: s.autoIncrement });
            for (const idx of s.indexes) store.createIndex(idx, idx, { unique: false });
          }
        }
      };
      req.onsuccess = (e) => { this.db = e.target.result; resolve(this.db); };
      req.onerror = (e) => reject(e.target.error);
    });
  }

  tx(storeNames, mode = 'readonly') {
    return this.db.transaction(storeNames, mode);
  }

  add(storeName, value) {
    return new Promise((resolve, reject) => {
      const t = this.tx(storeName, 'readwrite');
      const now = new Date().toISOString();
      if (value.created_at === undefined) value.created_at = now;
      value.updated_at = now;
      const req = t.objectStore(storeName).add(value);
      req.onsuccess = () => resolve(req.result);
      req.onerror = (e) => reject(e.target.error);
    });
  }

  put(storeName, value) {
    return new Promise((resolve, reject) => {
      const t = this.tx(storeName, 'readwrite');
      value.updated_at = new Date().toISOString();
      const req = t.objectStore(storeName).put(value);
      req.onsuccess = () => resolve(req.result);
      req.onerror = (e) => reject(e.target.error);
    });
  }

  get(storeName, key) {
    return new Promise((resolve, reject) => {
      const t = this.tx(storeName);
      const req = t.objectStore(storeName).get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = (e) => reject(e.target.error);
    });
  }

  getAll(storeName) {
    return new Promise((resolve, reject) => {
      const t = this.tx(storeName);
      const req = t.objectStore(storeName).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = (e) => reject(e.target.error);
    });
  }

  getByIndex(storeName, indexName, value) {
    return new Promise((resolve, reject) => {
      const t = this.tx(storeName);
      const idx = t.objectStore(storeName).index(indexName);
      const req = idx.getAll(value);
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = (e) => reject(e.target.error);
    });
  }

  delete(storeName, key) {
    return new Promise((resolve, reject) => {
      const t = this.tx(storeName, 'readwrite');
      const req = t.objectStore(storeName).delete(key);
      req.onsuccess = () => resolve();
      req.onerror = (e) => reject(e.target.error);
    });
  }

  clear(storeName) {
    return new Promise((resolve, reject) => {
      const t = this.tx(storeName, 'readwrite');
      const req = t.objectStore(storeName).clear();
      req.onsuccess = () => resolve();
      req.onerror = (e) => reject(e.target.error);
    });
  }

  async exportAll() {
    const data = {};
    for (const s of STORES) data[s.name] = await this.getAll(s.name);
    return data;
  }

  async importAll(data) {
    for (const s of STORES) {
      await this.clear(s.name);
      if (data[s.name]) {
        const t = this.tx(s.name, 'readwrite');
        const store = t.objectStore(s.name);
        for (const item of data[s.name]) store.put(item);
        await new Promise((res, rej) => { t.oncomplete = res; t.onerror = () => rej(t.error); });
      }
    }
  }
}

const db = new Database();
