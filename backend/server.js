const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Database file path
const DB_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DB_DIR, 'orders.json');

// Ensure data directory exists
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

// Initialize database file if it doesn't exist
if (!fs.existsSync(DB_FILE)) {
  fs.writeFileSync(DB_FILE, JSON.stringify({ orders: [] }, null, 2));
}

// Helper functions
const readDB = () => {
  try {
    const data = fs.readFileSync(DB_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error reading database:', error);
    return { orders: [] };
  }
};

const writeDB = (data) => {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
    return true;
  } catch (error) {
    console.error('Error writing database:', error);
    return false;
  }
};

// GET /api/orders - Get all orders with optional filters
app.get('/api/orders', (req, res) => {
  try {
    const db = readDB();
    let orders = db.orders || [];

    // Apply filters
    const { order_type, status, user_id, project, source } = req.query;

    if (order_type) {
      orders = orders.filter(o => o.order_type === order_type);
    }
    if (status) {
      orders = orders.filter(o => o.status === status);
    }
    if (user_id) {
      orders = orders.filter(o => o.user_id === parseInt(user_id));
    }
    if (project) {
      orders = orders.filter(o => o.project === project);
    }
    if (source) {
      orders = orders.filter(o => o.source === source);
    }

    // Sort by created_at descending (newest first)
    orders.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    res.json(orders);
  } catch (error) {
    console.error('Error getting orders:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/orders - Create a new order
app.post('/api/orders', (req, res) => {
  try {
    const db = readDB();

    const newOrder = {
      id: uuidv4(),
      order_type: req.body.order_type || 'buy',
      project: req.body.project || 'GTA5RP',
      server_name: req.body.server_name,
      server_id: req.body.server_id,
      user_id: req.body.user_id,
      username: req.body.username,
      amount: req.body.amount,
      price: req.body.price,
      contact: req.body.contact || '',
      refund_enabled: req.body.refund_enabled !== false,
      status: req.body.order_type === 'buy' ? 'approved' : 'pending',
      source: req.body.source || 'webapp',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    db.orders.push(newOrder);

    if (writeDB(db)) {
      console.log(`Created order: ${newOrder.id} - ${newOrder.order_type} by @${newOrder.username}`);
      res.json(newOrder);
    } else {
      res.status(500).json({ error: 'Failed to save order' });
    }
  } catch (error) {
    console.error('Error creating order:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/orders/:id - Update an order
app.patch('/api/orders/:id', (req, res) => {
  try {
    const db = readDB();
    const orderId = req.params.id;

    const orderIndex = db.orders.findIndex(o => o.id === orderId);

    if (orderIndex === -1) {
      return res.status(404).json({ error: 'Order not found' });
    }

    // Update fields
    const updatedOrder = {
      ...db.orders[orderIndex],
      ...req.body,
      updated_at: new Date().toISOString()
    };

    db.orders[orderIndex] = updatedOrder;

    if (writeDB(db)) {
      console.log(`Updated order: ${orderId}`);
      res.json(updatedOrder);
    } else {
      res.status(500).json({ error: 'Failed to update order' });
    }
  } catch (error) {
    console.error('Error updating order:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/orders/:id/approve - Approve a sell order
app.patch('/api/orders/:id/approve', (req, res) => {
  try {
    const db = readDB();
    const orderId = req.params.id;

    const orderIndex = db.orders.findIndex(o => o.id === orderId);

    if (orderIndex === -1) {
      return res.status(404).json({ error: 'Order not found' });
    }

    db.orders[orderIndex].status = 'approved';
    db.orders[orderIndex].updated_at = new Date().toISOString();

    if (writeDB(db)) {
      console.log(`Approved order: ${orderId}`);
      res.json(db.orders[orderIndex]);
    } else {
      res.status(500).json({ error: 'Failed to approve order' });
    }
  } catch (error) {
    console.error('Error approving order:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/orders/:id/reject - Reject a sell order
app.patch('/api/orders/:id/reject', (req, res) => {
  try {
    const db = readDB();
    const orderId = req.params.id;

    const orderIndex = db.orders.findIndex(o => o.id === orderId);

    if (orderIndex === -1) {
      return res.status(404).json({ error: 'Order not found' });
    }

    db.orders[orderIndex].status = 'rejected';
    db.orders[orderIndex].updated_at = new Date().toISOString();

    if (writeDB(db)) {
      console.log(`Rejected order: ${orderId}`);
      res.json(db.orders[orderIndex]);
    } else {
      res.status(500).json({ error: 'Failed to reject order' });
    }
  } catch (error) {
    console.error('Error rejecting order:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/orders/:id - Delete an order
app.delete('/api/orders/:id', (req, res) => {
  try {
    const db = readDB();
    const orderId = req.params.id;

    const orderIndex = db.orders.findIndex(o => o.id === orderId);

    if (orderIndex === -1) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const deletedOrder = db.orders[orderIndex];
    db.orders.splice(orderIndex, 1);

    if (writeDB(db)) {
      console.log(`Deleted order: ${orderId}`);
      res.json({ success: true, order: deletedOrder });
    } else {
      res.status(500).json({ error: 'Failed to delete order' });
    }
  } catch (error) {
    console.error('Error deleting order:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/orders/stats/servers - Get server statistics
app.get('/api/orders/stats/servers', (req, res) => {
  try {
    const db = readDB();
    const { project } = req.query;

    // Filter approved sell orders
    let orders = db.orders.filter(o =>
      o.order_type === 'sell' && o.status === 'approved'
    );

    if (project) {
      orders = orders.filter(o => o.project === project);
    }

    // Group by server
    const stats = {};

    orders.forEach(order => {
      const key = order.server_name;

      if (!stats[key]) {
        stats[key] = {
          server_name: order.server_name,
          server_id: order.server_id,
          total_sellers: 0,
          total_amount: 0,
          sellers: new Set()
        };
      }

      stats[key].sellers.add(order.user_id);
      stats[key].total_amount += order.amount;
    });

    // Convert to array and calculate unique sellers
    const result = Object.values(stats).map(stat => ({
      server_name: stat.server_name,
      server_id: stat.server_id,
      total_sellers: stat.sellers.size,
      total_amount: stat.total_amount
    }));

    res.json(result);
  } catch (error) {
    console.error('Error getting server stats:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Start server
app.listen(PORT, () => {
  console.log(`╔════════════════════════════════════════════╗`);
  console.log(`║  🚀 Local Backend Server Running          ║`);
  console.log(`║  📍 Port: ${PORT}                             ║`);
  console.log(`║  💾 Database: ${DB_FILE}  ║`);
  console.log(`║  🌐 API: http://localhost:${PORT}/api       ║`);
  console.log(`╚════════════════════════════════════════════╝`);
});
