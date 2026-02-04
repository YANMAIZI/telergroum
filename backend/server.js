const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const Database = require('better-sqlite3');

const app = express();
const PORT = process.env.PORT || 3001;

// ==========================================
// MIDDLEWARE
// ==========================================
app.use(cors());
app.use(express.json());

// ==========================================
// SQLITE DATABASE SETUP
// ==========================================
const DB_DIR = path.join(__dirname, 'data');
const DB_PATH = path.join(DB_DIR, 'orders.db');

// Ensure data directory exists
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

// Initialize SQLite database
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL'); // Better concurrency

// Create orders table with proper schema
db.exec(`
  CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    order_type TEXT NOT NULL CHECK(order_type IN ('buy', 'sell')),
    project TEXT DEFAULT 'GTA5RP',
    server_name TEXT,
    server_id INTEGER,
    user_id INTEGER,
    username TEXT,
    amount INTEGER,
    price REAL,
    contact TEXT DEFAULT '',
    refund_enabled INTEGER DEFAULT 1,
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected', 'completed')),
    source TEXT DEFAULT 'webapp',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);
  CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
  CREATE INDEX IF NOT EXISTS idx_orders_type ON orders(order_type);
  CREATE INDEX IF NOT EXISTS idx_orders_server ON orders(server_id);

  CREATE TABLE IF NOT EXISTS banned_users (
    user_id INTEGER PRIMARY KEY,
    reason TEXT,
    banned_at TEXT DEFAULT (datetime('now'))
  );
`);

console.log('✅ SQLite database initialized:', DB_PATH);

// ==========================================
// PREPARED STATEMENTS (for performance)
// ==========================================
const stmts = {
  insertOrder: db.prepare(`
    INSERT INTO orders (id, order_type, project, server_name, server_id, user_id, username, amount, price, contact, refund_enabled, status, source, created_at, updated_at)
    VALUES (@id, @order_type, @project, @server_name, @server_id, @user_id, @username, @amount, @price, @contact, @refund_enabled, @status, @source, @created_at, @updated_at)
  `),

  getAllOrders: db.prepare(`SELECT * FROM orders ORDER BY created_at DESC`),

  getOrderById: db.prepare(`SELECT * FROM orders WHERE id = ?`),

  getOrdersByUserId: db.prepare(`SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC`),

  getOrdersByType: db.prepare(`SELECT * FROM orders WHERE order_type = ? ORDER BY created_at DESC`),

  getOrdersByStatus: db.prepare(`SELECT * FROM orders WHERE status = ? ORDER BY created_at DESC`),

  getOrdersByTypeAndStatus: db.prepare(`SELECT * FROM orders WHERE order_type = ? AND status = ? ORDER BY created_at DESC`),

  updateOrderStatus: db.prepare(`UPDATE orders SET status = ?, updated_at = datetime('now') WHERE id = ?`),

  updateOrder: db.prepare(`UPDATE orders SET amount = ?, price = ?, contact = ?, updated_at = datetime('now') WHERE id = ?`),

  deleteOrder: db.prepare(`DELETE FROM orders WHERE id = ?`),

  getServerStats: db.prepare(`
    SELECT
      server_name,
      server_id,
      COUNT(DISTINCT user_id) as total_sellers,
      SUM(amount) as total_amount
    FROM orders
    WHERE order_type = 'sell' AND status = 'approved' AND project = ?
    GROUP BY server_name, server_id
  `),

  getBuyerStats: db.prepare(`
    SELECT
      server_name,
      server_id,
      COUNT(DISTINCT user_id) as total_buyers,
      SUM(amount) as total_amount
    FROM orders
    WHERE order_type = 'buy' AND status = 'approved' AND project = ?
    GROUP BY server_name, server_id
  `)
};

// ==========================================
// ERROR CODES
// ==========================================
const ErrorCodes = {
  NO_USER: { code: 'NO_USER', message: 'Telegram user not provided' },
  NO_SERVER: { code: 'NO_SERVER', message: 'Server not specified' },
  INVALID_AMOUNT: { code: 'INVALID_AMOUNT', message: 'Invalid amount' },
  CREATE_FAILED: { code: 'CREATE_FAILED', message: 'Failed to create order' },
  UPDATE_FAILED: { code: 'UPDATE_FAILED', message: 'Failed to update order' },
  DELETE_FAILED: { code: 'DELETE_FAILED', message: 'Failed to delete order' },
  NOT_FOUND: { code: 'NOT_FOUND', message: 'Order not found' },
  INTERNAL_ERROR: { code: 'INTERNAL_ERROR', message: 'Internal server error' }
};

