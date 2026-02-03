#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Telegram бот для магазина игровых ресурсов с единой базой данных (MongoDB через API)
"""

import asyncio
import json
import logging
from datetime import datetime
from typing import Dict, List, Optional
import os
import aiohttp

from aiogram import Bot, Dispatcher, F, Router
from aiogram.filters import Command, CommandStart
from aiogram.types import (
    Message,
    CallbackQuery,
    InlineKeyboardMarkup,
    InlineKeyboardButton,
    FSInputFile,
)
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.fsm.storage.memory import MemoryStorage
from aiogram.enums import ParseMode
from aiogram.client.default import DefaultBotProperties

# Логирование
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Конфигурация
BOT_TOKEN = os.getenv("BOT_TOKEN", "8067623423:AAHO3QgV2ih5WDg0xupuykF7rIkqjDFuOic")
CHANNEL_ID = -1003778829727
SUPPORT_USERNAME = "patrickprodast"
ADMIN_USER_ID = int(os.getenv("ADMIN_USER_ID", "7858974852"))

# Backend API URL
API_BASE_URL = os.getenv("API_BASE_URL", "http://localhost:3001/api")

# Данные серверов и проектов
GTA5RP_SERVERS = {
    "DOWNTOWN": {"id": 1, "sellPrice": 690, "buyPrice": 320},
    "STRAWBERRY": {"id": 2, "sellPrice": 690, "buyPrice": 320},
    "VINEWOOD": {"id": 3, "sellPrice": 690, "buyPrice": 320},
    "BLACKBERRY": {"id": 4, "sellPrice": 720, "buyPrice": 334},
    "INSQUAD": {"id": 5, "sellPrice": 700, "buyPrice": 325},
    "SUNRISE": {"id": 6, "sellPrice": 800, "buyPrice": 372},
    "RAINBOW": {"id": 7, "sellPrice": 820, "buyPrice": 381},
    "RICHMAN": {"id": 8, "sellPrice": 790, "buyPrice": 367},
    "ECLIPSE": {"id": 9, "sellPrice": 420, "buyPrice": 195},
    "LA MESA": {"id": 10, "sellPrice": 740, "buyPrice": 344},
    "BURTON": {"id": 11, "sellPrice": 700, "buyPrice": 325},
    "ROCKFORD": {"id": 12, "sellPrice": 860, "buyPrice": 399},
    "ALTA": {"id": 13, "sellPrice": 840, "buyPrice": 390},
    "DEL PERRO": {"id": 14, "sellPrice": 750, "buyPrice": 348},
    "DAVIS": {"id": 15, "sellPrice": 790, "buyPrice": 367},
    "HARMONY": {"id": 16, "sellPrice": 650, "buyPrice": 302},
    "REDWOOD": {"id": 17, "sellPrice": 550, "buyPrice": 255},
    "HAWICK": {"id": 18, "sellPrice": 750, "buyPrice": 348},
    "GRAPESEED": {"id": 19, "sellPrice": 740, "buyPrice": 344},
    "MURRIETA": {"id": 20, "sellPrice": 580, "buyPrice": 269},
    "VESPUCCI": {"id": 21, "sellPrice": 460, "buyPrice": 213},
    "MILTON": {"id": 22, "sellPrice": 700, "buyPrice": 325},
    "LA PUERTA": {"id": 23, "sellPrice": 820, "buyPrice": 381},
}

MAJESTIC_SERVERS = {
    "Portland": {"sellPrice": 700, "buyPrice": 450},
    "Phoenix": {"sellPrice": 700, "buyPrice": 450},
    "Denver": {"sellPrice": 700, "buyPrice": 450},
    "Seattle": {"sellPrice": 700, "buyPrice": 450},
    "Atlanta": {"sellPrice": 700, "buyPrice": 450},
    "Chicago": {"sellPrice": 700, "buyPrice": 450},
    "San Francisco": {"sellPrice": 700, "buyPrice": 450},
    "Detroit": {"sellPrice": 700, "buyPrice": 450},
    "Washington": {"sellPrice": 700, "buyPrice": 450},
    "New York": {"sellPrice": 700, "buyPrice": 450},
    "Miami": {"sellPrice": 700, "buyPrice": 450},
    "San Diego": {"sellPrice": 700, "buyPrice": 450},
    "Los Angeles": {"sellPrice": 700, "buyPrice": 450},
    "Dallas": {"sellPrice": 700, "buyPrice": 450},
    "Boston": {"sellPrice": 700, "buyPrice": 450},
    "Houston": {"sellPrice": 700, "buyPrice": 450},
    "Las Vegas": {"sellPrice": 700, "buyPrice": 450},
}

PROJECTS = {
    "Majestic": {
        "name": "Majestic RP",
        "servers": list(MAJESTIC_SERVERS.keys()),
        "prices": MAJESTIC_SERVERS,
        "photo": "majestic.jpg"
    },
    "GTA5RP": {
        "name": "GTA 5 RP",
        "servers": list(GTA5RP_SERVERS.keys()),
        "prices": GTA5RP_SERVERS,
        "photo": "gta5rp.jpg"
    }
}

VIRT_AMOUNTS_KK = [1, 2, 3, 4, 5, 6, 7, 8, 10, 15, 20]

INFO_TEXTS = {
    "guarantees": """<b>🛡 Гарантии

