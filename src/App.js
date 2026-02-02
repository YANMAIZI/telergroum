import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, useNavigate, useParams, useLocation, Link, Navigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, Star, ShoppingBag, TrendingUp, TrendingDown,
  Search, ChevronRight, CheckCircle, Clock, Wallet,
  Zap, Shield, Users, Gift, Info, X, Settings, Trash2, Edit, Check, XCircle
} from 'lucide-react';
import { Toaster, toast } from 'sonner';
import '@/App.css';
import axios from 'axios';
import SERVERS from './servers';

// ==========================================
// ERROR BOUNDARY FOR STABILITY
// ==========================================
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('Error caught by boundary:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="virty-app-container flex items-center justify-center">
          <div className="text-center p-6">
            <XCircle className="w-20 h-20 text-red-500 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-white mb-2">Что-то пошло не так</h2>
            <p className="text-gray-400 mb-6">Произошла ошибка при загрузке страницы</p>
            <button
              onClick={() => window.location.href = '/'}
              className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
            >
              Вернуться на главную
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// Security: Use environment variables instead of hardcoded values
const ADMIN_USERNAME = process.env.REACT_APP_ADMIN_USERNAME || 'patrickprodast';
const BOT_TOKEN = process.env.REACT_APP_BOT_TOKEN || '';
const ADMIN_CHAT_ID = process.env.REACT_APP_ADMIN_CHAT_ID || '';

// Backend API URL: сначала переменная окружения, иначе относительный /api
const API =
  process.env.REACT_APP_BACKEND_URL ||
  (typeof window !== 'undefined' ? `${window.location.origin}/api` : '');

// ==========================================
// ERROR CODES (matching backend)
// ==========================================
const ErrorMessages = {
  NO_USER: 'Telegram пользователь не определен',
  NO_TELEGRAM_USER: 'Откройте приложение через Telegram',
  NO_SERVER: 'Сервер не выбран',
  INVALID_AMOUNT: 'Некорректное количество виртов',
  CREATE_FAILED: 'Ошибка создания заявки',
  UPDATE_FAILED: 'Ошибка обновления заявки',
  DELETE_FAILED: 'Ошибка удаления заявки',
  NOT_FOUND: 'Заявка не найдена',
  INTERNAL_ERROR: 'Внутренняя ошибка сервера',
  NETWORK_ERROR: 'Ошибка сети. Проверьте соединение'
};

// Get error message from error code
const getErrorMessage = (errorCode) => {
  return ErrorMessages[errorCode] || ErrorMessages.INTERNAL_ERROR;
};

// Safe API call wrapper with error handling
const safeApiCall = async (apiFunction) => {
  try {
    const response = await apiFunction();
    return response.data;
  } catch (error) {
    console.error('API call failed:', error);
    return null;
  }
};

// Input validation and sanitization
const sanitizeInput = (input) => {
  if (typeof input !== 'string') return '';
  return input.replace(/[<>\"']/g, '').trim().slice(0, 200);
};

const validateServerId = (id) => {
  const numId = parseInt(id);
  return !isNaN(numId) && numId > 0 && numId <= SERVERS.length;
};

const validateAmount = (amount) => {
  const numAmount = parseInt(amount);
  return !isNaN(numAmount) && numAmount >= 100000 && numAmount <= 100000000;
};

// ==========================================
// TELEGRAM USER VALIDATION (Strict)
// ==========================================
const getTelegramUser = () => {
  const tg = window.Telegram?.WebApp;
  const user = tg?.initDataUnsafe?.user;
  
  if (!user || !user.id) {
    return { valid: false, error: 'NO_TELEGRAM_USER' };
  }
  
  return {
    valid: true,
    userId: user.id.toString(),
    username: user.username || `user_${user.id}`,
    firstName: user.first_name || 'Пользователь'
  };
};

// Check if running in Telegram WebApp
const isInTelegram = () => {
  return Boolean(window.Telegram?.WebApp?.initDataUnsafe?.user?.id);
};

// ==========================================
// API ORDER MANAGEMENT (SQLite through Backend)
// ==========================================

// Create order through API with proper error handling
const createOrder = async (orderData) => {
  try {
    if (!API) {
      console.error('Backend API URL not configured');
      return { success: false, error: 'INTERNAL_ERROR' };
    }

    const server = SERVERS.find(s => s.id === orderData.serverId);
    if (!server) {
      console.error('Server not found');
      return { success: false, error: 'NO_SERVER' };
    }

    const apiData = {
      order_type: orderData.type || 'buy',
      project: 'GTA5RP',
      server_name: server.name,
      server_id: orderData.serverId,
      user_id: parseInt(orderData.userId) || 0,
      username: sanitizeInput(orderData.username),
      amount: parseInt(orderData.amount),
      price: parseFloat(orderData.totalPrice),
      contact: sanitizeInput(orderData.contact || ''),
      refund_enabled: orderData.refundEnabled !== false,
      source: 'webapp'
    };

    const response = await axios.post(`${API}/orders`, apiData, { timeout: 10000 });
    
    if (response.data && response.data.success !== false) {
      return { success: true, data: response.data };
    }
    
    return { success: false, error: response.data?.error || 'CREATE_FAILED' };
  } catch (error) {
    console.error('Error creating order:', error);
    
    // Extract error code from backend response if available
    const errorCode = error.response?.data?.error || 'NETWORK_ERROR';
    return { success: false, error: errorCode };
  }
};

// Get all orders from API
const getOrders = async (filters = {}) => {
  try {
    if (!API) return { buyOrders: [], sellOrders: [] };

    const response = await axios.get(`${API}/orders`, { params: filters, timeout: 10000 });
    const orders = response.data || [];

    return {
      buyOrders: orders.filter(o => o.order_type === 'buy'),
      sellOrders: orders.filter(o => o.order_type === 'sell')
    };
  } catch (error) {
    console.error('Error getting orders:', error);
    return { buyOrders: [], sellOrders: [] };
  }
};

// Get approved sell orders (visible to all)
const getApprovedSellOrders = async () => {
  try {
    if (!API) return [];

    const response = await axios.get(`${API}/orders`, {
      params: { order_type: 'sell', status: 'approved' },
      timeout: 10000
    });
    return response.data || [];
  } catch (error) {
    console.error('Error getting approved sell orders:', error);
    return [];
  }
};

// Get pending sell orders (for admin)
const getPendingSellOrders = async () => {
  try {
    if (!API) return [];

    const response = await axios.get(`${API}/orders`, {
      params: { order_type: 'sell', status: 'pending' },
      timeout: 10000
    });
    return response.data || [];
  } catch (error) {
    console.error('Error getting pending sell orders:', error);
    return [];
  }
};

// Get server stats (how many selling on each server)
const getServerStats = async () => {
  try {
    if (!API) return {};

    const response = await axios.get(`${API}/orders/stats/servers`, {
      params: { project: 'GTA5RP' },
      timeout: 10000
    });
    const statsList = response.data || [];

    const stats = {};
    statsList.forEach(stat => {
      if (stat.server_id) {
        stats[stat.server_id] = {
          count: stat.total_sellers,
          totalAmount: stat.total_amount
        };
      }
    });

    return stats;
  } catch (error) {
    console.error('Error getting server stats:', error);
    return {};
  }
};

// Approve sell order (admin)
const approveSellOrder = async (orderId) => {
  try {
    if (!API) return null;

    const response = await axios.patch(`${API}/orders/${orderId}/approve`, {}, { timeout: 10000 });
    return response.data;
  } catch (error) {
    console.error('Error approving order:', error);
    return null;
  }
};

// Reject sell order (admin)
const rejectSellOrder = async (orderId) => {
  try {
    if (!API) return null;

    const response = await axios.patch(`${API}/orders/${orderId}/reject`, {}, { timeout: 10000 });
    return response.data;
  } catch (error) {
    console.error('Error rejecting order:', error);
    return null;
  }
};

// Update order (admin - edit amount)
const updateOrder = async (orderId, updates) => {
  try {
    if (!API) return null;

    const response = await axios.patch(`${API}/orders/${orderId}`, updates, { timeout: 10000 });
    return response.data;
  } catch (error) {
    console.error('Error updating order:', error);
    return null;
  }
};

// Delete order (admin)
const deleteOrder = async (orderId) => {
  try {
    if (!API) return false;

    await axios.delete(`${API}/orders/${orderId}`, { timeout: 10000 });
    return true;
  } catch (error) {
    console.error('Error deleting order:', error);
    return false;
  }
};

// ==========================================
// TELEGRAM NOTIFICATIONS
// ==========================================

// Send notification to admin bot with retry logic
const sendTelegramNotification = async (message, retries = 3) => {
  if (!BOT_TOKEN || !ADMIN_CHAT_ID) {
    console.warn('Telegram credentials not configured');
    return false;
  }

  for (let i = 0; i < retries; i++) {
    try {
      await axios.post(
        `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,
        {
          chat_id: ADMIN_CHAT_ID,
          text: sanitizeInput(message),
          parse_mode: 'HTML'
        },
        { timeout: 10000 }
      );
      return true;
    } catch (error) {
      console.warn(`Telegram notification attempt ${i + 1} failed:`, error.message);
      if (i === retries - 1) return false;
      await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
    }
  }
  return false;
};

// Notify about new buy order
const notifyNewBuyOrder = async (order, serverName) => {
  const formatAmount = (amount) => {
    if (amount >= 1000000) return `${(amount / 1000000).toFixed(1)}кк`;
    if (amount >= 1000) return `${(amount / 1000).toFixed(0)}к`;
    return amount.toString();
  };

  const message = `🛒 <b>НОВАЯ ЗАЯВКА НА ПОКУПКУ</b>

👤 Покупатель: @${order.username}
🎮 Сервер: <b>${serverName}</b>
💰 Количество: <b>${formatAmount(order.amount)}</b>
💵 К оплате: <b>${order.price} ₽</b>
🛡 Возврат: ${order.refund_enabled ? 'Да (до 45%)' : 'Нет (-40%)'}
📱 Контакт: ${order.contact || '@' + order.username}

✅ Заявка автоматически одобрена`;

  await sendTelegramNotification(message);
};

// Notify about new sell order (needs approval)
const notifyNewSellOrder = async (order, serverName) => {
  const formatAmount = (amount) => {
    if (amount >= 1000000) return `${(amount / 1000000).toFixed(1)}кк`;
    if (amount >= 1000) return `${(amount / 1000).toFixed(0)}к`;
    return amount.toString();
  };

  const message = `💰 <b>ЗАЯВКА НА ПРОДАЖУ (ожидает подтверждения)</b>

👤 Продавец: @${order.username}
🎮 Сервер: <b>${serverName}</b>
💰 Количество: <b>${formatAmount(order.amount)}</b>
💵 Выплата: <b>${order.price} ₽</b>
📱 Контакт: ${order.contact || '@' + order.username}

⏳ Требуется подтверждение в админ-панели`;

  await sendTelegramNotification(message);
};

// ==========================================
// USER INFO
// ==========================================

const getCurrentUser = () => {
  const tgUser = getTelegramUser();
  
  // Demo mode fallback for development only
  const isDemoMode = !tgUser.valid && (window.location.hostname === 'localhost' || process.env.NODE_ENV === 'development');
  
  const user = {
    userId: tgUser.valid ? tgUser.userId : (isDemoMode ? 'demo123' : null),
    username: tgUser.valid ? tgUser.username : (isDemoMode ? 'demo_user' : null),
    firstName: tgUser.valid ? tgUser.firstName : (isDemoMode ? 'Пользователь' : null),
    isAdmin: (tgUser.valid ? tgUser.username : (isDemoMode ? 'demo_user' : '')) === ADMIN_USERNAME,
    isTelegramUser: tgUser.valid,
    isDemoMode: isDemoMode
  };

  // Запоминаем пользователя локально для стабильной идентификации
  try {
    if (tgUser.valid) {
      localStorage.setItem(
        'tg_user',
        JSON.stringify({
          id: user.userId,
          username: user.username,
          firstName: user.firstName,
        }),
      );
    }
  } catch {
    // localStorage может быть недоступен — просто игнорируем
  }

  return user;
};

// Status Bar Component - Now Fixed
const StatusBar = () => {
  const [currentTime, setCurrentTime] = useState('');

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }));
    };
    updateTime();
    const interval = setInterval(updateTime, 60000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="phone-status-bar">
      <div className="status-left">
        <span className="status-time">{currentTime}</span>
      </div>
      <div className="status-notch"></div>
      <div className="status-right">
        <div className="status-signal">
          <div className="w-full h-full flex items-end justify-center gap-[2px]">
            <div className="w-[3px] h-[40%] bg-white rounded-full"></div>
            <div className="w-[3px] h-[60%] bg-white rounded-full"></div>
            <div className="w-[3px] h-[80%] bg-white rounded-full"></div>
            <div className="w-[3px] h-[100%] bg-white rounded-full"></div>
          </div>
        </div>
        <div className="status-wifi">
          <svg viewBox="0 0 18 18" fill="none" className="w-full h-full">
            <path d="M2 7c2.5-2.5 6.5-4 8-4s5.5 1.5 8 4M5 10c1.5-1.5 3.5-2 4-2s2.5 0.5 4 2M7.5 13.5c0.5-0.5 1-0.5 1.5-0.5s1 0 1.5 0.5"
              stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </div>
        <div className="status-battery">
          <div className="status-battery-level"></div>
        </div>
      </div>
    </div>
  );
};

// Phone Home Screen
const PhoneHomeScreen = () => {
  const navigate = useNavigate();

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="phone-home-screen"
      style={{
        backgroundImage: 'url(/phone_wallpaper.jpg)',
        backgroundSize: 'cover',
        backgroundPosition: 'center'
      }}
    >
      <StatusBar />

      <div className="app-grid">
        <motion.div
          initial={{ scale: 0, opacity: 0, rotate: -180 }}
          animate={{ scale: 1, opacity: 1, rotate: 0 }}
          transition={{
            duration: 0.5,
            ease: [0.25, 0.1, 0.25, 1],
            delay: 0.1
          }}
          className="app-icon app-icon-special"
          onClick={() => {
            sessionStorage.setItem('virty-entry-allowed', '1');
            navigate('/virty-app');
          }}
        >
          <div className="app-icon-bg bg-transparent shadow-none relative overflow-hidden">
            <motion.img
              src="/gta_logo_new.jpg"
              alt="GTA 5 RP Exchange"
              className="app-icon-image"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            />
            {/* Shimmer effect */}
            <motion.div
              className="absolute inset-0 bg-gradient-to-r from-transparent via-white to-transparent opacity-20"
              animate={{
                x: ['-100%', '200%']
              }}
              transition={{
                repeat: Infinity,
                duration: 3,
                ease: 'linear'
              }}
            />
          </div>
          <span className="app-name">GTA5RP</span>
        </motion.div>
      </div>

      {/* Enhanced Dock */}
      <div className="phone-dock">
        {['📞', '💬', '📷', '🌐'].map((emoji, index) => (
          <motion.div
            key={index}
            initial={{ y: 30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.05 * index, duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
            className={`dock-icon ${index === 0 ? 'bg-gradient-to-br from-green-500 to-green-600' :
              index === 1 ? 'bg-gradient-to-br from-green-400 to-green-500' :
                index === 2 ? 'bg-gradient-to-br from-gray-600 to-gray-700' :
                  'bg-gradient-to-br from-blue-500 to-blue-600'
              }`}
          >
            <span className="text-2xl">{emoji}</span>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
};

// Refund Info Tooltip Component
const RefundInfoTooltip = ({ onClose }) => {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="refund-tooltip-overlay"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.9, opacity: 0, y: 20 }}
        className="refund-tooltip-content"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="refund-tooltip-header">
          <Info className="w-6 h-6 text-blue-400" />
          <h3 className="refund-tooltip-title">Возврат до 45% при блокировке</h3>
        </div>

        <div className="refund-tooltip-body">
          <p className="refund-tooltip-text">
            <strong>Тебя забанили? Не беда, вернем до 45% от суммы покупки!</strong>
          </p>

          <p className="refund-tooltip-text">
            Скорее всего, покупая валюту у нас, вы никогда не получите бан, ведь мы делаем все возможное для того, чтобы сократить все риски к нулю.
          </p>

          <p className="refund-tooltip-text">
            К сожалению, никто не застрахован от банов за покупку/продажу виртуальной валюты, ведь это запрещено практически на всех проектах.
          </p>

          <p className="refund-tooltip-text">
            <strong>Как получить деньги обратно при бане:</strong>
          </p>

          <ol className="refund-tooltip-list">
            <li>Пришли нам в личные сообщения скриншот о блокировке аккаунта (фейковые скрины не принимаем!)</li>
            <li>Напиши на форум своего проекта запрос с просьбой доказательств блокировки, нам понадобится скриншот ответа поддержки</li>
            <li>Приложи чек об оплате виртуальной валюты в нашем магазине (скриншот должен быть разборчив, без коррекций, актуально двое суток с момента покупки)</li>
          </ol>
        </div>

        <button className="refund-tooltip-close" onClick={onClose}>
          Понятно
        </button>
      </motion.div>
    </motion.div>
  );
};

// Main Exchange App Screen
const VirtyExchangeApp = () => {
  const navigate = useNavigate();
  const { isAdmin } = getCurrentUser();
  const [stats, setStats] = useState({
    activeDeals: 156,
    totalServers: 23,
    satisfiedUsers: 1240
  });

  // Show refund tooltip only on first launch
  const [showRefundTooltip, setShowRefundTooltip] = useState(() => {
    const hasSeenTooltip = localStorage.getItem('hasSeenRefundTooltip');
    return !hasSeenTooltip;
  });

  const handleCloseTooltip = () => {
    setShowRefundTooltip(false);
    localStorage.setItem('hasSeenRefundTooltip', 'true');
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
      className="virty-app-container"
    >
      <StatusBar />

      {/* Header with centered title */}
      <div className="virty-app-header-enhanced">
        <motion.button
          onClick={() => navigate('/')}
          className="virty-back-btn"
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          <ArrowLeft className="w-6 h-6" />
        </motion.button>
        <h1 className="virty-app-title">GTA5RP</h1>
      </div>

      <div className="virty-app-content">
        {/* Hero Section */}
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.1 }}
          className="virty-hero-section"
        >
          <h2 className="virty-welcome-modern">Магазин виртов Патрика</h2>
        </motion.div>

        {/* Action Cards – две главные кнопки подряд, на всю ширину */}
        <div className="action-cards-grid">
          <Link to="/buy-virty" className="action-card-link action-card-link-full">
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1, duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
              className="action-card action-card-buy"
              whileTap={{ scale: 0.98 }}
            >
              <div className="action-card-icon">
                <TrendingUp size={32} strokeWidth={2} />
              </div>
              <div className="action-card-content">
                <h3 className="action-card-title">Купить Вирты</h3>
              </div>
              <ChevronRight size={22} strokeWidth={2} className="action-card-arrow" />
            </motion.div>
          </Link>

          <Link to="/sell-virty" className="action-card-link action-card-link-full">
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15, duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
              className="action-card action-card-sell"
              whileTap={{ scale: 0.98 }}
            >
              <div className="action-card-icon">
                <TrendingDown size={32} strokeWidth={2} />
              </div>
              <div className="action-card-content">
                <h3 className="action-card-title">Продать Вирты</h3>
              </div>
              <ChevronRight size={22} strokeWidth={2} className="action-card-arrow" />
            </motion.div>
          </Link>

          <Link to="/my-orders" className="action-card-link action-card-link-full">
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
              className="action-card action-card-neutral"
              whileTap={{ scale: 0.98 }}
            >
              <div className="action-card-icon">
                <ShoppingBag size={32} strokeWidth={2} />
              </div>
              <div className="action-card-content">
                <h3 className="action-card-title">Мои заявки</h3>
              </div>
              <ChevronRight size={22} strokeWidth={2} className="action-card-arrow" />
            </motion.div>
          </Link>

          {isAdmin && (
            <Link to="/admin" className="action-card-link action-card-link-full">
              <motion.div
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.25, duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
                className="action-card"
                whileTap={{ scale: 0.98 }}
              >
                <div className="action-card-icon">
                  <Settings size={32} strokeWidth={2} />
                </div>
                <div className="action-card-content">
                  <h3 className="action-card-title">Админ-панель</h3>
                </div>
                <ChevronRight size={22} strokeWidth={2} className="action-card-arrow" />
              </motion.div>
            </Link>
          )}
        </div>

        {/* Stats Grid - Removed */}

        {/* Features - Moved to bottom */}

      </div>

      {/* Refund Info Tooltip */}
      <AnimatePresence>
        {showRefundTooltip && (
          <RefundInfoTooltip onClose={handleCloseTooltip} />
        )}
      </AnimatePresence>
    </motion.div>
  );
};

// Server Selection with Enhanced UI
const ServerSelection = ({ type }) => {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [serverStats, setServerStats] = useState({});
  const [statsLoading, setStatsLoading] = useState(true);

  // Load server statistics for buy type
  useEffect(() => {
    const loadStats = async () => {
      if (type === 'buy') {
        setStatsLoading(true);
        const stats = await getServerStats();
        setServerStats(stats);
        setStatsLoading(false);
      } else {
        setStatsLoading(false);
      }
    };
    loadStats();
  }, [type]);

  const filteredServers = SERVERS
    .filter(server => server.name.toLowerCase().includes(searchTerm.toLowerCase()));

  const formatServerStats = (serverId) => {
    const stats = serverStats[serverId];
    if (!stats || stats.count === 0) {
      return '0 чел, 0кк';
    }
    const kk = Math.floor(stats.totalAmount / 1000000);
    return `${stats.count} чел, ${kk}кк`;
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
      className="virty-app-container"
    >
      <StatusBar />

      <div className="virty-app-header-enhanced">
        <motion.button
          onClick={() => navigate('/virty-app')}
          className="virty-back-btn"
          whileTap={{ scale: 0.9 }}
        >
          <ArrowLeft className="w-6 h-6" />
        </motion.button>
        <h1 className="virty-app-title">
          {type === 'buy' ? 'Купить вирты' : 'Продать вирты'}
        </h1>
      </div>

      <div className="virty-app-content">
        {/* Search only */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
          className="search-filter-section"
        >
          <div className="search-box">
            <span className="search-icon-wrap" aria-hidden>
              <Search size={20} strokeWidth={2} className="search-icon" />
            </span>
            <input
              type="text"
              placeholder="Поиск сервера..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="search-input"
            />
            {searchTerm && (
              <motion.button
                type="button"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                onClick={() => setSearchTerm('')}
                className="search-clear"
                aria-label="Очистить поиск"
              >
                <X size={18} strokeWidth={2} />
              </motion.button>
            )}
          </div>
        </motion.div>

        {/* Server List */}
        <div className="server-list-modern">
          <AnimatePresence>
            {filteredServers.map((server, index) => {
              const to = type === 'buy' ? `/buy-virty/server/${server.id}` : `/sell-virty/server/${server.id}`;
              return (
                <Link key={server.id} to={to} className="server-card-link">
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ delay: index * 0.03, duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
                    className="server-card-modern"
                    whileTap={{ scale: 0.98 }}
                  >
                    <div className="server-card-header-modern">
                      <div className="server-info">
                        <h3 className="server-name-modern">{server.name}</h3>
                        {type === 'buy' && !statsLoading && (
                          <span className="server-stats-static">{formatServerStats(server.id)}</span>
                        )}
                        {type === 'buy' && statsLoading && (
                          <span className="server-stats-static">⏳...</span>
                        )}
                        <span className={`server-badge-modern ${type === 'buy' ? 'badge-buy' : 'badge-sell'}`}>
                          {type === 'buy' ? 'Покупка' : 'Продажа'}
                        </span>
                      </div>
                      <ChevronRight size={20} strokeWidth={2} className="server-arrow" />
                    </div>

                    <div className="server-pricing-modern">
                      <div className="price-block">
                        <span className="price-label-modern">Цена за 1млн</span>
                        <span className="price-value-modern">
                          {type === 'buy' ? server.sellPrice : server.buyPrice} ₽
                        </span>
                      </div>
                    </div>
                  </motion.div>
                </Link>
              );
            })}
          </AnimatePresence>

          {filteredServers.length === 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="no-results"
            >
              <Search size={48} strokeWidth={2} className="w-12 h-12 text-gray-600 mb-3" />
              <p className="text-gray-400">Серверы не найдены</p>
              <p className="text-gray-600 text-sm mt-2">Попробуйте изменить запрос</p>
            </motion.div>
          )}
        </div>
      </div>
    </motion.div>
  );
};

// Buy Flow with Refund Toggle - IMPROVED STABILITY
const BuyVirtyFlow = () => {
  const navigate = useNavigate();
  const { id: serverId } = useParams();

  // Validate server ID immediately
  if (!validateServerId(serverId)) {
    return (
      <div className="virty-app-container flex items-center justify-center">
        <StatusBar />
        <div className="text-center p-6">
          <XCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <p className="text-white text-lg mb-4">Некорректный ID сервера</p>
          <button
            onClick={() => navigate('/buy-virty')}
            className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
          >
            Вернуться к списку
          </button>
        </div>
      </div>
    );
  }

  const server = SERVERS.find(s => s.id === parseInt(serverId));
  const [amount, setAmount] = useState(500000);
  const [contact, setContact] = useState('');
  const [loading, setLoading] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [existingReservation, setExistingReservation] = useState(null);
  const [refundEnabled, setRefundEnabled] = useState(true);
  const [availableVirty, setAvailableVirty] = useState(null);
  const [isReservationOnly, setIsReservationOnly] = useState(false);

  useEffect(() => {
    if (!API) return;

    const checkExisting = async () => {
      const tg = window.Telegram?.WebApp;
      const userId = tg?.initDataUnsafe?.user?.id?.toString() || 'demo123';

      const data = await safeApiCall(() => axios.get(`${API}/reservations/check/${serverId}/${userId}`));
      if (data) {
        setExistingReservation(data);
        setAmount(data.amount);
        setContact(data.contact || '');
        setRefundEnabled(data.refund_enabled !== false);
      }
    };

    const checkAvailability = async () => {
      const data = await safeApiCall(() => axios.get(`${API}/contributions/available/${serverId}`));
      if (data) {
        setAvailableVirty(data);
        setIsReservationOnly(!data.available);
      }
    };

    checkExisting();
    checkAvailability();
  }, [serverId]);

  if (!server) {
    return (
      <div className="virty-app-container flex items-center justify-center">
        <StatusBar />
        <div className="text-center p-6">
          <XCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <p className="text-white text-lg mb-4">Сервер не найден</p>
          <button
            onClick={() => navigate('/buy-virty')}
            className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
          >
            Вернуться к списку
          </button>
        </div>
      </div>
    );
  }

  const formatAmount = (amount) => {
    if (amount >= 1000000) {
      return `${(amount / 1000000).toFixed(1)}кк`;
    }
    return amount.toString();
  };

  const basePrice = (amount / 1000000) * server.sellPrice;
  const discount = refundEnabled ? 0 : basePrice * 0.40; // 40% скидка без возврата
  const totalPrice = (basePrice - discount).toFixed(2);

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Double-click protection - prevent if already loading
    if (loading) {
      return;
    }

    // Validate amount
    if (!validateAmount(amount)) {
      toast.error(getErrorMessage('INVALID_AMOUNT'));
      return;
    }

    // Strict Telegram user validation
    const user = getCurrentUser();
    if (!user.userId) {
      toast.error(getErrorMessage('NO_TELEGRAM_USER'));
      return;
    }

    setLoading(true);

    try {
      // Create buy order through unified backend API
      const result = await createOrder({
        type: 'buy',
        serverId: server.id,
        userId: user.userId,
        username: user.username,
        amount,
        totalPrice: parseFloat(totalPrice),
        contact: contact || '@' + user.username,
        refundEnabled
      });

      if (!result.success) {
        toast.error(getErrorMessage(result.error));
        return;
      }

      // Send notification to admin (non-blocking, ignore errors)
      notifyNewBuyOrder(result.data, server.name).catch(() => {});

      toast.success('Заявка на покупку создана!');
      setShowSuccess(true);
      setTimeout(() => {
        navigate('/virty-app');
      }, 3000);
    } catch (error) {
      console.error('Error submitting reservation:', error);
      toast.error(getErrorMessage('CREATE_FAILED'));
    } finally {
      setLoading(false);
    }
  };

  if (showSuccess) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="virty-app-container"
      >
        <StatusBar />
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
          className="success-screen"
        >
          <CheckCircle className="w-20 h-20 text-green-500 mb-4" />
          <h2 className="text-2xl font-bold mb-2">Успешно!</h2>
          <p className="text-gray-400 mb-4">
            Ваша заявка {existingReservation ? 'обновлена' : 'принята'}
          </p>
          <div className="success-details">
            <div className="detail-row">
              <span className="detail-label">Сервер:</span>
              <span className="detail-value">{server.name}</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Количество:</span>
              <span className="detail-value">{formatAmount(amount)}</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">К оплате:</span>
              <span className="detail-value text-green-400">{parseFloat(totalPrice).toLocaleString('ru-RU')} ₽</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Возврат при бане:</span>
              <span className="detail-value">{refundEnabled ? 'До 45%' : 'Нет'}</span>
            </div>
          </div>
        </motion.div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
      className="virty-app-container"
    >
      <StatusBar />

      <div className="virty-app-header-enhanced">
        <motion.button
          onClick={() => navigate('/buy-virty')}
          className="virty-back-btn"
          whileTap={{ scale: 0.9 }}
        >
          <ArrowLeft className="w-6 h-6" />
        </motion.button>
        <h1 className="virty-app-title">Покупка виртов</h1>
      </div>

      <div className="virty-app-content pb-6">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
          className="server-info-card"
        >
          <div className="server-info-header">
            <div className="server-info-title-row">
              <h3 className="server-info-title">{server.name}</h3>
              <span className="server-stats-static">0 чел, 0кк</span>
            </div>
            <span className="server-info-badge badge-buy">Покупка</span>
          </div>
          <div className="server-info-price">
            <div className="price-main">
              <span className="price-value-large">{server.sellPrice} ₽</span>
              <span className="price-unit">за 1 млн виртов</span>
            </div>
          </div>
          {existingReservation && (
            <div className="mt-3 text-sm text-yellow-400 flex items-center gap-2">
              <Info className="w-4 h-4" />
              <span>Редактирование существующей заявки</span>
            </div>
          )}
          {isReservationOnly && (
            <div className="mt-3 text-sm text-orange-400 flex items-center gap-2">
              <Clock className="w-4 h-4" />
              <span>Виртов нет в наличии - только бронирование</span>
            </div>
          )}
        </motion.div>

        <form onSubmit={handleSubmit} className="transaction-form">
          {/* Refund Toggle */}
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.1 }}
            className="refund-toggle-card"
          >
            <div className="refund-toggle-header">
              <div className="refund-toggle-info">
                <Shield className="w-5 h-5 text-blue-400" />
                <div>
                  <h4 className="refund-toggle-title">Возврат средств при блокировке</h4>
                  <p className="refund-toggle-subtitle">
                    {refundEnabled ? 'До 45% от суммы покупки' : 'Скидка 40% без возврата'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setRefundEnabled(!refundEnabled)}
                className={`refund-toggle-switch ${refundEnabled ? 'active' : ''}`}
              >
                <span className="refund-toggle-slider"></span>
              </button>
            </div>
            {!refundEnabled && (
              <div className="refund-discount-info">
                <Gift className="w-4 h-4 text-green-400" />
                <span>Экономия: {discount.toFixed(2)} ₽</span>
              </div>
            )}
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15, duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
            className="form-section"
          >
            <label className="form-label-modern">
              <Wallet className="w-4 h-4" />
              Количество виртов для покупки
            </label>

            <div className="slider-container">
              <div className="slider-value-display">
                <span className="text-3xl font-bold text-white">{formatAmount(amount)}</span>
                <span className="text-sm text-gray-400">{amount.toLocaleString('ru-RU')} виртов</span>
              </div>

              <input
                type="range"
                min="500000"
                max="100000000"
                step="100000"
                value={amount}
                onChange={(e) => setAmount(parseInt(e.target.value))}
                className="modern-slider"
              />

              <div className="slider-labels">
                <span className="text-xs text-gray-500">500к</span>
                <span className="text-xs text-gray-500">100кк</span>
              </div>
            </div>

            <p className="form-hint-modern">
              <Info className="w-3 h-3" />
              Выберите нужное количество виртов
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
            className="form-section"
          >
            <label className="form-label-modern">
              <Users className="w-4 h-4" />
              Контакт для связи
              <span className="text-gray-500 text-xs ml-2">(опционально)</span>
            </label>
            <input
              type="text"
              value={contact}
              onChange={(e) => setContact(e.target.value.slice(0, 100))}
              placeholder="@username или Discord"
              className="form-input-modern"
              maxLength={100}
            />
            <p className="form-hint-modern mt-1">
              <Info className="w-3 h-3" />
              Укажите, как с вами связаться
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25, duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
            className="total-card"
          >
            <div className="total-header">
              <Wallet className="w-5 h-5 text-gray-400" />
              <span className="total-label">Итого к оплате</span>
            </div>
            <div className="total-amount">
              <span className="total-value-large">
                {parseFloat(totalPrice).toLocaleString('ru-RU', { maximumFractionDigits: 2 })} ₽
              </span>
            </div>
            <div className="total-breakdown">
              <span className="breakdown-text">
                {formatAmount(amount)} × {server.sellPrice} ₽/млн
                {!refundEnabled && ` - ${discount.toFixed(2)} ₽ скидка`}
              </span>
            </div>
          </motion.div>

          <motion.button
            type="submit"
            disabled={loading}
            className="submit-btn-modern submit-btn-buy"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.5 }}
          >
            {loading ? (
              <>
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
                  className="w-5 h-5 border-2 border-white border-t-transparent rounded-full"
                />
                <span>Обработка...</span>
              </>
            ) : (
              <>
                {isReservationOnly ? (
                  <>
                    <Clock className="w-5 h-5" />
                    <span>{existingReservation ? 'Обновить бронь' : 'Забронировать'}</span>
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-5 h-5" />
                    <span>{existingReservation ? 'Обновить заявку' : 'Оформить покупку'}</span>
                  </>
                )}
              </>
            )}
          </motion.button>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6 }}
            className="info-note"
          >
            <Info className="w-4 h-4 text-blue-400" />
            <p className="info-note-text">
              После {existingReservation ? 'обновления' : 'проверки'} заявки менеджер свяжется с вами для передачи виртов и оплаты
            </p>
          </motion.div>
        </form>
      </div>
    </motion.div>
  );
};

// Sell Flow - IMPROVED STABILITY
const SellVirtyFlow = () => {
  const navigate = useNavigate();
  const { id: serverId } = useParams();

  // Validate server ID immediately
  if (!validateServerId(serverId)) {
    return (
      <div className="virty-app-container flex items-center justify-center">
        <StatusBar />
        <div className="text-center p-6">
          <XCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <p className="text-white text-lg mb-4">Некорректный ID сервера</p>
          <button
            onClick={() => navigate('/sell-virty')}
            className="px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
          >
            Вернуться к списку
          </button>
        </div>
      </div>
    );
  }

  const server = SERVERS.find(s => s.id === parseInt(serverId));
  const [amount, setAmount] = useState(1000000);
  const [contact, setContact] = useState('');
  const [loading, setLoading] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [existingContribution, setExistingContribution] = useState(null);

  useEffect(() => {
    if (!API) return;

    const checkExisting = async () => {
      const tg = window.Telegram?.WebApp;
      const userId = tg?.initDataUnsafe?.user?.id?.toString() || 'demo123';

      const data = await safeApiCall(() => axios.get(`${API}/contributions/check/${serverId}/${userId}`));
      if (data) {
        setExistingContribution(data);
        setAmount(data.amount);
        setContact(data.contact || '');
      }
    };

    checkExisting();
  }, [serverId]);

  if (!server) {
    return (
      <div className="virty-app-container flex items-center justify-center">
        <StatusBar />
        <div className="text-center p-6">
          <XCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <p className="text-white text-lg mb-4">Сервер не найден</p>
          <button
            onClick={() => navigate('/sell-virty')}
            className="px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
          >
            Вернуться к списку
          </button>
        </div>
      </div>
    );
  }

  const formatAmount = (amount) => {
    if (amount >= 1000000) {
      return `${(amount / 1000000).toFixed(1)}кк`;
    }
    return amount.toString();
  };

  const totalPrice = ((amount / 1000000) * server.buyPrice).toFixed(2);

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Double-click protection - prevent if already loading
    if (loading) {
      return;
    }

    // Validate amount
    if (!validateAmount(amount)) {
      toast.error(getErrorMessage('INVALID_AMOUNT'));
      return;
    }

    // Strict Telegram user validation
    const user = getCurrentUser();
    if (!user.userId) {
      toast.error(getErrorMessage('NO_TELEGRAM_USER'));
      return;
    }

    setLoading(true);

    try {
      // Create sell order through unified backend API (requires approval)
      const result = await createOrder({
        type: 'sell',
        serverId: server.id,
        userId: user.userId,
        username: user.username,
        amount,
        totalPrice: parseFloat(totalPrice),
        contact: contact || '@' + user.username,
        refundEnabled: true
      });

      if (!result.success) {
        toast.error(getErrorMessage(result.error));
        return;
      }

      // Send notification to admin for approval (non-blocking)
      notifyNewSellOrder(result.data, server.name).catch(() => {});

      toast.success('Заявка на продажу отправлена на модерацию!');
      setShowSuccess(true);
      setTimeout(() => {
        navigate('/virty-app');
      }, 3000);
    } catch (error) {
      console.error('Error submitting contribution:', error);
      toast.error(getErrorMessage('CREATE_FAILED'));
    } finally {
      setLoading(false);
    }
  };

  if (showSuccess) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="virty-app-container"
      >
        <StatusBar />
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
          className="success-screen"
        >
          <Clock className="w-20 h-20 text-yellow-500 mb-4" />
          <h2 className="text-2xl font-bold mb-2">На модерации</h2>
          <p className="text-gray-400 mb-4">
            Заявка отправлена на проверку администратору
          </p>
          <div className="success-details">
            <div className="detail-row">
              <span className="detail-label">Сервер:</span>
              <span className="detail-value">{server.name}</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Количество:</span>
              <span className="detail-value">{formatAmount(amount)}</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Вы получите:</span>
              <span className="detail-value text-green-400">{parseFloat(totalPrice).toLocaleString('ru-RU')} ₽</span>
            </div>
          </div>
        </motion.div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
      className="virty-app-container"
    >
      <StatusBar />

      <div className="virty-app-header-enhanced">
        <motion.button
          onClick={() => navigate('/sell-virty')}
          className="virty-back-btn"
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          <ArrowLeft className="w-6 h-6" />
        </motion.button>
        <h1 className="virty-app-title">Продажа виртов</h1>
      </div>

      <div className="virty-app-content pb-6">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
          className="server-info-card"
        >
          <div className="server-info-header">
            <div className="server-info-title-row">
              <h3 className="server-info-title">{server.name}</h3>
              <span className="server-stats-static">0 чел, 0кк</span>
            </div>
            <span className="server-info-badge badge-sell">Продажа</span>
          </div>
          <div className="server-info-price">
            <div className="price-main">
              <span className="price-value-large">{server.buyPrice} ₽</span>
              <span className="price-unit">за 1 млн виртов</span>
            </div>
          </div>
          {existingContribution && (
            <div className="mt-3 text-sm text-yellow-400 flex items-center gap-2">
              <Info className="w-4 h-4" />
              <span>Редактирование существующей заявки</span>
            </div>
          )}
        </motion.div>

        <form onSubmit={handleSubmit} className="transaction-form">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1, duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
            className="form-section"
          >
            <label className="form-label-modern">
              <Wallet className="w-4 h-4" />
              Количество виртов для продажи
            </label>

            <div className="slider-container">
              <div className="slider-value-display">
                <span className="text-3xl font-bold text-white">{formatAmount(amount)}</span>
                <span className="text-sm text-gray-400">{amount.toLocaleString('ru-RU')} виртов</span>
              </div>

              <input
                type="range"
                min="1000000"
                max="100000000"
                step="100000"
                value={amount}
                onChange={(e) => setAmount(parseInt(e.target.value))}
                className="modern-slider modern-slider-sell"
              />

              <div className="slider-labels">
                <span className="text-xs text-gray-500">1кк</span>
                <span className="text-xs text-gray-500">100кк</span>
              </div>
            </div>

            <p className="form-hint-modern">
              <Info className="w-3 h-3" />
              Ваши вирты будут добавлены в пул сервера
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15, duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
            className="form-section"
          >
            <label className="form-label-modern">
              <Users className="w-4 h-4" />
              Контакт для связи
              <span className="text-gray-500 text-xs ml-2">(опционально)</span>
            </label>
            <input
              type="text"
              value={contact}
              onChange={(e) => setContact(e.target.value.slice(0, 100))}
              placeholder="@username или Discord"
              className="form-input-modern"
              maxLength={100}
            />
            <p className="form-hint-modern mt-1">
              <Info className="w-3 h-3" />
              Укажите, как с вами связаться
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
            className="total-card total-card-sell"
          >
            <div className="total-header">
              <Wallet className="w-5 h-5 text-gray-400" />
              <span className="total-label">Вы получите</span>
            </div>
            <div className="total-amount">
              <span className="total-value-large">
                {parseFloat(totalPrice).toLocaleString('ru-RU', { maximumFractionDigits: 2 })} ₽
              </span>
            </div>
            <div className="total-breakdown">
              <span className="breakdown-text">
                {formatAmount(amount)} × {server.buyPrice} ₽/млн
              </span>
            </div>
          </motion.div>

          <motion.button
            type="submit"
            disabled={loading}
            className="submit-btn-modern submit-btn-sell"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.4 }}
          >
            {loading ? (
              <>
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
                  className="w-5 h-5 border-2 border-white border-t-transparent rounded-full"
                />
                <span>Сохранение...</span>
              </>
            ) : (
              <>
                <CheckCircle className="w-5 h-5" />
                <span>{existingContribution ? 'Обновить заявку' : 'Добавить в пул'}</span>
              </>
            )}
          </motion.button>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="info-note"
          >
            <Info className="w-4 h-4 text-blue-400" />
            <p className="info-note-text">
              После {existingContribution ? 'обновления' : 'проверки'} заявки менеджер свяжется с вами для передачи виртов и оплаты
            </p>
          </motion.div>
        </form>
      </div>
    </motion.div>
  );
};

// My Orders Management Page
const MyOrdersPage = () => {
  const navigate = useNavigate();
  const [myOrders, setMyOrders] = useState({ buy: [], sell: [] });
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState(null);

  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    const userId = tg?.initDataUnsafe?.user?.id || 0;
    const username = tg?.initDataUnsafe?.user?.username || 'demo_user';
    setCurrentUser({ userId, username });

    const loadOrders = async () => {
      if (!API) {
        setLoading(false);
        return;
      }

      try {
        // Get all orders for this user from unified API
        const response = await axios.get(`${API}/orders`, {
          params: { user_id: userId, source: 'webapp' },
          timeout: 10000
        });

        const orders = response.data || [];
        setMyOrders({
          buy: orders.filter(o => o.order_type === 'buy'),
          sell: orders.filter(o => o.order_type === 'sell')
        });
      } catch (error) {
        console.error('Error loading orders:', error);
      } finally {
        setLoading(false);
      }
    };

    loadOrders();
  }, []);

  const handleDeleteOrder = async (orderId, orderType) => {
    if (!window.confirm(`Удалить эту заявку на ${orderType === 'buy' ? 'покупку' : 'продажу'}?`)) return;

    if (!API) {
      // Local mode
      setMyOrders(prev => ({
        ...prev,
        [orderType]: prev[orderType].filter(o => o.id !== orderId)
      }));
      toast.success('Заявка удалена');
      return;
    }

    try {
      const success = await deleteOrder(orderId); // Assuming deleteOrder is defined elsewhere and handles the API call
      if (success) {
        toast.success('Заявка удалена');
        setMyOrders(prev => ({
          ...prev,
          [orderType]: prev[orderType].filter(o => o.id !== orderId)
        }));
      } else {
        toast.error('Ошибка удаления заявки');
      }
    } catch (error) {
      console.error('Error deleting order:', error);
      toast.error('Ошибка удаления заявки');
    }
  };

  const formatAmount = (amount) => {
    if (amount >= 1000000) {
      return `${(amount / 1000000).toFixed(1)}кк`;
    }
    return amount.toString();
  };

  const getServerName = (serverId) => {
    const server = SERVERS.find(s => s.id === serverId);
    return server ? server.name : `Сервер #${serverId}`;
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
      className="virty-app-container"
    >
      <StatusBar />

      <div className="virty-app-header-enhanced">
        <motion.button
          onClick={() => navigate('/virty-app')}
          className="virty-back-btn"
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          <ArrowLeft className="w-6 h-6" />
        </motion.button>
        <h1 className="virty-app-title">Мои заявки</h1>
      </div>

      <div className="virty-app-content" style={{ paddingBottom: '100px' }}>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
              className="w-8 h-8 border-2 border-green-500 border-t-transparent rounded-full"
            />
          </div>
        ) : (
          <>
            {/* Buy Orders */}
            <div className="mb-6">
              <h2 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-green-400" />
                Покупка виртов ({myOrders.buy.length})
              </h2>
              {myOrders.buy.length === 0 ? (
                <p className="text-gray-400 text-sm">Нет активных заявок на покупку</p>
              ) : (
                <div className="space-y-3">
                  {myOrders.buy.map((order) => (
                    <motion.div
                      key={order.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="bg-gray-800 rounded-lg p-4"
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <h3 className="text-white font-medium">{getServerName(order.server_id)}</h3>
                          <p className="text-gray-400 text-sm">Количество: {formatAmount(order.amount)}</p>
                          <p className="text-gray-400 text-sm">Цена: {order.price} ₽</p>
                          <p className="text-gray-500 text-xs mt-1">
                            Создал: @{order.username}
                          </p>
                        </div>
                        <button
                          onClick={() => handleDeleteOrder(order.id, 'buy')}
                          className="text-red-400 hover:text-red-300 transition-colors"
                        >
                          <X className="w-5 h-5" />
                        </button>
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        <span className={`px-2 py-1 rounded ${order.status === 'pending' ? 'bg-yellow-900 text-yellow-300' : 'bg-green-900 text-green-300'}`}>
                          {order.status === 'pending' ? 'В обработке' : 'Одобрено'}
                        </span>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </div>

            {/* Sell Orders */}
            <div>
              <h2 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
                <TrendingDown className="w-5 h-5 text-red-400" />
                Продажа виртов ({myOrders.sell.length})
              </h2>
              {myOrders.sell.length === 0 ? (
                <p className="text-gray-400 text-sm">Нет активных заявок на продажу</p>
              ) : (
                <div className="space-y-3">
                  {myOrders.sell.map((order) => (
                    <motion.div
                      key={order.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="bg-gray-800 rounded-lg p-4"
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <h3 className="text-white font-medium">{getServerName(order.server_id)}</h3>
                          <p className="text-gray-400 text-sm">Количество: {formatAmount(order.amount)}</p>
                          <p className="text-gray-400 text-sm">Цена: {order.price} ₽</p>
                          <p className="text-gray-500 text-xs mt-1">
                            Создал: @{order.username}
                          </p>
                        </div>
                        <button
                          onClick={() => handleDeleteOrder(order.id, 'sell')}
                          className="text-red-400 hover:text-red-300 transition-colors"
                        >
                          <X className="w-5 h-5" />
                        </button>
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        <span className={`px-2 py-1 rounded ${order.status === 'approved' ? 'bg-green-900 text-green-300' : 'bg-yellow-900 text-yellow-300'}`}>
                          {order.status === 'approved' ? 'Одобрено' : 'В обработке'}
                        </span>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </motion.div>
  );
};

// Admin Panel - Full order management for @patrickprodast
const AdminPanel = () => {
  const navigate = useNavigate();
  const { isAdmin } = getCurrentUser();
  const [activeTab, setActiveTab] = useState('pending'); // 'pending', 'buy', 'sell'
  const [buyOrders, setBuyOrders] = useState([]);
  const [sellOrders, setSellOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [, forceUpdate] = useState(0);

  // Redirect non-admins
  useEffect(() => {
    if (!isAdmin) {
      navigate('/virty-app');
      toast.error('Доступ запрещен');
    }
  }, [isAdmin, navigate]);

  const normalizeOrder = (order) => ({
    ...order,
    serverName: order.server_name || order.serverName,
    totalPrice: order.price ?? order.totalPrice,
    refundEnabled: order.refund_enabled ?? order.refundEnabled,
  });

  // Load orders from API
  useEffect(() => {
    const loadOrders = async () => {
      const orders = await getOrders();
      setBuyOrders((orders.buyOrders || []).map(normalizeOrder));
      setSellOrders((orders.sellOrders || []).map(normalizeOrder));
      setLoading(false);
    };

    loadOrders();
    // Refresh every 3 seconds
    const interval = setInterval(loadOrders, 3000);
    return () => clearInterval(interval);
  }, []);

  const formatAmount = (amount) => {
    if (amount >= 1000000) return `${(amount / 1000000).toFixed(1)}кк`;
    if (amount >= 1000) return `${(amount / 1000).toFixed(0)}к`;
    return amount.toString();
  };

  const pendingSellOrders = sellOrders.filter(o => o.status === 'pending');
  const approvedSellOrders = sellOrders.filter(o => o.status === 'approved');

  // Delete order
  const handleDeleteOrder = async (type, id) => {
    if (!window.confirm('Удалить эту заявку?')) return;

    const ok = await deleteOrder(id);
    if (!ok) {
      toast.error('Не удалось удалить заявку');
      return;
    }

    if (type === 'buy') {
      setBuyOrders(prev => prev.filter(o => o.id !== id));
    } else {
      setSellOrders(prev => prev.filter(o => o.id !== id));
    }

    toast.success('Заявка удалена');
  };

  // Approve sell order
  const handleApproveOrder = async (id) => {
    const order = await approveSellOrder(id);
    if (!order) {
      toast.error('Не удалось одобрить заявку');
      return;
    }

    const normalizedOrder = normalizeOrder(order);
    setSellOrders(prev => prev.map(o =>
      o.id === id ? { ...o, status: 'approved', ...normalizedOrder } : o
    ));

    // Notify seller
    await sendTelegramNotification(
      `✅ <b>Заявка на продажу ОДОБРЕНА</b>\n\n` +
      `👤 Продавец: @${normalizedOrder.username}\n` +
      `🎮 Сервер: ${normalizedOrder.serverName}\n` +
      `💰 Количество: ${formatAmount(normalizedOrder.amount)}\n` +
      `💵 К выплате: ${normalizedOrder.totalPrice} ₽\n\n` +
      `Теперь заявка видна покупателям!`
    );

    toast.success('Заявка одобрена и видна покупателям');
  };

  // Reject sell order (just delete)
  const handleRejectOrder = async (id) => {
    const order = sellOrders.find(o => o.id === id);
    if (!order) return;

    const rejected = await rejectSellOrder(id);
    if (!rejected) {
      toast.error('Не удалось отклонить заявку');
      return;
    }

    setSellOrders(prev => prev.map(o =>
      o.id === id ? { ...o, status: 'rejected' } : o
    ));

    await sendTelegramNotification(
      `❌ <b>Заявка на продажу ОТКЛОНЕНА</b>\n\n` +
      `👤 Продавец: @${order.username}\n` +
      `🎮 Сервер: ${order.serverName}\n` +
      `💰 Количество: ${formatAmount(order.amount)}`
    );

    toast.success('Заявка отклонена');
  };

  const handleEditAmount = async (order) => {
    const currentAmountKK = (order.amount / 1000000).toFixed(1);
    const newAmountRaw = window.prompt('Введите новое количество виртов (в млн):', currentAmountKK);
    if (!newAmountRaw) return;
    const newAmountKK = Number(newAmountRaw.replace(',', '.'));
    if (!Number.isFinite(newAmountKK) || newAmountKK <= 0) {
      toast.error('Некорректное количество');
      return;
    }
    const newAmount = Math.round(newAmountKK * 1000000);

    const updated = await updateOrder(order.id, { amount: newAmount });
    if (!updated) {
      toast.error('Не удалось обновить количество');
      return;
    }

    const normalizedOrder = normalizeOrder(updated);
    if (normalizedOrder.order_type === 'buy') {
      setBuyOrders(prev => prev.map(o => o.id === order.id ? { ...o, ...normalizedOrder } : o));
    } else {
      setSellOrders(prev => prev.map(o => o.id === order.id ? { ...o, ...normalizedOrder } : o));
    }

    toast.success('Количество обновлено');
  };

  // Contact user
  const handleContactUser = (order) => {
    const contact = order.contact || '@' + order.username;
    const tgUsername = contact.startsWith('@') ? contact.slice(1) : order.username;
    window.open(`https://t.me/${tgUsername}`, '_blank');
    toast.success(`Открываем чат с ${contact}`);
  };

  if (!isAdmin) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
      className="virty-app-container"
    >
      <StatusBar />

      <div className="virty-app-header-enhanced">
        <motion.button
          onClick={() => navigate('/virty-app')}
          className="virty-back-btn"
          whileTap={{ scale: 0.9 }}
        >
          <ArrowLeft className="w-6 h-6" />
        </motion.button>
        <h1 className="virty-app-title">Админ-панель</h1>
      </div>

      <div className="virty-app-content" style={{ paddingBottom: '120px' }}>
        {/* Tabs */}
        <div className="admin-tabs">
          <button
            className={`admin-tab ${activeTab === 'pending' ? 'active' : ''}`}
            onClick={() => setActiveTab('pending')}
            style={pendingSellOrders.length > 0 ? { background: 'rgba(255, 149, 0, 0.3)' } : {}}
          >
            <Clock className="w-4 h-4" />
            Ожидают ({pendingSellOrders.length})
          </button>
          <button
            className={`admin-tab ${activeTab === 'buy' ? 'active' : ''}`}
            onClick={() => setActiveTab('buy')}
          >
            <TrendingUp className="w-4 h-4" />
            Покупки ({buyOrders.length})
          </button>
          <button
            className={`admin-tab ${activeTab === 'sell' ? 'active' : ''}`}
            onClick={() => setActiveTab('sell')}
          >
            <TrendingDown className="w-4 h-4" />
            Продажи ({approvedSellOrders.length})
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
              className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full"
            />
          </div>
        ) : (
          <>
            {/* Pending Sell Orders - Need Approval */}
            {activeTab === 'pending' && (
              <div className="space-y-3 mt-4">
                {pendingSellOrders.length === 0 ? (
                  <p className="text-gray-400 text-center py-8">Нет заявок на модерации</p>
                ) : (
                  pendingSellOrders.map((order, index) => (
                    <motion.div
                      key={order.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.03, duration: 0.3 }}
                      className="admin-order-card"
                      style={{ borderLeft: '3px solid #ff9500' }}
                    >
                      <div className="admin-order-header">
                        <div>
                          <h3 className="text-white font-semibold">{order.serverName}</h3>
                          <p className="text-gray-400 text-sm">@{order.username}</p>
                        </div>
                        <span className="admin-status pending">Ожидает</span>
                      </div>

                      <div className="admin-order-details">
                        <p className="text-white">
                          <span className="text-gray-400">Продаёт:</span> {formatAmount(order.amount)}
                        </p>
                        <p className="text-white">
                          <span className="text-gray-400">К выплате:</span> {order.totalPrice} ₽
                        </p>
                        <p className="text-white">
                          <span className="text-gray-400">Контакт:</span> {order.contact}
                        </p>
                      </div>

                      <div className="admin-order-actions">
                        <button onClick={() => handleContactUser(order)} className="admin-btn contact">
                          <Users className="w-4 h-4" /> Связаться
                        </button>
                        <button onClick={() => handleEditAmount(order)} className="admin-btn edit">
                          <Edit className="w-4 h-4" /> Кол-во
                        </button>
                        <button onClick={() => handleApproveOrder(order.id)} className="admin-btn approve">
                          <Check className="w-4 h-4" /> Одобрить
                        </button>
                        <button onClick={() => handleRejectOrder(order.id)} className="admin-btn reject">
                          <XCircle className="w-4 h-4" />
                        </button>
                      </div>
                    </motion.div>
                  ))
                )}
              </div>
            )}

            {/* Buy Orders (auto-approved) */}
            {activeTab === 'buy' && (
              <div className="space-y-3 mt-4">
                {buyOrders.length === 0 ? (
                  <p className="text-gray-400 text-center py-8">Нет заявок на покупку</p>
                ) : (
                  buyOrders.map((order, index) => (
                    <motion.div
                      key={order.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.03, duration: 0.3 }}
                      className="admin-order-card"
                    >
                      <div className="admin-order-header">
                        <div>
                          <h3 className="text-white font-semibold">{order.serverName}</h3>
                          <p className="text-gray-400 text-sm">@{order.username}</p>
                        </div>
                        <span className="admin-status approved">Активна</span>
                      </div>

                      <div className="admin-order-details">
                        <p className="text-white">
                          <span className="text-gray-400">Покупает:</span> {formatAmount(order.amount)}
                        </p>
                        <p className="text-white">
                          <span className="text-gray-400">К оплате:</span> {order.totalPrice} ₽
                        </p>
                        <p className="text-white">
                          <span className="text-gray-400">Возврат:</span> {order.refundEnabled ? 'Да (до 45%)' : 'Нет (-40%)'}
                        </p>
                        <p className="text-white">
                          <span className="text-gray-400">Контакт:</span> {order.contact}
                        </p>
                      </div>

                      <div className="admin-order-actions">
                        <button onClick={() => handleContactUser(order)} className="admin-btn contact">
                          <Users className="w-4 h-4" /> Связаться
                        </button>
                        <button onClick={() => handleEditAmount(order)} className="admin-btn edit">
                          <Edit className="w-4 h-4" /> Кол-во
                        </button>
                        <button onClick={() => handleDeleteOrder('buy', order.id)} className="admin-btn delete">
                          <Trash2 className="w-4 h-4" /> Удалить
                        </button>
                      </div>
                    </motion.div>
                  ))
                )}
              </div>
            )}

            {/* Approved Sell Orders */}
            {activeTab === 'sell' && (
              <div className="space-y-3 mt-4">
                {approvedSellOrders.length === 0 ? (
                  <p className="text-gray-400 text-center py-8">Нет одобренных продаж</p>
                ) : (
                  approvedSellOrders.map((order, index) => (
                    <motion.div
                      key={order.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.03, duration: 0.3 }}
                      className="admin-order-card"
                      style={{ borderLeft: '3px solid #34c759' }}
                    >
                      <div className="admin-order-header">
                        <div>
                          <h3 className="text-white font-semibold">{order.serverName}</h3>
                          <p className="text-gray-400 text-sm">@{order.username}</p>
                        </div>
                        <span className="admin-status approved">Одобрено</span>
                      </div>

                      <div className="admin-order-details">
                        <p className="text-white">
                          <span className="text-gray-400">Продаёт:</span> {formatAmount(order.amount)}
                        </p>
                        <p className="text-white">
                          <span className="text-gray-400">К выплате:</span> {order.totalPrice} ₽
                        </p>
                        <p className="text-white">
                          <span className="text-gray-400">Контакт:</span> {order.contact}
                        </p>
                      </div>

                      <div className="admin-order-actions">
                        <button onClick={() => handleContactUser(order)} className="admin-btn contact">
                          <Users className="w-4 h-4" /> Связаться
                        </button>
                        <button onClick={() => handleEditAmount(order)} className="admin-btn edit">
                          <Edit className="w-4 h-4" /> Кол-во
                        </button>
                        <button onClick={() => handleDeleteOrder('sell', order.id)} className="admin-btn delete">
                          <Trash2 className="w-4 h-4" /> Удалить
                        </button>
                      </div>
                    </motion.div>
                  ))
                )}
              </div>
            )}
          </>
        )}
      </div>
    </motion.div>
  );
};

// Routes wrapper: useLocation must be inside BrowserRouter; pass location so route changes render
function AppRoutes() {
  const location = useLocation();
  return (
    <ErrorBoundary key={location.pathname}>
      <AnimatePresence mode="wait">
        <Routes location={location} key={location.pathname}>
          <Route path="/" element={<PhoneHomeScreen />} />
          <Route
            path="/virty-app"
            element={
              sessionStorage.getItem('virty-entry-allowed') === '1'
                ? <VirtyExchangeApp />
                : <Navigate to="/" replace />
            }
          />
          <Route path="/buy-virty" element={<ServerSelection type="buy" />} />
          <Route path="/sell-virty" element={<ServerSelection type="sell" />} />
          <Route path="/buy-virty/server/:id" element={<BuyVirtyFlow />} />
          <Route path="/sell-virty/server/:id" element={<SellVirtyFlow />} />
          <Route path="/my-orders" element={<MyOrdersPage />} />
          <Route path="/admin" element={<AdminPanel />} />
          <Route path="*" element={
            <div className="virty-app-container flex items-center justify-center">
              <div className="text-center p-6">
                <XCircle className="w-16 h-16 text-yellow-500 mx-auto mb-4" />
                <p className="text-white text-lg mb-4">Страница не найдена</p>
                <button
                  onClick={() => window.location.href = '/'}
                  className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                >
                  На главную
                </button>
              </div>
            </div>
          } />
        </Routes>
      </AnimatePresence>
    </ErrorBoundary>
  );
}

// Main App Component
function App() {
  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    if (tg) {
      tg.ready();
      tg.expand();
    }

    const wallpaper = new Image();
    wallpaper.src = '/phone_wallpaper.jpg';
    const gtaLogo = new Image();
    gtaLogo.src = '/gta_logo_new.jpg';

    // Redirect to home screen if not already there
    if (window.location.pathname !== '/' && !sessionStorage.getItem('virty-entry-allowed')) {
      window.location.href = '/';
    }
  }, []);

  return (
    <div className="phone-frame">
      <div className="phone-screen">
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </div>
      <Toaster
        position="top-center"
        richColors
        toastOptions={{
          style: {
            background: 'rgba(0, 0, 0, 0.9)',
            border: '1px solid rgba(255, 215, 0, 0.3)',
            color: '#ffffff',
          },
        }}
      />
    </div>
  );
}

export default App;