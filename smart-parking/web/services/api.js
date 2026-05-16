// services/api.js

const DEFAULT_API_URL =
  typeof window === "undefined"
    ? "http://localhost:8000"
    : `http://${window.location.hostname}:8000`;

const API_BASE_URL = import.meta.env.VITE_API_URL || DEFAULT_API_URL;

// ======================================================
// NORMALIZE QR IMAGE URL
// ======================================================
function normalizeQrPayload(payload) {
  if (!payload?.filename && !payload?.image_url) {
    return payload;
  }

  const apiUrl = new URL(API_BASE_URL);

  const imageUrl = payload.filename
    ? new URL(`/img/qrs/${payload.filename}`, apiUrl)
    : new URL(payload.image_url);

  imageUrl.protocol = apiUrl.protocol;
  imageUrl.hostname = apiUrl.hostname;
  imageUrl.port = apiUrl.port;
  imageUrl.searchParams.set(
    "v",
    payload.created_at || Date.now().toString()
  );

  return {
    ...payload,
    image_url: imageUrl.toString(),
    display_url: imageUrl.toString(),
  };
}

// ======================================================
// NORMALIZE CAMERA IMAGE URL
// ======================================================
function normalizeCameraPayload(payload) {
  if (!payload?.filename && !payload?.image_url) {
    return payload;
  }

  const apiUrl = new URL(API_BASE_URL);

  const imageUrl = payload.filename
    ? new URL(`/uploads/${payload.filename}`, apiUrl)
    : new URL(payload.image_url);

  imageUrl.protocol = apiUrl.protocol;
  imageUrl.hostname = apiUrl.hostname;
  imageUrl.port = apiUrl.port;
  imageUrl.searchParams.set(
    "v",
    payload.created_at || Date.now().toString()
  );

  return {
    ...payload,
    image_url: imageUrl.toString(),
    display_url: imageUrl.toString(),
  };
}

// ======================================================
// BUILD LIVE STREAM URL
// ======================================================
export function getCameraStreamUrl() {
  const apiUrl = new URL(API_BASE_URL);
  const streamUrl = new URL("/api/camera/stream", apiUrl);

  // Cache busting
  streamUrl.searchParams.set("t", Date.now().toString());

  return streamUrl.toString();
}

// ======================================================
// GENERIC REQUEST
// ======================================================
async function request(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
    ...options,
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || "Khong the ket noi API");
  }

  return response.json();
}

// ======================================================
// QR APIs
// ======================================================
export function createQr(data) {
  return request("/api/qr", {
    method: "POST",
    body: JSON.stringify({ data: data || null }),
  }).then(normalizeQrPayload);
}

export function getLatestQr() {
  return request("/api/qr/latest").then(normalizeQrPayload);
}

// ======================================================
// CAMERA APIs
// ======================================================
export function getLatestCameraFrame() {
  return request("/api/camera/latest").then(normalizeCameraPayload);
}

export function turnCameraOn() {
  return request("/api/camera/on", {
    method: "POST",
  });
}

export function turnCameraOff() {
  return request("/api/camera/off", {
    method: "POST",
  });
}

export function captureCameraImage() {
  return request("/api/camera/capture", {
    method: "POST",
  });
}

export function getCameraStatus() {
  return request("/api/camera/status");
}

// ======================================================
// PARKING SLOT APIs
// ======================================================
export function getSlots() {
  return request("/api/slots");
}

export function updateSlots(slots) {
  return request("/api/slots/update", {
    method: "POST",
    body: JSON.stringify({ slots }),
  });
}

// ======================================================
// ENTRY APIs
// ======================================================
export function detectEntry() {
  return request("/api/entry/detect", {
    method: "POST",
  }).then((payload) => {
    if (payload?.ticket?.qr) {
      return {
        ...payload,
        ticket: {
          ...payload.ticket,
          qr: normalizeQrPayload(payload.ticket.qr),
        },
      };
    }

    return payload;
  });
}

// ======================================================
// TICKET APIs
// ======================================================
export function getTickets() {
  return request("/api/tickets");
}

export function getTicket(ticketId) {
  return request(`/api/tickets/${ticketId}`);
}

// ======================================================
// EXPORTS
// ======================================================
export { API_BASE_URL };