Мы гарантируем:
• Безопасность всех сделок
• Проверку всех продавцов
• Возврат средств в случае обмана
• Поддержку 24/7

Все сделки проходят через гаранта!</b>""",
    "support": f"""<b>💬 Поддержка

Наша служба поддержки работает 24/7

Связь: @{SUPPORT_USERNAME}

Время ответа: до 30 минут</b>""",
    "rules": """<b>📋 Правила магазина

1. Запрещено использование читов и эксплойтов
2. Все сделки только через гаранта
3. При обмане - блокировка аккаунта
4. Уважительное отношение к другим пользователям
5. Запрещена продажа краденных аккаунтов

Нарушение правил ведет к блокировке!</b>"""
}

MENU_IMAGES = {
    "main": "main_menu.jpg",
    "projects": "projects_menu.jpg",
    "gta5rp": "gta5rp.jpg",
    "majestic": "majestic.jpg"
}

# FSM состояния
class UserStates(StatesGroup):
    selecting_action = State()
    selecting_project = State()
    selecting_server = State()
    selecting_amount = State()


# ==========================================
# API CLIENT (MongoDB через Backend)
# ==========================================

class APIClient:
    """Клиент для работы с Backend API"""
    
    def __init__(self, base_url: str):
        self.base_url = base_url
    
    async def create_order(self, order_data: dict) -> dict:
        """Создать заявку"""
        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(f"{self.base_url}/orders", json=order_data, timeout=10) as response:
                    if response.status == 200:
                        return await response.json()
                    else:
                        logger.error(f"Failed to create order: {response.status}")
                        return None
        except Exception as e:
            logger.error(f"Error creating order: {e}")
            return None
    
    async def get_orders(self, filters: dict = None) -> List[dict]:
        """Получить заявки с фильтрами"""
        try:
            params = filters or {}
            async with aiohttp.ClientSession() as session:
                async with session.get(f"{self.base_url}/orders", params=params, timeout=10) as response:
                    if response.status == 200:
                        return await response.json()
                    else:
                        logger.error(f"Failed to get orders: {response.status}")
                        return []
        except Exception as e:
            logger.error(f"Error getting orders: {e}")
            return []
    
    async def update_order(self, order_id: str, updates: dict) -> Optional[dict]:
        """Обновить заявку"""
        try:
            async with aiohttp.ClientSession() as session:
                async with session.patch(f"{self.base_url}/orders/{order_id}", json=updates, timeout=10) as response:
                    if response.status == 200:
                        return await response.json()
                    else:
                        logger.error(f"Failed to update order: {response.status}")
                        return None
        except Exception as e:
            logger.error(f"Error updating order: {e}")
            return None
    
    async def approve_order(self, order_id: str) -> Optional[dict]:
        """Одобрить заявку"""
        try:
            async with aiohttp.ClientSession() as session:
                async with session.patch(f"{self.base_url}/orders/{order_id}/approve", timeout=10) as response:
                    if response.status == 200:
                        return await response.json()
                    else:
                        logger.error(f"Failed to approve order: {response.status}")
                        return None
        except Exception as e:
            logger.error(f"Error approving order: {e}")
            return None
    
    async def reject_order(self, order_id: str) -> Optional[dict]:
        """Отклонить заявку"""
        try:
            async with aiohttp.ClientSession() as session:
                async with session.patch(f"{self.base_url}/orders/{order_id}/reject", timeout=10) as response:
                    if response.status == 200:
                        return await response.json()
                    else:
                        logger.error(f"Failed to reject order: {response.status}")
                        return None
        except Exception as e:
            logger.error(f"Error rejecting order: {e}")
            return None
    
    async def delete_order(self, order_id: str) -> bool:
        """Удалить заявку"""
        try:
            async with aiohttp.ClientSession() as session:
                async with session.delete(f"{self.base_url}/orders/{order_id}", timeout=10) as response:
                    return response.status == 200
        except Exception as e:
            logger.error(f"Error deleting order: {e}")
            return False
    
    async def get_server_stats(self, project: str = None) -> List[dict]:
        """Получить статистику по серверам"""
        try:
            params = {"project": project} if project else {}
            async with aiohttp.ClientSession() as session:
                async with session.get(f"{self.base_url}/orders/stats/servers", params=params, timeout=10) as response:
                    if response.status == 200:
                        return await response.json()
                    else:
                        return []
        except Exception as e:
            logger.error(f"Error getting server stats: {e}")
            return []


# Инициализация
bot = Bot(token=BOT_TOKEN, default=DefaultBotProperties(parse_mode=ParseMode.HTML))
storage = MemoryStorage()
dp = Dispatcher(storage=storage)
router = Router()
api_client = APIClient(API_BASE_URL)


# Меню
def get_main_menu() -> InlineKeyboardMarkup:
    buttons = [
        [
            InlineKeyboardButton(text="💰 Купить", callback_data="action_buy"),
            InlineKeyboardButton(text="💸 Продать", callback_data="action_sell")
        ],
        [
            InlineKeyboardButton(text="🛡 Гарантии", callback_data="info_guarantees"),
            InlineKeyboardButton(text="💬 Поддержка", url=f"https://t.me/{SUPPORT_USERNAME}")
        ],
        [
            InlineKeyboardButton(text="📋 Правила", callback_data="info_rules")
        ]
    ]
    return InlineKeyboardMarkup(inline_keyboard=buttons)

def get_projects_menu() -> InlineKeyboardMarkup:
    buttons = [
        [InlineKeyboardButton(text="🎮 Majestic RP", callback_data="project_Majestic")],
        [InlineKeyboardButton(text="🎮 GTA5RP", callback_data="project_GTA5RP")],
        [InlineKeyboardButton(text="◀️ Назад", callback_data="back_to_main")]
    ]
    return InlineKeyboardMarkup(inline_keyboard=buttons)

async def get_servers_menu(project_key: str, action: str = "buy") -> InlineKeyboardMarkup:
    """Меню серверов с показом количества продавцов и виртов"""
    project = PROJECTS[project_key]
    servers = project["servers"]
    prices = project["prices"]
    
    # Получить статистику с сервера
    stats_list = await api_client.get_server_stats(project=project_key)
    stats_dict = {s["server_name"]: s for s in stats_list}
    
    buttons = []
    for i in range(0, len(servers), 2):
        row = []
        for j in range(2):
            if i + j < len(servers):
                server = servers[i + j]
                server_data = prices.get(server, {"sellPrice": 700, "buyPrice": 350})
                
                # Показать статистику для покупки
                stats = stats_dict.get(server, {})
                if action == "buy" and stats:
                    sellers_count = stats.get("total_sellers", 0)
                    total_kk = stats.get("total_amount", 0) // 1000000
                    label = f"{server} ({sellers_count}чел, {total_kk}кк)"
                else:
                    label = server
                
                row.append(InlineKeyboardButton(
                    text=label,
                    callback_data=f"server_{project_key}_{server}"
                ))
        if row:
            buttons.append(row)
    buttons.append([InlineKeyboardButton(text="◀️ Назад", callback_data="back_to_projects")])
    return InlineKeyboardMarkup(inline_keyboard=buttons)

def get_amount_menu(project_key: str, server: str, action: str = "buy") -> InlineKeyboardMarkup:
    """Генерация меню с ценами на основе выбранного сервера"""
    prices = PROJECTS[project_key]["prices"]
    server_data = prices.get(server, {"sellPrice": 700, "buyPrice": 350})
    
    if action == "buy":
        price_per_kk = server_data["sellPrice"]
    else:
        price_per_kk = server_data["buyPrice"]
    
    buttons = []
    for i in range(0, len(VIRT_AMOUNTS_KK), 3):
        row = []
        for j in range(3):
            if i + j < len(VIRT_AMOUNTS_KK):
                kk = VIRT_AMOUNTS_KK[i + j]
                total_price = kk * price_per_kk
                label = f"{kk}кк - {total_price}₽"
                row.append(InlineKeyboardButton(
                    text=label,
                    callback_data=f"amount_{kk}_{total_price}"
                ))
        if row:
            buttons.append(row)
    
    buttons.append([InlineKeyboardButton(text="💰 Другая сумма", callback_data="amount_custom")])
    buttons.append([InlineKeyboardButton(text="◀️ Назад", callback_data="back_to_servers")])
    return InlineKeyboardMarkup(inline_keyboard=buttons)

def get_server_price(project_key: str, server: str, action: str = "buy") -> int:
    """Получить цену за 1кк для сервера"""
    prices = PROJECTS[project_key]["prices"]
    server_data = prices.get(server, {"sellPrice": 700, "buyPrice": 350})
    return server_data["sellPrice"] if action == "buy" else server_data["buyPrice"]

def get_purchase_menu() -> InlineKeyboardMarkup:
    buttons = [
        [InlineKeyboardButton(text="✅ Купить", url=f"https://t.me/{SUPPORT_USERNAME}")],
        [InlineKeyboardButton(text="◀️ Назад", callback_data="back_to_main")]
    ]
    return InlineKeyboardMarkup(inline_keyboard=buttons)

def get_back_menu() -> InlineKeyboardMarkup:
    buttons = [[InlineKeyboardButton(text="◀️ В главное меню", callback_data="back_to_main")]]
    return InlineKeyboardMarkup(inline_keyboard=buttons)

async def send_or_edit_message(callback: CallbackQuery, text: str, markup: InlineKeyboardMarkup, photo_path: str = None):
    try:
        has_photo = callback.message.photo is not None and len(callback.message.photo) > 0
        if photo_path and os.path.exists(photo_path):
            from aiogram.types import InputMediaPhoto
            if has_photo:
                await callback.message.edit_media(
                    media=InputMediaPhoto(media=FSInputFile(photo_path), caption=text),
                    reply_markup=markup
                )
            else:
                await callback.message.delete()
                await callback.message.answer_photo(
                    photo=FSInputFile(photo_path),
                    caption=text,
                    reply_markup=markup
                )
        else:
            if has_photo:
                await callback.message.delete()
                await callback.message.answer(text, reply_markup=markup)
            else:
                await callback.message.edit_text(text, reply_markup=markup)
    except Exception as e:
        logger.error(f"Ошибка при отправке/редактировании сообщения: {e}")
        try:
            await callback.message.delete()
            if photo_path and os.path.exists(photo_path):
                await callback.message.answer_photo(photo=FSInputFile(photo_path), caption=text, reply_markup=markup)
            else:
                await callback.message.answer(text, reply_markup=markup)
        except Exception as e2:
            logger.error(f"Ошибка в fallback: {e2}")

# --- Проверка подписки ---
async def is_subscribed(user_id: int) -> bool:
    try:
        member = await bot.get_chat_member(chat_id=CHANNEL_ID, user_id=user_id)
        return member.status not in ["left", "kicked"]
    except Exception as e:
        logger.error(f"Ошибка проверки подписки: {e}")
        return False

async def subscription_guard(callback: CallbackQuery) -> bool:
    if not await is_subscribed(callback.from_user.id):
        text = "<b>⚠️ Чтобы использовать бота, подпишитесь на канал:\n\n👉 @PatrickVirts</b>"
        markup = InlineKeyboardMarkup(
            inline_keyboard=[[InlineKeyboardButton(text="📢 Подписаться", url="https://t.me/PatrickVirts")]]
        )
        await callback.message.answer(text, reply_markup=markup)
        await callback.answer()
        return False
    return True

# --- Обработчики ---
@router.message(CommandStart())
async def cmd_start(message: Message, state: FSMContext):
    user_id = message.from_user.id
    username = message.from_user.username
    first_name = message.from_user.first_name
    
    # Проверка подписки
    if not await is_subscribed(user_id):
        text = "<b>⚠️ Чтобы использовать бота, подпишитесь на канал:\n\n👉 @PatrickVirts</b>"
        subscribe_button = InlineKeyboardMarkup(
            inline_keyboard=[[InlineKeyboardButton(text="📢 Подписаться", url="https://t.me/PatrickVirts")]]
        )
        await message.answer(text, reply_markup=subscribe_button)
        return

    await state.clear()
    
    welcome_text = "<b>Привет! Благодарим за выбор нашего магазина.</b>"
    photo_path = MENU_IMAGES["main"]
    if os.path.exists(photo_path):
        await message.answer_photo(photo=FSInputFile(photo_path), caption=welcome_text, reply_markup=get_main_menu())
    else:
        await message.answer(welcome_text, reply_markup=get_main_menu())

@router.message(Command("help"))
async def cmd_help(message: Message):
    help_text = """<b>📖 Помощь по боту

