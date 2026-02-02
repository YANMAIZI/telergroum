#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Telegram бот для магазина игровых ресурсов с единой базой данных (MongoDB через API)
ИСПРАВЛЕННАЯ ВЕРСИЯ - работает с правильными endpoints
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
BOT_TOKEN = os.getenv("BOT_TOKEN", "")
CHANNEL_ID = -1003778829727
SUPPORT_USERNAME = "patrickprodast"
ADMIN_USER_ID = 7858974852

# Backend API URL - должен быть установлен в Railway
API_BASE_URL = os.getenv("API_BASE_URL", "")

# Проверка обязательных переменных окружения
if not BOT_TOKEN:
    logger.error("❌ BOT_TOKEN не установлен! Установите переменную окружения BOT_TOKEN в Railway.")
    raise ValueError("BOT_TOKEN is required")

if not API_BASE_URL:
    logger.error("❌ API_BASE_URL не установлен! Установите переменную окружения API_BASE_URL в Railway.")
    raise ValueError("API_BASE_URL is required")

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

# FSM состояния
class UserStates(StatesGroup):
    selecting_action = State()
    selecting_server = State()
    selecting_amount = State()


# ==========================================
# API CLIENT (ИСПРАВЛЕННЫЙ)
# ==========================================

class APIClient:
    """Клиент для работы с Backend API"""
    
    def __init__(self, base_url: str):
        self.base_url = base_url
    
    async def create_order(self, order_data: dict) -> Optional[dict]:
        """Создать заявку"""
        try:
            logger.info(f"Creating order: {order_data}")
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    f"{self.base_url}/orders",
                    json=order_data,
                    timeout=aiohttp.ClientTimeout(total=10)
                ) as response:
                    if response.status == 200:
                        result = await response.json()
                        logger.info(f"✅ Order created: {result.get('id')}")
                        return result
                    else:
                        error_text = await response.text()
                        logger.error(f"❌ Failed to create order: {response.status}, {error_text}")
                        return None
        except Exception as e:
            logger.error(f"❌ Error creating order: {e}")
            return None
    
    async def get_orders(self, filters: dict = None) -> List[dict]:
        """Получить заявки с фильтрами"""
        try:
            params = filters or {}
            async with aiohttp.ClientSession() as session:
                async with session.get(
                    f"{self.base_url}/orders",
                    params=params,
                    timeout=aiohttp.ClientTimeout(total=10)
                ) as response:
                    if response.status == 200:
                        return await response.json()
                    else:
                        logger.error(f"Failed to get orders: {response.status}")
                        return []
        except Exception as e:
            logger.error(f"Error getting orders: {e}")
            return []
    
    async def approve_order(self, order_id: str) -> Optional[dict]:
        """Одобрить заявку"""
        try:
            async with aiohttp.ClientSession() as session:
                async with session.patch(
                    f"{self.base_url}/orders/{order_id}/approve",
                    timeout=aiohttp.ClientTimeout(total=10)
                ) as response:
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
                async with session.patch(
                    f"{self.base_url}/orders/{order_id}/reject",
                    timeout=aiohttp.ClientTimeout(total=10)
                ) as response:
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
                async with session.delete(
                    f"{self.base_url}/orders/{order_id}",
                    timeout=aiohttp.ClientTimeout(total=10)
                ) as response:
                    return response.status == 200
        except Exception as e:
            logger.error(f"Error deleting order: {e}")
            return False


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

def get_servers_menu(action: str = "buy") -> InlineKeyboardMarkup:
    """Меню серверов"""
    servers = list(GTA5RP_SERVERS.keys())
    buttons = []
    for i in range(0, len(servers), 2):
        row = []
        for j in range(2):
            if i + j < len(servers):
                server = servers[i + j]
                row.append(InlineKeyboardButton(
                    text=server,
                    callback_data=f"server_{server}"
                ))
        if row:
            buttons.append(row)
    buttons.append([InlineKeyboardButton(text="◀️ Назад", callback_data="back_to_main")])
    return InlineKeyboardMarkup(inline_keyboard=buttons)

def get_amount_menu(server: str, action: str = "buy") -> InlineKeyboardMarkup:
    """Генерация меню с ценами на основе выбранного сервера"""
    server_data = GTA5RP_SERVERS.get(server, {"sellPrice": 700, "buyPrice": 350})
    
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

def get_back_menu() -> InlineKeyboardMarkup:
    buttons = [[InlineKeyboardButton(text="◀️ В главное меню", callback_data="back_to_main")]]
    return InlineKeyboardMarkup(inline_keyboard=buttons)