const sendError = (res, statusCode, errorCode, details = null) => {
  const error = ErrorCodes[errorCode] || ErrorCodes.INTERNAL_ERROR;
  console.error(`[ERROR] ${error.code}: ${error.message}`, details ? `- ${details}` : '');
  res.status(statusCode).json({
    success: false,
    error: error.code,
    message: error.message,
    details: details
  });
};

// ==========================================
// TELEGRAM NOTIFICATION
// ==========================================
// ✅ ИСПРАВЛЕНО: BOT_TOKEN с fallback значением — теперь работает даже без переменной окружения
const BOT_TOKEN = process.env.BOT_TOKEN || '8067623423:AAHO3QgV2ih5WDg0xupuykF7rIkqjDFuOic';
const ADMIN_USER_ID = process.env.ADMIN_USER_ID || '7858974852';

// Логируем при старте что используем
console.log(`[TELEGRAM] BOT_TOKEN: ${BOT_TOKEN ? BOT_TOKEN.slice(0, 10) + '...' : 'НЕ УСТАНОВЛЕН'}`);
console.log(`[TELEGRAM] ADMIN_USER_ID: ${ADMIN_USER_ID}`);

const sendTelegramNotificationAsync = (message) => {
  if (!BOT_TOKEN) {
    console.warn('[TELEGRAM] ❌ BOT_TOKEN не установлен — уведомление пропущено');
    return;
  }

  //Fire and forget
  setImmediate(async () => {
    try {
      const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
      console.log(`[TELEGRAM] Sending to chat_id=${ADMIN_USER_ID}...`);

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: ADMIN_USER_ID,
          text: message,
          parse_mode: 'HTML'
        })
      });

      const result = await response.json();

      if (!response.ok) {
        // ✅ ИСПРАВЛЕНО: подробная ошибка с полным ответом Telegram
        console.error(`[TELEGRAM] ❌ Ошибка ${response.status}:`, JSON.stringify(result));
      } else {
        console.log(`[TELEGRAM] ✅ Уведомление отправлено, message_id=${result.result?.message_id}`);
      }
    } catch (error) {
      console.error('[TELEGRAM] ❌ Network error:', error.message);
    }
  });
};