Доступные команды:
/start - Главное меню
/help - Помощь
/stats - Статистика

Как использовать:
1. Выберите действие (Купить/Продать)
2. Выберите проект
3. Выберите сервер
4. Укажите количество виртов
5. Свяжитесь с поддержкой для завершения заказа

Поддержка: @patrickprodast</b>"""
    await message.answer(help_text)

@router.message(Command("stats"))
async def cmd_stats(message: Message):
    user_id = message.from_user.id
    
    # Получить заявки пользователя
    orders = await api_client.get_orders({"user_id": user_id, "source": "bot"})
    
    stats_text = f"""<b>📊 Ваша статистика

👤 Пользователь: {message.from_user.first_name}
📝 Username: @{message.from_user.username or 'Не указано'}
📦 Количество заявок: {len(orders)}</b>"""
    
    await message.answer(stats_text)

# ========================================
# АДМИН КОМАНДЫ (обновленные для API)
# ========================================

def is_admin(user_id: int) -> bool:
    """Проверка является ли пользователь админом"""
    return user_id == ADMIN_USER_ID

@router.message(Command("admin"))
async def cmd_admin(message: Message):
    """Админ-панель"""
    if not is_admin(message.from_user.id):
        await message.answer("<b>❌ Доступ запрещен</b>")
        return
    
    admin_text = """<b>👑 Админ-панель