# --- Проверка подписки ---
async def is_subscribed(user_id: int) -> bool:
    try:
        member = await bot.get_chat_member(chat_id=CHANNEL_ID, user_id=user_id)
        return member.status not in ["left", "kicked"]
    except Exception as e:
        logger.error(f"Ошибка проверки подписки: {e}")
        return False

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
    
    welcome_text = f"<b>Привет, {first_name}! Добро пожаловать в магазин виртов GTA5RP.</b>"
    await message.answer(welcome_text, reply_markup=get_main_menu())

# --- Обработчики action (Купить/Продать) ---
@router.callback_query(F.data.startswith("action_"))
async def handle_action(callback: CallbackQuery, state: FSMContext):
    action = callback.data.split("_")[1]
    await state.update_data(action=action)
    await state.set_state(UserStates.selecting_server)
    
    text = f"<b>{'🛒 Выберите сервер для покупки' if action == 'buy' else '💸 Выберите сервер для продажи'}:</b>"
    
    await callback.message.edit_text(text, reply_markup=get_servers_menu(action))
    await callback.answer()

# --- Обработчик выбора сервера ---
@router.callback_query(F.data.startswith("server_"))
async def handle_server(callback: CallbackQuery, state: FSMContext):
    server = callback.data.split("_", 1)[1]
    
    await state.update_data(server=server)
    
    data = await state.get_data()
    action = data.get("action")
    
    server_data = GTA5RP_SERVERS.get(server, {"sellPrice": 700, "buyPrice": 350})
    
    if action == "buy":
        await state.set_state(UserStates.selecting_amount)
        text = f"""<b>🎮 Сервер: {server}
💰 Цена за 1кк: {server_data['sellPrice']}₽

Выбери нужное количество виртов:</b>"""
        await callback.message.edit_text(text, reply_markup=get_amount_menu(server, "buy"))
    else:
        await state.set_state(UserStates.selecting_amount)
        text = f"""<b>🎮 Сервер: {server}
💰 Вы получите за 1кк: {server_data['buyPrice']}₽

Выбери количество виртов для продажи:</b>"""
        await callback.message.edit_text(text, reply_markup=get_amount_menu(server, "sell"))
    
    await callback.answer()

# --- Обработчик выбора количества виртов ---
@router.callback_query(F.data.startswith("amount_"))
async def handle_amount(callback: CallbackQuery, state: FSMContext):
    data = await state.get_data()
    server = data.get("server")
    action = data.get("action", "buy")
    
    if callback.data == "amount_custom":
        action_word = "куплю" if action == "buy" else "продам"
        action_btn = "Купить" if action == "buy" else "Продать"
        
        server_data = GTA5RP_SERVERS.get(server, {"sellPrice": 700, "buyPrice": 350})
        price = server_data["sellPrice"] if action == "buy" else server_data["buyPrice"]
        
        explanation_text = f"""<b>📱 Для завершения нажмите «{action_btn}» и напишите менеджеру:

📍 Проект: GTA5RP
🎮 Сервер: {server}
💎 Количество: укажите нужное количество виртов
💰 Цена: {price}₽ за 1кк

Пример: "GTA5RP, {server}, {action_word} 5кк"</b>"""
        
        menu = InlineKeyboardMarkup(inline_keyboard=[
            [InlineKeyboardButton(text=f"✅ {action_btn}", url=f"https://t.me/{SUPPORT_USERNAME}")],
            [InlineKeyboardButton(text="◀️ Назад", callback_data="back_to_main")]
        ])
        
        await callback.message.edit_text(explanation_text, reply_markup=menu)
        await state.clear()
        await callback.answer()
        return
    
    parts = callback.data.split("_")
    amount_kk = int(parts[1])
    price = float(parts[2])
    amount = amount_kk * 1000000  # конвертировать кк в вирты
    
    # Создать заявку через API
    user_id = callback.from_user.id
    username = callback.from_user.username or f"user{user_id}"
    
    # Получаем server_id из словаря
    server_data = GTA5RP_SERVERS.get(server)
    if not server_data:
        await callback.answer("❌ Ошибка: сервер не найден", show_alert=True)
        return
    
    order_data = {
        "order_type": action,
        "project": "GTA5RP",
        "server_name": server,
        "server_id": server_data["id"],
        "user_id": user_id,
        "username": username,
        "amount": amount,
        "price": price,
        "source": "bot",
        "refund_enabled": True
    }
    
    created_order = await api_client.create_order(order_data)
    
    if created_order:
        # Уведомление админу о новой заявке
        try:
            if action == "buy":
                admin_text = (
                    "🛒 <b>НОВАЯ ЗАЯВКА ИЗ БОТА</b>\n\n"
                    f"Тип: <b>Покупка</b>\n"
                    f"Пользователь: @{username} (id <code>{user_id}</code>)\n"
                    f"Сервер: <b>{server}</b> (id <code>{server_data['id']}</code>)\n"
                    f"Количество: <b>{amount_kk}кк</b>\n"
                    f"Сумма: <b>{price} ₽</b>\n"
                    "Источник: <code>bot</code>"
                )
            else:
                admin_text = (
                    "💸 <b>НОВАЯ ЗАЯВКА ИЗ БОТА</b>\n\n"
                    f"Тип: <b>Продажа</b>\n"
                    f"Пользователь: @{username} (id <code>{user_id}</code>)\n"
                    f"Сервер: <b>{server}</b> (id <code>{server_data['id']}</code>)\n"
                    f"Количество: <b>{amount_kk}кк</b>\n"
                    f"Выплата: <b>{price} ₽</b>\n"
                    "Источник: <code>bot</code>"
                )
            await bot.send_message(chat_id=ADMIN_USER_ID, text=admin_text)
        except Exception as notify_err:
            logger.error(f"Не удалось отправить уведомление админу: {notify_err}")

        if action == "buy":
            order_text = f"""<b>✅ Заявка на покупку создана!</b>

🎮 Проект: GTA5RP
🏠 Сервер: {server}
💎 Количество: {amount_kk}кк
💵 К оплате: {price}₽

Для завершения сделки нажмите «Купить» и напишите:
GTA5RP, {server}, куплю {amount_kk}кк"""
        else:
            order_text = f"""<b>✅ Заявка на продажу отправлена на модерацию!</b>

🎮 Проект: GTA5RP
🏠 Сервер: {server}
💎 Количество: {amount_kk}кк
💵 Вы получите: {price}₽

Ожидайте подтверждения от администратора."""
        
        action_btn = "Купить" if action == "buy" else "Продать"
        menu = InlineKeyboardMarkup(inline_keyboard=[
            [InlineKeyboardButton(text=f"✅ {action_btn}", url=f"https://t.me/{SUPPORT_USERNAME}")],
            [InlineKeyboardButton(text="◀️ В главное меню", callback_data="back_to_main")]
        ])
        
        await callback.message.edit_text(order_text, reply_markup=menu)
    else:
        await callback.answer("❌ Ошибка создания заявки", show_alert=True)
    
    await state.clear()
    await callback.answer()

