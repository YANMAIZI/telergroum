from fastapi import FastAPI, APIRouter, HTTPException
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional
import uuid
from datetime import datetime, timezone, timedelta


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create the main app without a prefix
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")


# Define Models
class StatusCheck(BaseModel):
    model_config = ConfigDict(extra="ignore")  # Ignore MongoDB's _id field
    
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    client_name: str
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class StatusCheckCreate(BaseModel):
    client_name: str

# ==========================================
# BANNED USERS MODELS
# ==========================================

class BannedUser(BaseModel):
    model_config = ConfigDict(extra="ignore")
    
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str  # Telegram user ID
    username: Optional[str] = None  # Telegram username
    banned_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    banned_until: Optional[datetime] = None  # None = permanent, datetime = temporary
    banned_by: str  # Admin username who banned

class BanUserRequest(BaseModel):
    user_id: str
    username: Optional[str] = None
    days: Optional[int] = None  # None = permanent, number = days until unban
    banned_by: str = "admin"

# Add your routes to the router instead of directly to app
@api_router.get("/")
async def root():
    return {"message": "Hello World"}

@api_router.post("/status", response_model=StatusCheck)
async def create_status_check(input: StatusCheckCreate):
    status_dict = input.model_dump()
    status_obj = StatusCheck(**status_dict)
    
    # Convert to dict and serialize datetime to ISO string for MongoDB
    doc = status_obj.model_dump()
    doc['timestamp'] = doc['timestamp'].isoformat()
    
    _ = await db.status_checks.insert_one(doc)
    return status_obj

@api_router.get("/status", response_model=List[StatusCheck])
async def get_status_checks():
    # Exclude MongoDB's _id field from the query results
    status_checks = await db.status_checks.find({}, {"_id": 0}).to_list(1000)
    
    # Convert ISO string timestamps back to datetime objects
    for check in status_checks:
        if isinstance(check['timestamp'], str):
            check['timestamp'] = datetime.fromisoformat(check['timestamp'])
    
    return status_checks

# ==========================================
# BANNED USERS ENDPOINTS
# ==========================================

@api_router.get("/banned/{user_id}")
async def check_user_banned(user_id: str):
    """Check if a user is banned"""
    try:
        # Find ban record for user
        ban_record = await db.banned_users.find_one({"user_id": user_id}, {"_id": 0})
        
        if not ban_record:
            return {"banned": False}
        
        # Check if ban has expired
        if ban_record.get('banned_until'):
            banned_until = ban_record['banned_until']
            if isinstance(banned_until, str):
                banned_until = datetime.fromisoformat(banned_until)
            
            # If ban expired, remove it and return not banned
            if banned_until < datetime.now(timezone.utc):
                await db.banned_users.delete_one({"user_id": user_id})
                return {"banned": False}
        
        # User is still banned
        return {
            "banned": True,
            "banned_until": ban_record.get('banned_until'),
            "username": ban_record.get('username')
        }
    except Exception as e:
        logger.error(f"Error checking ban status: {e}")
        return {"banned": False}

@api_router.post("/banned")
async def ban_user(request: BanUserRequest):
    """Ban a user (temporary or permanent)"""
    try:
        # Calculate ban expiry if days specified
        banned_until = None
        if request.days:
            banned_until = datetime.now(timezone.utc) + timedelta(days=request.days)
        
        # Create ban record
        ban_doc = {
            "id": str(uuid.uuid4()),
            "user_id": request.user_id,
            "username": request.username,
            "banned_at": datetime.now(timezone.utc).isoformat(),
            "banned_until": banned_until.isoformat() if banned_until else None,
            "banned_by": request.banned_by
        }
        
        # Update or insert ban record
        await db.banned_users.update_one(
            {"user_id": request.user_id},
            {"$set": ban_doc},
            upsert=True
        )
        
        logger.info(f"User {request.user_id} banned by {request.banned_by}")
        
        return {
            "success": True,
            "message": f"User banned {'permanently' if not request.days else f'for {request.days} days'}",
            "banned_until": banned_until.isoformat() if banned_until else None
        }
    except Exception as e:
        logger.error(f"Error banning user: {e}")
        raise HTTPException(status_code=500, detail="Failed to ban user")

@api_router.delete("/banned/{user_id}")
async def unban_user(user_id: str):
    """Unban a user"""
    try:
        result = await db.banned_users.delete_one({"user_id": user_id})
        
        if result.deleted_count > 0:
            logger.info(f"User {user_id} unbanned")
            return {"success": True, "message": "User unbanned successfully"}
        else:
            return {"success": False, "message": "User was not banned"}
    except Exception as e:
        logger.error(f"Error unbanning user: {e}")
        raise HTTPException(status_code=500, detail="Failed to unban user")

@api_router.get("/banned")
async def get_banned_users():
    """Get list of all banned users"""
    try:
        banned_users = await db.banned_users.find({}, {"_id": 0}).to_list(1000)
        
        # Convert ISO strings back to datetime for filtering expired bans
        current_time = datetime.now(timezone.utc)
        active_bans = []
        
        for ban in banned_users:
            if ban.get('banned_until'):
                banned_until = datetime.fromisoformat(ban['banned_until'])
                # Remove expired bans
                if banned_until < current_time:
                    await db.banned_users.delete_one({"user_id": ban['user_id']})
                    continue
            active_bans.append(ban)
        
        return active_bans
    except Exception as e:
        logger.error(f"Error getting banned users: {e}")
        return []

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()