Доступные команды:

📋 Просмотр заявок:
/orders - Все заявки (последние 20)
/orders_buy - Заявки на покупку
/orders_sell - Заявки на продажу
/orders_pending - Ожидающие модерации

✏️ Управление заявками:
/approve [id] - Одобрить заявку
/reject [id] - Отклонить заявку
/delete [id] - Удалить заявку
/edit [id] [новое_кол-во] - Изменить количество виртов

📊 Статистика:
/stats_all - Общая статистика
/prices - Текущие цены серверов</b>"""
    
    await message.answer(admin_text)

@router.message(Command("orders"))
async def cmd_orders(message: Message):
    """Список всех заявок"""
    if not is_admin(message.from_user.id):
        await message.answer("<b>❌ Доступ запрещен</b>")
        return
    
    orders = await api_client.get_orders()
    
    if not orders:
        await message.answer("<b>📋 Нет активных заявок</b>")
        return
    
    # Последние 20 заявок
    recent_orders = orders[:20]
    
    text = "<b>📋 Последние заявки:</b>\n\n"
    for order in recent_orders:
        action = "🛒 Покупка" if order.get("order_type") == "buy" else "💰 Продажа"
        username = order.get("username", "?")
        project = order.get("project", "?")
        server = order.get("server_name", "?")
        amount = order.get("amount", 0) // 1000
        price = order.get("price", 0)
        status = order.get("status", "pending")
        order_id = order.get("id", "?")
        created_at = order.get("created_at", "")
        
        # Форматировать дату
        if isinstance(created_at, str):
            try:
                dt = datetime.fromisoformat(created_at.replace('Z', '+00:00'))
                date_str = dt.strftime("%d.%m.%Y %H:%M")
            except:
                date_str = created_at[:16]
        else:
            date_str = "?"
        
        status_emoji = "✅" if status == "approved" else "⏳" if status == "pending" else "❌"
        
        text += f"""<b>{action}</b> {status_emoji}