# --- Обработчики информационных кнопок ---
@router.callback_query(F.data.startswith("info_"))
async def handle_info(callback: CallbackQuery):
    info_type = callback.data.split("_")[1]
    text = INFO_TEXTS.get(info_type, "<b>Информация не найдена</b>")
    
    await callback.message.edit_text(text, reply_markup=get_back_menu())
    await callback.answer()

# --- Обработчики навигации (Назад) ---
@router.callback_query(F.data == "back_to_main")
async def back_to_main(callback: CallbackQuery, state: FSMContext):
    await state.clear()
    text = "<b>Привет! Благодарим за выбор нашего магазина.</b>"
    await callback.message.edit_text(text, reply_markup=get_main_menu())
    await callback.answer()

@router.callback_query(F.data == "back_to_servers")
async def back_to_servers(callback: CallbackQuery, state: FSMContext):
    data = await state.get_data()
    action = data.get("action", "buy")
    
    await state.set_state(UserStates.selecting_server)
    text = f"<b>{'🛒 Выберите сервер для покупки' if action == 'buy' else '💸 Выберите сервер для продажи'}:</b>"
    await callback.message.edit_text(text, reply_markup=get_servers_menu(action))
    await callback.answer()

async def main():
    logger.info(f"🚀 Бот запускается...")
    logger.info(f"📡 API URL: {API_BASE_URL}")
    logger.info(f"🤖 BOT_TOKEN: {'*' * 10}...{BOT_TOKEN[-5:] if len(BOT_TOKEN) > 5 else 'N/A'}")
    
    # Проверка токена перед запуском
    try:
        bot_info = await bot.get_me()
        logger.info(f"✅ Бот авторизован: @{bot_info.username} ({bot_info.first_name})")
    except Exception as e:
        logger.error(f"❌ Ошибка авторизации бота: {e}")
        logger.error("Проверьте правильность BOT_TOKEN в переменных окружения Railway!")
        raise
    
    dp.include_router(router)
    await bot.delete_webhook(drop_pending_updates=True)
    logger.info("✅ Бот успешно запущен и готов к работе!")
    await dp.start_polling(bot)

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logger.info("⛔ Бот остановлен")