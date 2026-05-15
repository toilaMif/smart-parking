# backend/app/main.py
"""
API đơn giản để 2 ESP32 giao tiếp với nhau

ESP32 #1:
- POST /api/command
  {"command": "bat_den"}

ESP32 #2:
- GET /api/command
- POST /api/reset
"""

from fastapi import FastAPI
from pydantic import BaseModel
from datetime import datetime

app = FastAPI(title="ESP32 Communication API")

# ==========================================
# BIẾN TOÀN CỤC
# ==========================================
current_command = "idle"
last_updated = None


# ==========================================
# MODEL
# ==========================================
class CommandRequest(BaseModel):
    command: str


# ==========================================
# ROOT
# ==========================================
@app.get("/")
def root():
    return {
        "message": "ESP32 Communication API Running"
    }


# ==========================================
# ESP32 #1 GỬI LỆNH
# ==========================================
@app.post("/api/command")
def set_command(data: CommandRequest):
    global current_command, last_updated

    current_command = data.command
    last_updated = datetime.now().isoformat()

    return {
        "success": True,
        "command": current_command,
        "updated_at": last_updated
    }


# ==========================================
# ESP32 #2 NHẬN LỆNH
# ==========================================
@app.get("/api/command")
def get_command():
    return {
        "command": current_command,
        "updated_at": last_updated
    }


# ==========================================
# RESET SAU KHI THỰC THI
# ==========================================
@app.post("/api/reset")
def reset_command():
    global current_command, last_updated

    current_command = "idle"
    last_updated = datetime.now().isoformat()

    return {
        "success": True,
        "command": current_command
    }


# ==========================================
# XEM TRẠNG THÁI
# ==========================================
@app.get("/api/status")
def status():
    return {
        "current_command": current_command,
        "last_updated": last_updated
    }