👤 @{username} | 🎮 {project} - {server}
💎 {amount}кк | 💵 {price}₽
📅 {date_str}
🆔 <code>{order_id[:8]}</code>

"""
    
    text += "\n<i>Используйте команды для управления заявками</i>"
    
    await message.answer(text)

@router.message(Command("orders_buy"))
async def cmd_orders_buy(message: Message):
    """Заявки на покупку"""
    if not is_admin(message.from_user.id):
        await message.answer("<b>❌ Доступ запрещен</b>")
        return
    
    orders = await api_client.get_orders({"order_type": "buy"})
    
    if not orders:
        await message.answer("<b>🛒 Нет заявок на покупку</b>")
        return
    
    recent_orders = orders[:15]
    
    text = "<b>🛒 Заявки на покупку:</b>\n\n"
    for order in recent_orders:
        username = order.get("username", "?")
        server = order.get("server_name", "?")
        amount = order.get("amount", 0) // 1000
        price = order.get("price", 0)
        order_id = order.get("id", "?")
        
        text += f"<b>🆔</b> <code>{order_id[:8]}</code>\n"
        text += f"@{username} | {server} | {amount}кк | {price}₽\n\n"
    
    await message.answer(text)

@router.message(Command("orders_sell"))
async def cmd_orders_sell(message: Message):
    """Заявки на продажу"""
    if not is_admin(message.from_user.id):
        await message.answer("<b>❌ Доступ запрещен</b>")
        return
    
    orders = await api_client.get_orders({"order_type": "sell"})
    
    if not orders:
        await message.answer("<b>💰 Нет заявок на продажу</b>")
        return
    
    recent_orders = orders[:15]
    
    text = "<b>💰 Заявки на продажу:</b>\n\n"
    for order in recent_orders:
        username = order.get("username", "?")
        server = order.get("server_name", "?")
        amount = order.get("amount", 0) // 1000
        price = order.get("price", 0)
        status = order.get("status", "pending")
        order_id = order.get("id", "?")
        
        status_text = "✅ Одобрено" if status == "approved" else "⏳ Ожидает" if status == "pending" else "❌ Отклонено"
        
        text += f"<b>🆔</b> <code>{order_id[:8]}</code> | {status_text}\n"
        text += f"@{username} | {server} | {amount}кк | {price}₽\n\n"
    
    await message.answer(text)

@router.message(Command("orders_pending"))
async def cmd_orders_pending(message: Message):
    """Заявки ожидающие модерации"""
    if not is_admin(message.from_user.id):
        await message.answer("<b>❌ Доступ запрещен</b>")
        return
    
    orders = await api_client.get_orders({"status": "pending"})
    
    if not orders:
        await message.answer("<b>✅ Нет заявок ожидающих модерации</b>")
        return
    
    text = "<b>⏳ Заявки на модерации:</b>\n\n"
    for order in orders[:15]:
        action = "🛒 Покупка" if order.get("order_type") == "buy" else "💰 Продажа"
        username = order.get("username", "?")
        server = order.get("server_name", "?")
        amount = order.get("amount", 0) // 1000
        price = order.get("price", 0)
        order_id = order.get("id", "?")
        
        text += f"<b>{action}</b>\n"
        text += f"🆔 <code>{order_id[:8]}</code>\n"
        text += f"@{username} | {server} | {amount}кк | {price}₽\n"
        text += f"/approve_{order_id[:8]} | /reject_{order_id[:8]}\n\n"
    
    await message.answer(text)

@router.message(Command("prices"))
async def cmd_prices(message: Message):
    """Показать цены серверов"""
    if not is_admin(message.from_user.id):
        await message.answer("<b>❌ Доступ запрещен</b>")
        return
    
    text = "<b>💰 Цены GTA5RP (₽ за 1кк):</b>\n\n"
    for server, data in GTA5RP_SERVERS.items():
        text += f"{server}: покупка {data['sellPrice']}₽ | продажа {data['buyPrice']}₽\n"
    
    await message.answer(text)

@router.message(F.text.regexp(r"^/approve_(.+)$"))
async def cmd_approve_order(message: Message):
    """Одобрить заявку по ID"""
    if not is_admin(message.from_user.id):
        await message.answer("<b>❌ Доступ запрещен</b>")
        return
    
    try:
        # Извлечь ID из команды
        short_id = message.text.split("_")[1]
        
        # Найти полный ID
        orders = await api_client.get_orders()
        order = next((o for o in orders if o["id"].startswith(short_id)), None)
        
        if not order:
            await message.answer(f"<b>❌ Заявка не найдена</b>")
            return
        
        # Одобрить заявку
        updated_order = await api_client.approve_order(order["id"])
        
        if updated_order:
            await message.answer(f"""<b>✅ Заявка одобрена</b>

