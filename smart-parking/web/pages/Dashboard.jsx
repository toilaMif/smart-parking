// src/pages/Dashboard.jsx
import { useEffect, useState } from "react";
import {
  API_BASE_URL,
  createQr,
  detectEntry,
  getLatestQr,
  getSlots,
  getTickets,
  turnCameraOff,
  turnCameraOn,
  updateSlots,
} from "../services/api.js";

// URL stream trực tiếp từ ESP32-CAM
const ESP32_STREAM_URL = "http://10.237.28.240:81/stream";

export default function Dashboard() {
  const [qr, setQr] = useState(null);
  const [slots, setSlots] = useState([]);
  const [tickets, setTickets] = useState([]);
  const [data, setData] = useState("");

  const [loading, setLoading] = useState(false);
  const [cameraLoading, setCameraLoading] = useState(false);

  const [error, setError] = useState("");
  const [cameraError, setCameraError] = useState("");
  const [imageError, setImageError] = useState("");

  // Để reload stream khi bật/tắt camera hoặc khi lỗi
  const [streamKey, setStreamKey] = useState(Date.now());

  // ===== Derived Data =====
  const emptyCount = slots.filter((slot) => slot.status === "empty").length;

  const activeTickets = tickets.filter((ticket) => ticket.status === "active");

  // ===== Helpers =====
  function setQrResult(result) {
    setQr(result);
    setImageError("");
  }

  // ===== API Calls =====
  async function loadLatestQr() {
    try {
      setLoading(true);
      setError("");

      const result = await getLatestQr();
      setQrResult(result);
    } catch (err) {
      setError(err.message || "Không tải được QR");
    } finally {
      setLoading(false);
    }
  }

  async function loadParkingState() {
    try {
      const [slotResult, ticketResult] = await Promise.all([
        getSlots(),
        getTickets(),
      ]);

      setSlots(slotResult?.slots || []);
      setTickets(ticketResult?.tickets || []);
    } catch (err) {
      setError(err.message || "Không tải được trạng thái bãi xe");
    }
  }

  async function handleCreateQr(event) {
    event.preventDefault();

    if (!data.trim()) {
      setError("Vui lòng nhập nội dung QR");
      return;
    }

    try {
      setLoading(true);
      setError("");

      const result = await createQr(data.trim());
      setQrResult(result);
      setData("");
    } catch (err) {
      setError(err.message || "Không tạo được QR");
    } finally {
      setLoading(false);
    }
  }

  async function handleCameraCommand(command) {
    try {
      setCameraLoading(true);
      setCameraError("");

      if (command === "on") {
        await turnCameraOn();
      } else {
        await turnCameraOff();
      }

      // Reload stream
      setStreamKey(Date.now());
    } catch (err) {
      setCameraError(err.message || "Không gửi được lệnh camera");
    } finally {
      setCameraLoading(false);
    }
  }

  async function handleEntryDetect() {
    try {
      setLoading(true);
      setError("");

      const result = await detectEntry();

      if (!result.success) {
        setError(result.message || "Không tạo được vé vào cổng");
        return;
      }

      setQrResult(result.ticket.qr);
      await loadParkingState();
    } catch (err) {
      setError(err.message || "Không gọi được detectEntry()");
    } finally {
      setLoading(false);
    }
  }

  async function handleDemoYoloUpdate() {
    try {
      setError("");

      const nextSlots = (
        slots.length
          ? slots
          : ["A1", "A2", "B1", "B2", "C1", "C2"].map((slot_id) => ({ slot_id }))
      ).map((slot, index) => ({
        slot_id: slot.slot_id,
        status: index % 3 === 0 ? "occupied" : "empty",
      }));

      await updateSlots(nextSlots);
      await loadParkingState();
    } catch (err) {
      setError(err.message || "Không cập nhật được slot");
    }
  }

  // ===== Initial Load =====
  useEffect(() => {
    loadLatestQr();
    loadParkingState();

    const timer = window.setInterval(() => {
      loadParkingState();
    }, 1000);

    return () => window.clearInterval(timer);
  }, []);

  // ===== URLs =====
  const qrImageUrl = qr?.display_url || qr?.image_url || "";

  const streamUrl = `${ESP32_STREAM_URL}?t=${streamKey}`;

  // ===== Render =====
  return (
    <main className="page">
      <section className="dashboard">
        {/* ================= TOPBAR ================= */}
        <div className="topbar">
          <div>
            <h1>Auto Parking TT</h1>
          </div>

          <section className="stats-grid">
            <div className="stat-card">
              <span>Chỗ trống</span>
              <strong>{emptyCount}</strong>
            </div>

            <div className="stat-card">
              <span>Xe đang gửi</span>
              <strong>{activeTickets.length}</strong>
            </div>

            <div className="stat-card">
              <span>Tổng slot</span>
              <strong>{slots.length}</strong>
            </div>
          </section>

          <p className="api-badge">{API_BASE_URL}</p>
        </div>

        {/* ================= MAIN GRID ================= */}
        <section className="screen-grid">
          {/* ============ CAMERA PANEL ============ */}
          <section className="camera-panel">
            <div className="section-heading compact">
              <h2>ESP32-CAM Live Stream</h2>
            </div>

            <div className="camera-view">
              <img
                key={streamKey}
                src={streamUrl}
                alt="ESP32-CAM Live Stream"
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  borderRadius: "16px",
                }}
                onLoad={() => setCameraError("")}
                onError={() => setCameraError("Không kết nối được ESP32-CAM")}
              />
            </div>

            <div className="camera-meta">
              {cameraError ? <strong>{cameraError}</strong> : null}
            </div>
          </section>

          {/* ============ SLOT PANEL ============ */}
          <section className="slot-panel">
            <div className="section-heading compact">
              <h2>Parking Slot Map</h2>

              <div className="actions">
                <button type="button" onClick={handleDemoYoloUpdate}>
                  Demo
                </button>

                <button
                  type="button"
                  className="secondary"
                  onClick={handleEntryDetect}
                  disabled={loading}
                >
                  Xe vào
                </button>
              </div>
            </div>

            <div className="slot-map">
              {slots.map((slot) => (
                <div key={slot.slot_id} className={`slot-tile ${slot.status}`}>
                  <strong>{slot.slot_id}</strong>
                  <span>{slot.status}</span>
                </div>
              ))}
            </div>
          </section>

          {/* ============ QR CONTROL ============ */}
          <div className="qr-control">
            <div className="section-heading compact">
              <h2>Nhập mã trong điện thoại để ra</h2>
            </div>

            <form className="qr-form" onSubmit={handleCreateQr}>
              <textarea
                id="qr-data"
                value={data}
                onChange={(e) => setData(e.target.value)}
                placeholder="VD: BIENSO:59A-12345 | SLOT:A01"
                rows="3"
              />

              <div className="actions">
                <button type="submit" disabled={loading}>
                  {loading ? "Đang tạo..." : "Xác nhận"}
                </button>
              </div>
            </form>

            {error ? <p className="error">{error}</p> : null}
          </div>

          {/* ============ QR PREVIEW ============ */}
          <aside className="preview" aria-live="polite">
            <div className="qr-frame">
              {qrImageUrl ? (
                <img
                  key={qrImageUrl}
                  src={qrImageUrl}
                  alt="Mã QR Smart Parking"
                  onLoad={() => setImageError("")}
                  onError={() =>
                    setImageError(`Không tải được ảnh QR: ${qrImageUrl}`)
                  }
                />
              ) : (
                <span>Chưa có QR</span>
              )}
            </div>

            {imageError ? <p className="image-error">{imageError}</p> : null}

            <div className="qr-meta">
              <p className="label">Dữ liệu QR</p>

              <p className="qr-data">{qr?.data || "Đang chờ dữ liệu"}</p>

              <p className="time">
                {qr?.created_at
                  ? `Tạo lúc ${new Date(qr.created_at).toLocaleString()}`
                  : ""}
              </p>
            </div>
          </aside>
        </section>
      </section>
    </main>
  );
}