// ==========================================
// LOGGING MIDDLEWARE
// ==========================================
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} - ${res.statusCode} (${duration}ms)`);
  });
  next();
});

// ==========================================
// API ROUTES
// ==========================================

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    status: 'ok',
    database: 'sqlite',
    timestamp: new Date().toISOString()
  });
});

// GET /api/banned/:id - Check if user is banned
app.get('/api/banned/:id', (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    if (!userId) {
      return res.json({ banned: false });
    }

    const bannedUser = db.prepare('SELECT * FROM banned_users WHERE user_id = ?').get(userId);

    if (bannedUser) {
      return res.json({
        banned: true,
        reason: bannedUser.reason,
        banned_at: bannedUser.banned_at
      });
    }

    res.json({ banned: false });
  } catch (error) {
    console.error('[GET /api/banned/:id] Error:', error.message);
    res.json({ banned: false });
  }
});

// GET /api/orders - Get all orders with optional filters
app.get('/api/orders', (req, res) => {
  try {
    const { order_type, status, user_id, project, source } = req.query;

    let orders;

    if (order_type && status) {
      orders = stmts.getOrdersByTypeAndStatus.all(order_type, status);
    } else if (order_type) {
      orders = stmts.getOrdersByType.all(order_type);
    } else if (status) {
      orders = stmts.getOrdersByStatus.all(status);
    } else if (user_id) {
      orders = stmts.getOrdersByUserId.all(parseInt(user_id));
    } else {
      orders = stmts.getAllOrders.all();
    }

    if (project) {
      orders = orders.filter(o => o.project === project);
    }
    if (source) {
      orders = orders.filter(o => o.source === source);
    }
    if (user_id && (order_type || status)) {
      orders = orders.filter(o => o.user_id === parseInt(user_id));
    }

    orders = orders.map(o => ({
      ...o,
      refund_enabled: Boolean(o.refund_enabled)
    }));

    res.json(orders);
  } catch (error) {
    console.error('[GET /api/orders] Error:', error.message);
    sendError(res, 500, 'INTERNAL_ERROR', error.message);
  }
});

// POST /api/orders - Create a new order
app.post('/api/orders', (req, res) => {
  try {
    const { order_type, server_name, server_id, user_id, username, amount, price, contact, refund_enabled, source } = req.body;

    // Validation
    if (!user_id) {
      return sendError(res, 400, 'NO_USER');
    }
    if (!server_id && !server_name) {
      return sendError(res, 400, 'NO_SERVER');
    }
    if (!amount || amount < 100000) {
      return sendError(res, 400, 'INVALID_AMOUNT', 'Amount must be at least 100,000');
    }

    const orderId = uuidv4();
    const now = new Date().toISOString();

    const orderData = {
      id: orderId,
      order_type: order_type || 'buy',
      project: req.body.project || 'GTA5RP',
      server_name: server_name || '',
      server_id: parseInt(server_id) || 0,
      user_id: parseInt(user_id) || 0,
      username: username || '',
      amount: parseInt(amount) || 0,
      price: parseFloat(price) || 0,
      contact: contact || '',
      refund_enabled: refund_enabled !== false ? 1 : 0,
      status: order_type === 'buy' ? 'approved' : 'pending',
      source: source || 'webapp',
      created_at: now,
      updated_at: now
    };

    const transaction = db.transaction(() => {
      stmts.insertOrder.run(orderData);
      return stmts.getOrderById.get(orderId);
    });

    const newOrder = transaction();

    if (!newOrder) {
      return sendError(res, 500, 'CREATE_FAILED');
    }

    console.log(`[ORDER CREATED] ID: ${orderId}, Type: ${orderData.order_type}, User: @${orderData.username}, Amount: ${orderData.amount}`);

    // ✅ Telegram уведомление при создании заявки через webapp
    // (при создании через бот — бот шлёт уведомление сам, но дублируем для надёжности)
    const typeLabel = orderData.order_type === 'buy' ? '🛒 Покупка' : '💰 Продажа';
    const statusLabel = orderData.status === 'approved' ? '✅ Одобрено' : '⏳ Ожидает модерации';
    const notifyMessage =
      `🧾 <b>Новая заявка</b>\n\n` +
      `Тип: <b>${typeLabel}</b>\n` +
      `Статус: ${statusLabel}\n` +
      `Пользователь: @${orderData.username || 'unknown'}\n` +
      `Сервер: ${orderData.server_name || '—'}\n` +
      `Количество: ${(orderData.amount / 1000000).toFixed(1)}кк\n` +
      `Сумма: ${orderData.price} ₽\n` +
      `Источник: ${orderData.source || 'webapp'}`;

    sendTelegramNotificationAsync(notifyMessage);

    res.json({
      success: true,
      ...newOrder,
      refund_enabled: Boolean(newOrder.refund_enabled)
    });

  } catch (error) {
    console.error('[POST /api/orders] Error:', error.message);
    sendError(res, 500, 'CREATE_FAILED', error.message);
  }
});

// PATCH /api/orders/:id - Update an order
app.patch('/api/orders/:id', (req, res) => {
  try {
    const orderId = req.params.id;
    const existing = stmts.getOrderById.get(orderId);

    if (!existing) {
      return sendError(res, 404, 'NOT_FOUND');
    }

    const { amount, price, contact, status } = req.body;

    if (status && status !== existing.status) {
      stmts.updateOrderStatus.run(status, orderId);
    }

    if (amount !== undefined || price !== undefined || contact !== undefined) {
      stmts.updateOrder.run(
        amount ?? existing.amount,
        price ?? existing.price,
        contact ?? existing.contact,
        orderId
      );
    }

    const updated = stmts.getOrderById.get(orderId);
    console.log(`[ORDER UPDATED] ID: ${orderId}`);

    res.json({
      success: true,
      ...updated,
      refund_enabled: Boolean(updated.refund_enabled)
    });

  } catch (error) {
    console.error('[PATCH /api/orders/:id] Error:', error.message);
    sendError(res, 500, 'UPDATE_FAILED', error.message);
  }
});

// PATCH /api/orders/:id/approve - Approve a sell order
app.patch('/api/orders/:id/approve', (req, res) => {
  try {
    const orderId = req.params.id;
    const existing = stmts.getOrderById.get(orderId);

    if (!existing) {
      return sendError(res, 404, 'NOT_FOUND');
    }

    stmts.updateOrderStatus.run('approved', orderId);
    const updated = stmts.getOrderById.get(orderId);

    console.log(`[ORDER APPROVED] ID: ${orderId}, User: @${existing.username}`);

    // ✅ Уведомление об одобрении
    sendTelegramNotificationAsync(
      `✅ <b>Заявка одобрена</b>\n\n` +
      `ID: <code>${orderId.slice(0, 8)}</code>\n` +
      `Пользователь: @${existing.username}\n` +
      `Сервер: ${existing.server_name}\n` +
      `Количество: ${(existing.amount / 1000000).toFixed(1)}кк\n` +
      `Сумма: ${existing.price} ₽`
    );

    res.json({
      success: true,
      ...updated,
      refund_enabled: Boolean(updated.refund_enabled)
    });

  } catch (error) {
    console.error('[PATCH /api/orders/:id/approve] Error:', error.message);
    sendError(res, 500, 'UPDATE_FAILED', error.message);
  }
});

// PATCH /api/orders/:id/reject - Reject a sell order
app.patch('/api/orders/:id/reject', (req, res) => {
  try {
    const orderId = req.params.id;
    const existing = stmts.getOrderById.get(orderId);

    if (!existing) {
      return sendError(res, 404, 'NOT_FOUND');
    }

    stmts.updateOrderStatus.run('rejected', orderId);
    const updated = stmts.getOrderById.get(orderId);

    console.log(`[ORDER REJECTED] ID: ${orderId}, User: @${existing.username}`);

    // ✅ ИСПРАВЛЕНО: Добавлено уведомление при отклонении (было пропущено)
    sendTelegramNotificationAsync(
      `❌ <b>Заявка отклонена</b>\n\n` +
      `ID: <code>${orderId.slice(0, 8)}</code>\n` +
      `Пользователь: @${existing.username}\n` +
      `Сервер: ${existing.server_name}\n` +
      `Количество: ${(existing.amount / 1000000).toFixed(1)}кк\n` +
      `Сумма: ${existing.price} ₽`
    );

    res.json({
      success: true,
      ...updated,
      refund_enabled: Boolean(updated.refund_enabled)
    });

  } catch (error) {
    console.error('[PATCH /api/orders/:id/reject] Error:', error.message);
    sendError(res, 500, 'UPDATE_FAILED', error.message);
  }
});

// DELETE /api/orders/:id - Delete an order
app.delete('/api/orders/:id', (req, res) => {
  try {
    const orderId = req.params.id;
    const existing = stmts.getOrderById.get(orderId);

    if (!existing) {
      return sendError(res, 404, 'NOT_FOUND');
    }

    stmts.deleteOrder.run(orderId);

    console.log(`[ORDER DELETED] ID: ${orderId}, User: @${existing.username}`);

    res.json({
      success: true,
      deleted: true,
      order: {
        ...existing,
        refund_enabled: Boolean(existing.refund_enabled)
      }
    });

  } catch (error) {
    console.error('[DELETE /api/orders/:id] Error:', error.message);
    sendError(res, 500, 'DELETE_FAILED', error.message);
  }
});

// GET /api/orders/stats/servers - Get server statistics for SELLERS
app.get('/api/orders/stats/servers', (req, res) => {
  try {
    const { project } = req.query;
    const projectFilter = project || 'GTA5RP';

    const stats = stmts.getServerStats.all(projectFilter);

    res.json(stats.map(stat => ({
      server_name: stat.server_name,
      server_id: stat.server_id,
      total_sellers: stat.total_sellers,
      total_amount: stat.total_amount || 0
    })));

  } catch (error) {
    console.error('[GET /api/orders/stats/servers] Error:', error.message);
    sendError(res, 500, 'INTERNAL_ERROR', error.message);
  }
});

// GET /api/orders/stats/buyers - Get server statistics for BUYERS
app.get('/api/orders/stats/buyers', (req, res) => {
  try {
    const { project } = req.query;
    const projectFilter = project || 'GTA5RP';

    const stats = stmts.getBuyerStats.all(projectFilter);

    res.json(stats.map(stat => ({
      server_name: stat.server_name,
      server_id: stat.server_id,
      total_buyers: stat.total_buyers,
      total_amount: stat.total_amount || 0
    })));

  } catch (error) {
    console.error('[GET /api/orders/stats/buyers] Error:', error.message);
    sendError(res, 500, 'INTERNAL_ERROR', error.message);
  }
});

// ==========================================
// STATIC FILES & SPA FALLBACK
// ==========================================
const distPath = path.join(__dirname, '..', 'dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
}

app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ success: false, error: 'NOT_FOUND', message: 'API endpoint not found' });
  }

  const indexPath = path.join(__dirname, '..', 'dist', 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(404).send('Frontend build not found. Please run npm run build.');
  }
});

// ==========================================
// GRACEFUL SHUTDOWN
// ==========================================
process.on('SIGINT', () => {
  console.log('\n[SHUTDOWN] Closing database connection...');
  db.close();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n[SHUTDOWN] Closing database connection...');
  db.close();
  process.exit(0);
});

// ==========================================
// START SERVER
// ==========================================
app.listen(PORT, () => {
  console.log(`╔════════════════════════════════════════════════════╗`);
  console.log(`║  🚀 Stable Backend Server Running                  ║`);
  console.log(`║  📍 Port: ${PORT}                                      ║`);
  console.log(`║  💾 Database: SQLite (better-sqlite3)              ║`);
  console.log(`║  🌐 API: http://localhost:${PORT}/api                  ║`);
  console.log(`║  ✅ Transactions & WAL mode enabled                ║`);
  console.log(`║  📱 Telegram notifications: User ID ${ADMIN_USER_ID}     ║`);
  console.log(`╚════════════════════════════════════════════════════╝`);
});