👤 @{order.get('username')}
🎮 {order.get('project')} - {order.get('server_name')}
💎 {order.get('amount', 0) // 1000}кк
💵 {order.get('price')}₽""")
            
            # Уведомить пользователя
            try:
                user_id = order.get("user_id")
                action_text = "покупку" if order.get("order_type") == "buy" else "продажу"
                await bot.send_message(
                    chat_id=user_id,
                    text=f"""<b>✅ Ваша заявка на {action_text} одобрена!</b>

🎮 {order.get('project')} - {order.get('server_name')}
💎 {order.get('amount', 0) // 1000}кк
💵 {order.get('price')}₽

Свяжитесь с @{SUPPORT_USERNAME} для завершения сделки."""
                )
            except Exception as e:
                logger.error(f"Не удалось уведомить пользователя: {e}")
        else:
            await message.answer("<b>❌ Ошибка одобрения заявки</b>")
    except Exception as e:
        logger.error(f"Error approving order: {e}")
        await message.answer("<b>❌ Неверный формат команды</b>")

@router.message(F.text.regexp(r"^/reject_(.+)$"))
async def cmd_reject_order(message: Message):
    """Отклонить заявку по ID"""
    if not is_admin(message.from_user.id):
        await message.answer("<b>❌ Доступ запрещен</b>")
        return
    
    try:
        short_id = message.text.split("_")[1]
        
        orders = await api_client.get_orders()
        order = next((o for o in orders if o["id"].startswith(short_id)), None)
        
        if not order:
            await message.answer(f"<b>❌ Заявка не найдена</b>")
            return
        
        updated_order = await api_client.reject_order(order["id"])
        
        if updated_order:
            await message.answer(f"""<b>❌ Заявка отклонена</b>

👤 @{order.get('username')}
🎮 {order.get('project')} - {order.get('server_name')}
💎 {order.get('amount', 0) // 1000}кк""")
            
            # Уведомить пользователя
            try:
                user_id = order.get("user_id")
                action_text = "покупку" if order.get("order_type") == "buy" else "продажу"
                await bot.send_message(
                    chat_id=user_id,
                    text=f"""<b>❌ Ваша заявка на {action_text} отклонена</b>

🎮 {order.get('project')} - {order.get('server_name')}
💎 {order.get('amount', 0) // 1000}кк

Свяжитесь с @{SUPPORT_USERNAME} для уточнения деталей."""
                )
            except Exception as e:
                logger.error(f"Не удалось уведомить пользователя: {e}")
        else:
            await message.answer("<b>❌ Ошибка отклонения заявки</b>")
    except Exception as e:
        logger.error(f"Error rejecting order: {e}")
        await message.answer("<b>❌ Неверный формат команды</b>")

@router.message(F.text.regexp(r"^/delete_(.+)$"))
async def cmd_delete_order(message: Message):
    """Удалить заявку по ID"""
    if not is_admin(message.from_user.id):
        await message.answer("<b>❌ Доступ запрещен</b>")
        return
    
    try:
        short_id = message.text.split("_")[1]
        
        orders = await api_client.get_orders()
        order = next((o for o in orders if o["id"].startswith(short_id)), None)
        
        if not order:
            await message.answer(f"<b>❌ Заявка не найдена</b>")
            return
        
        success = await api_client.delete_order(order["id"])
        
        if success:
            await message.answer(f"""<b>🗑 Заявка удалена</b>

👤 @{order.get('username')}
🎮 {order.get('project')} - {order.get('server_name')}
💎 {order.get('amount', 0) // 1000}кк""")
        else:
            await message.answer("<b>❌ Ошибка удаления заявки</b>")
    except Exception as e:
        logger.error(f"Error deleting order: {e}")
        await message.answer("<b>❌ Неверный формат команды</b>")

@router.message(F.text.regexp(r"^/edit_([a-f0-9-]+)_(\d+)$"))
async def cmd_edit_order(message: Message):
    """Изменить количество виртов в заявке"""
    if not is_admin(message.from_user.id):
        await message.answer("<b>❌ Доступ запрещен</b>")
        return
    
    try:
        parts = message.text.split("_")
        short_id = parts[1]
        new_amount = int(parts[2]) * 1000  # конвертировать кк в вирты
        
        orders = await api_client.get_orders()
        order = next((o for o in orders if o["id"].startswith(short_id)), None)
        
        if not order:
            await message.answer(f"<b>❌ Заявка не найдена</b>")
            return
        
        # Пересчитать цену
        old_amount = order.get("amount", 0)
        old_price = order.get("price", 0)
        price_per_virt = old_price / old_amount if old_amount > 0 else 0
        new_price = new_amount * price_per_virt
        
        updated_order = await api_client.update_order(order["id"], {
            "amount": new_amount,
            "price": new_price
        })
        
        if updated_order:
            await message.answer(f"""<b>✏️ Заявка обновлена</b>

👤 @{order.get('username')}
🎮 {order.get('project')} - {order.get('server_name')}
💎 Было: {old_amount // 1000}кк → Стало: {new_amount // 1000}кк
💵 Было: {old_price}₽ → Стало: {new_price}₽""")
        else:
            await message.answer("<b>❌ Ошибка обновления заявки</b>")
    except Exception as e:
        logger.error(f"Error editing order: {e}")
        await message.answer("<b>❌ Неверный формат. Используйте: /edit_[id]_[новое_кол-во_в_кк]</b>")

# --- Обработчики action (Купить/Продать) ---
@router.callback_query(F.data.startswith("action_"))
async def handle_action(callback: CallbackQuery, state: FSMContext):
    if not await subscription_guard(callback):
        return
    
    action = callback.data.split("_")[1]
    await state.update_data(action=action)
    await state.set_state(UserStates.selecting_project)
    
    text = "<b>Выбери необходимый проект:</b>"
    
    await send_or_edit_message(callback, text, get_projects_menu(), MENU_IMAGES.get("projects"))
    await callback.answer()

# --- Обработчик выбора проекта ---
@router.callback_query(F.data.startswith("project_"))
async def handle_project(callback: CallbackQuery, state: FSMContext):
    if not await subscription_guard(callback):
        return
    
    project_key = callback.data.split("_")[1]
    await state.update_data(project=project_key)
    await state.set_state(UserStates.selecting_server)
    
    project = PROJECTS[project_key]
    data = await state.get_data()
    action = data.get("action", "buy")
    
    text = f"<b>Выбери необходимый сервер:</b>"
    if action == "buy":
        text += "\n\n<i>Показано количество продавцов и виртов</i>"
    
    photo_path = project.get("photo")
    servers_menu = await get_servers_menu(project_key, action)
    await send_or_edit_message(callback, text, servers_menu, photo_path)
    await callback.answer()

# --- Обработчик выбора сервера ---
@router.callback_query(F.data.startswith("server_"))
async def handle_server(callback: CallbackQuery, state: FSMContext):
    if not await subscription_guard(callback):
        return
    
    parts = callback.data.split("_", 2)
    project_key = parts[1]
    server = parts[2]
    
    await state.update_data(server=server, project=project_key)
    
    data = await state.get_data()
    action = data.get("action")
    
    buy_price = get_server_price(project_key, server, "buy")
    sell_price = get_server_price(project_key, server, "sell")
    
    if action == "buy":
        await state.set_state(UserStates.selecting_amount)
        text = f"""<b>🎮 Сервер: {server}
💰 Цена за 1кк: {buy_price}₽

Выбери нужное количество виртов:</b>"""
        await send_or_edit_message(callback, text, get_amount_menu(project_key, server, "buy"))
    else:
        await state.set_state(UserStates.selecting_amount)
        text = f"""<b>🎮 Сервер: {server}
💰 Вы получите за 1кк: {sell_price}₽

Выбери количество виртов для продажи:</b>"""
        await send_or_edit_message(callback, text, get_amount_menu(project_key, server, "sell"))
    
    await callback.answer()

# --- Обработчик выбора количества виртов ---
@router.callback_query(F.data.startswith("amount_"))
async def handle_amount(callback: CallbackQuery, state: FSMContext):
    if not await subscription_guard(callback):
        return
    
    data = await state.get_data()
    project = data.get("project")
    server = data.get("server")
    action = data.get("action", "buy")
    
    if callback.data == "amount_custom":
        action_word = "куплю" if action == "buy" else "продам"
        action_btn = "Купить" if action == "buy" else "Продать"
        
        explanation_text = f"""<b>Для завершения нажмите «{action_btn}».

1️⃣ Проект и сервер: {PROJECTS[project]['name']}, {server}
2️⃣ Количество виртов: укажите нужное количество
3️⃣ Способ оплаты (Сбербанк/Тинькофф, СБП, Карта KZT, Крипта, Скины).

Пример сообщения: {PROJECTS[project]['name']}, {server}, {action_word} [количество]kk ✅</b>"""
        
        menu = InlineKeyboardMarkup(inline_keyboard=[
            [InlineKeyboardButton(text=f"✅ {action_btn}", url=f"https://t.me/{SUPPORT_USERNAME}")],
            [InlineKeyboardButton(text="◀️ Назад", callback_data="back_to_main")]
        ])
        
        await send_or_edit_message(callback, explanation_text, menu)
        await state.clear()
        await callback.answer()
        return
    
    parts = callback.data.split("_")
    amount_kk = int(parts[1])
    price = float(parts[2])
    amount = amount_kk * 1_000_000  # конвертировать кк в вирты
    
    # Создать заявку через API
    user_id = callback.from_user.id
    username = callback.from_user.username or "без_username"
    
    order_data = {
        "order_type": action,
        "project": project,
        "server_name": server,
        "user_id": user_id,
        "username": username,
        "amount": amount,
        "price": price,
        "source": "bot"
    }
    
    created_order = await api_client.create_order(order_data)
    
    if created_order:
        if action == "buy":
            order_text = f"""<b>✅ Заявка на покупку создана!</b>

🎮 Проект: {PROJECTS[project]['name']}
🏠 Сервер: {server}
💎 Количество: {amount_kk}кк
💵 К оплате: {price}₽

Для завершения сделки нажмите «Купить» и напишите:
{PROJECTS[project]['name']}, {server}, куплю {amount_kk}kk"""
        else:
            order_text = f"""<b>✅ Заявка на продажу отправлена на модерацию!</b>

🎮 Проект: {PROJECTS[project]['name']}
🏠 Сервер: {server}
💎 Количество: {amount_kk}кк
💵 Вы получите: {price}₽

Ожидайте подтверждения от администратора."""
        
        action_btn = "Купить" if action == "buy" else "Продать"
        menu = InlineKeyboardMarkup(inline_keyboard=[
            [InlineKeyboardButton(text=f"✅ {action_btn}", url=f"https://t.me/{SUPPORT_USERNAME}")],
            [InlineKeyboardButton(text="◀️ В главное меню", callback_data="back_to_main")]
        ])
        
        await send_or_edit_message(callback, order_text, menu)
    else:
        await callback.answer("❌ Ошибка создания заявки", show_alert=True)
    
    await state.clear()
    await callback.answer()

# --- Обработчики информационных кнопок ---
@router.callback_query(F.data.startswith("info_"))
async def handle_info(callback: CallbackQuery):
    if not await subscription_guard(callback):
        return
    
    info_type = callback.data.split("_")[1]
    text = INFO_TEXTS.get(info_type, "<b>Информация не найдена</b>")
    
    await send_or_edit_message(callback, text, get_back_menu())
    await callback.answer()

# --- Обработчики навигации (Назад) ---
@router.callback_query(F.data == "back_to_main")
async def back_to_main(callback: CallbackQuery, state: FSMContext):
    if not await subscription_guard(callback):
        return
    
    await state.clear()
    text = "<b>Привет! Благодарим за выбор нашего магазина.</b>"
    await send_or_edit_message(callback, text, get_main_menu(), MENU_IMAGES.get("main"))
    await callback.answer()

@router.callback_query(F.data == "back_to_projects")
async def back_to_projects(callback: CallbackQuery, state: FSMContext):
    if not await subscription_guard(callback):
        return
    
    await state.set_state(UserStates.selecting_project)
    text = "<b>Выбери необходимый проект:</b>"
    await send_or_edit_message(callback, text, get_projects_menu(), MENU_IMAGES.get("projects"))
    await callback.answer()

@router.callback_query(F.data == "back_to_servers")
async def back_to_servers(callback: CallbackQuery, state: FSMContext):
    if not await subscription_guard(callback):
        return
    
    data = await state.get_data()
    project_key = data.get("project")
    
    if project_key:
        await state.set_state(UserStates.selecting_server)
        project = PROJECTS[project_key]
        text = f"<b>Выбери необходимый сервер:</b>"
        photo_path = project.get("photo")
        action = data.get("action", "buy")
        servers_menu = await get_servers_menu(project_key, action)
        await send_or_edit_message(callback, text, servers_menu, photo_path)
    else:
        await back_to_projects(callback, state)
    
    await callback.answer()

async def main():
    logger.info("Бот запускается с единой базой данных MongoDB...")
    dp.include_router(router)
    await bot.delete_webhook(drop_pending_updates=True)
    logger.info("Бот успешно запущен!")
    await dp.start_polling(bot)

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logger.info("Бот остановлен")
