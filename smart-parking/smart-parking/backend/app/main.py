from datetime import datetime
from pathlib import Path
from uuid import uuid4

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from app.services.fee import calculate_fee
from app.services.qr import generate_qr

from fastapi.responses import StreamingResponse
import requests
from random import randint

app = FastAPI(title="ESP32 Communication API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

BACKEND_DIR = Path(__file__).resolve().parents[1]
UPLOAD_DIR = BACKEND_DIR / "uploads"
IMG_DIR = BACKEND_DIR / "img"
QR_DIR = IMG_DIR / "qrs"

UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
QR_DIR.mkdir(parents=True, exist_ok=True)

app.mount("/uploads", StaticFiles(directory=str(UPLOAD_DIR)), name="uploads")
app.mount("/img", StaticFiles(directory=str(IMG_DIR)), name="img")

current_command = "idle"
last_updated = None
latest_qr = None
latest_camera_frame = None
parking_slots = {
    "A1": {"slot_id": "A1", "status": "empty", "updated_at": datetime.now().isoformat()},
    "A2": {"slot_id": "A2", "status": "empty", "updated_at": datetime.now().isoformat()},
    "B1": {"slot_id": "B1", "status": "empty", "updated_at": datetime.now().isoformat()},
    "B2": {"slot_id": "B2", "status": "empty", "updated_at": datetime.now().isoformat()},
    "C1": {"slot_id": "C1", "status": "empty", "updated_at": datetime.now().isoformat()},
    "C2": {"slot_id": "C2", "status": "empty", "updated_at": datetime.now().isoformat()},
}
parking_tickets = {}


class CommandRequest(BaseModel):
    command: str


class QRRequest(BaseModel):
    data: str | None = None


class SlotStatus(BaseModel):
    slot_id: str
    status: str


class SlotsUpdateRequest(BaseModel):
    slots: list[SlotStatus]
    empty_count: int | None = None


class TicketActionRequest(BaseModel):
    ticket_id: str


class PaymentRequest(BaseModel):
    ticket_id: str
    method: str | None = "cash"


class ExitRequest(BaseModel):
    ticket_id: str


@app.get("/")
def root():
    return {"message": "ESP32 Communication API Running"}


@app.post("/api/command")
def set_command(data: CommandRequest):
    global current_command, last_updated

    current_command = data.command
    last_updated = datetime.now().isoformat()

    return {
        "success": True,
        "command": current_command,
        "updated_at": last_updated,
    }


@app.get("/api/command")
def get_command():
    return {
        "command": current_command,
        "updated_at": last_updated,
    }


@app.post("/api/reset")
def reset_command():
    global current_command, last_updated

    current_command = "idle"
    last_updated = datetime.now().isoformat()

    return {
        "success": True,
        "command": current_command,
    }


@app.get("/api/status")
def status():
    return {
        "current_command": current_command,
        "last_updated": last_updated,
        "empty_count": get_empty_count(),
        "active_tickets": get_active_ticket_count(),
    }


def get_empty_count():
    return sum(1 for slot in parking_slots.values() if slot["status"] == "empty")


def get_active_ticket_count():
    return sum(1 for ticket in parking_tickets.values() if ticket["status"] == "active")


def assign_empty_slot():
    for slot in parking_slots.values():
        if slot["status"] == "empty":
            return slot["slot_id"]
    return None


def create_ticket_payload(ticket_id: str, slot_id: str | None, qr_payload: dict):
    return {
        "ticket_id": ticket_id,
        "user_id": None,
        "slot_id": slot_id,
        "entry_time": datetime.now().isoformat(),
        "exit_time": None,
        "vehicle_image": latest_camera_frame["image_url"] if latest_camera_frame else None,
        "plate_number": None,
        "fee": 0,
        "payment_status": "unpaid",
        "scan_status": "pending",
        "status": "created",
        "qr": qr_payload,
    }


@app.post("/api/camera/on")
def camera_on():
    global current_command, last_updated

    current_command = "camera_on"
    last_updated = datetime.now().isoformat()

    return {
        "success": True,
        "command": current_command,
        "updated_at": last_updated,
        "message": "Turn on ESP32-CAM",
    }


@app.post("/api/camera/off")
def camera_off():
    global current_command, last_updated

    current_command = "camera_off"
    last_updated = datetime.now().isoformat()

    return {
        "success": True,
        "command": current_command,
        "updated_at": last_updated,
        "message": "Turn off ESP32-CAM",
    }


@app.post("/api/camera/capture")
def camera_capture():
    global current_command, last_updated

    current_command = "capture_image"
    last_updated = datetime.now().isoformat()

    return {
        "success": True,
        "command": current_command,
        "updated_at": last_updated,
        "message": "Capture image from ESP32-CAM",
    }


@app.post("/api/upload")
async def upload_image(request: Request):
    global latest_camera_frame

    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

    image_bytes = await request.body()
    filename = datetime.now().strftime("%Y%m%d_%H%M%S") + ".jpg"
    filepath = UPLOAD_DIR / filename

    with open(filepath, "wb") as f:
        f.write(image_bytes)

    latest_camera_frame = {
        "success": True,
        "filename": filename,
        "image_url": str(request.base_url).rstrip("/") + f"/uploads/{filename}",
        "created_at": datetime.now().isoformat(),
    }

    return latest_camera_frame


@app.get("/api/camera/latest")
def get_latest_camera_frame(request: Request):
    if latest_camera_frame:
        return latest_camera_frame

    images = sorted(UPLOAD_DIR.glob("*.jpg"), key=lambda path: path.stat().st_mtime, reverse=True)
    if not images:
        return {
            "success": False,
            "message": "No camera frame uploaded yet",
            "image_url": None,
        }

    latest_image = images[0]
    return {
        "success": True,
        "filename": latest_image.name,
        "image_url": str(request.base_url).rstrip("/") + f"/uploads/{latest_image.name}",
        "created_at": datetime.fromtimestamp(latest_image.stat().st_mtime).isoformat(),
    }


def build_qr_payload(request: Request, filename: str, data: str, created_at: str):
    image_url = str(request.base_url).rstrip("/") + f"/img/qrs/{filename}"
    return {
        "success": True,
        "data": data,
        "filename": filename,
        "image_url": image_url,
        "created_at": created_at,
    }


@app.post("/api/qr")
def create_qr(payload: QRRequest, request: Request):
    """
    Tạo QR với nội dung:
        PARKING-12345

    File ảnh:
        parking_12345.png
    """
    global latest_qr

    now = datetime.now()
    created_at = now.isoformat()

    # Sinh số ngẫu nhiên 5 chữ số (10000 -> 99999)
    random_number = randint(10000, 99999)

    # Nội dung QR
    qr_data = f"PARKING-{random_number}"

    # Tên file ảnh
    filename = f"parking_{random_number}.png"
    filepath = QR_DIR / filename

    # Tạo file QR
    generate_qr(qr_data, str(filepath))

    # Payload trả về
    latest_qr = build_qr_payload(
        request=request,
        filename=filename,
        data=qr_data,
        created_at=created_at,
    )

    return latest_qr

@app.get("/api/qr/latest")
def get_latest_qr(request: Request):
    """
    Luôn trả về QR của ngày hiện tại.
    Nếu chưa có thì tự động tạo.
    """
    return create_qr(QRRequest(), request)


@app.post("/api/slots/update")
def update_slots(payload: SlotsUpdateRequest):
    updated_at = datetime.now().isoformat()

    for slot in payload.slots:
        normalized_status = slot.status.lower()
        if normalized_status not in {"empty", "occupied"}:
            normalized_status = "empty"

        parking_slots[slot.slot_id] = {
            "slot_id": slot.slot_id,
            "status": normalized_status,
            "updated_at": updated_at,
        }

    return {
        "success": True,
        "slots": list(parking_slots.values()),
        "empty_count": get_empty_count(),
        "updated_at": updated_at,
    }


@app.get("/api/slots")
def get_slots():
    return {
        "success": True,
        "slots": list(parking_slots.values()),
        "empty_count": get_empty_count(),
        "updated_at": datetime.now().isoformat(),
    }


@app.post("/api/entry/detect")
def entry_detect(request: Request):
    if get_empty_count() <= 0:
        return {
            "success": False,
            "message": "Parking Full",
            "empty_count": 0,
        }

    slot_id = assign_empty_slot()
    ticket_id = "TICKET-" + datetime.now().strftime("%Y%m%d%H%M%S") + "-" + uuid4().hex[:5].upper()
    qr_data = f"SMART-PARKING|TICKET:{ticket_id}|SLOT:{slot_id}|ENTRY:{datetime.now().isoformat()}"
    qr_payload = create_qr(QRRequest(data=qr_data), request)
    ticket = create_ticket_payload(ticket_id, slot_id, qr_payload)
    parking_tickets[ticket_id] = ticket

    return {
        "success": True,
        "message": "Ticket created",
        "ticket": ticket,
        "empty_count": get_empty_count(),
    }


@app.post("/api/tickets/scan")
def confirm_ticket_scan(payload: TicketActionRequest):
    global current_command, last_updated

    ticket = parking_tickets.get(payload.ticket_id)
    if not ticket:
        return {"success": False, "message": "Ticket not found"}

    if ticket["status"] not in {"created", "active"}:
        return {"success": False, "message": "Ticket is not valid for entry", "ticket": ticket}

    ticket["scan_status"] = "confirmed"
    ticket["status"] = "active"
    ticket["vehicle_image"] = latest_camera_frame["image_url"] if latest_camera_frame else ticket["vehicle_image"]
    if ticket.get("slot_id") in parking_slots:
        parking_slots[ticket["slot_id"]]["status"] = "occupied"
        parking_slots[ticket["slot_id"]]["updated_at"] = datetime.now().isoformat()

    current_command = "open_entry_gate"
    last_updated = datetime.now().isoformat()

    return {
        "success": True,
        "message": "Ticket confirmed, open entry gate",
        "ticket": ticket,
        "command": current_command,
    }


@app.get("/api/tickets")
def get_tickets():
    return {
        "success": True,
        "tickets": list(parking_tickets.values()),
        "active_count": get_active_ticket_count(),
    }


@app.get("/api/tickets/{ticket_id}")
def get_ticket(ticket_id: str):
    ticket = parking_tickets.get(ticket_id)
    if not ticket:
        return {"success": False, "message": "Ticket not found"}

    return {"success": True, "ticket": ticket}


@app.post("/api/exit/verify")
def verify_exit(payload: ExitRequest):
    ticket = parking_tickets.get(payload.ticket_id)
    if not ticket:
        return {"success": False, "message": "Ticket not found"}

    if ticket["status"] != "active":
        return {"success": False, "message": "Ticket is not active", "ticket": ticket}

    entry_time = datetime.fromisoformat(ticket["entry_time"])
    duration_hours = max((datetime.now() - entry_time).total_seconds() / 3600, 0.01)
    ticket["fee"] = calculate_fee(duration_hours)

    return {
        "success": True,
        "ticket": ticket,
        "duration_hours": round(duration_hours, 2),
        "fee": ticket["fee"],
    }


@app.post("/api/payment/confirm")
def confirm_payment(payload: PaymentRequest):
    ticket = parking_tickets.get(payload.ticket_id)
    if not ticket:
        return {"success": False, "message": "Ticket not found"}

    if ticket["fee"] <= 0:
        entry_time = datetime.fromisoformat(ticket["entry_time"])
        duration_hours = max((datetime.now() - entry_time).total_seconds() / 3600, 0.01)
        ticket["fee"] = calculate_fee(duration_hours)

    ticket["payment_status"] = "paid"
    ticket["payment_method"] = payload.method

    return {
        "success": True,
        "message": "Payment confirmed",
        "ticket": ticket,
    }


@app.post("/api/exit/open")
def open_exit_gate(payload: ExitRequest):
    global current_command, last_updated

    ticket = parking_tickets.get(payload.ticket_id)
    if not ticket:
        return {"success": False, "message": "Ticket not found"}

    if ticket["payment_status"] != "paid":
        return {"success": False, "message": "Payment required", "ticket": ticket}

    ticket["exit_time"] = datetime.now().isoformat()
    ticket["status"] = "completed"
    if ticket.get("slot_id") in parking_slots:
        parking_slots[ticket["slot_id"]]["status"] = "empty"
        parking_slots[ticket["slot_id"]]["updated_at"] = datetime.now().isoformat()

    current_command = "open_exit_gate"
    last_updated = datetime.now().isoformat()

    return {
        "success": True,
        "message": "Open exit gate",
        "ticket": ticket,
        "command": current_command,
    }
ESP32_CAM_STREAM_URL = "http://192.168.1.100:81/stream"  # Replace with your ESP32-CAM IP


@app.get("/api/camera/stream")
def camera_stream():
    """
    Proxy live stream from ESP32-CAM to frontend.

    Frontend usage:
        <img src="http://localhost:8000/api/camera/stream" />

    Returns:
        multipart/x-mixed-replace MJPEG stream.
    """

    def generate():
        with requests.get(ESP32_CAM_STREAM_URL, stream=True, timeout=10) as response:
            if response.status_code != 200:
                raise RuntimeError("Cannot connect to ESP32-CAM")

            for chunk in response.iter_content(chunk_size=1024):
                if chunk:
                    yield chunk

    return StreamingResponse(
        generate(),
        media_type="multipart/x-mixed-replace; boundary=frame",
    )


@app.get("/api/camera/status")
def camera_status():
    """
    Check whether ESP32-CAM stream is reachable.
    """
    try:
        response = requests.get(ESP32_CAM_STREAM_URL, timeout=5)
        return {
            "success": response.status_code == 200,
            "camera_url": ESP32_CAM_STREAM_URL,
            "status_code": response.status_code,
        }
    except Exception as e:
        return {
            "success": False,
            "camera_url": ESP32_CAM_STREAM_URL,
            "error": str(e),
        }


@app.post("/api/camera/set-url")
def set_camera_url(payload: dict):
    """
    Dynamically update ESP32-CAM stream URL.
    Example:
    {
        "url": "http://192.168.1.150:81/stream"
    }
    """
    global ESP32_CAM_STREAM_URL

    if "url" not in payload:
        return {
            "success": False,
            "message": "Missing 'url' field",
        }

    ESP32_CAM_STREAM_URL = payload["url"]

    return {
        "success": True,
        "camera_url": ESP32_CAM_STREAM_URL,
    }