const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";
const PUBLIC_DIR = __dirname;
const DATA_DIR = path.join(__dirname, "data");
const MENU_FILE = path.join(DATA_DIR, "menu.json");
const ORDERS_FILE = path.join(DATA_DIR, "orders.json");
const sessions = new Set();

const defaultMenuItems = [
  { id: "item-1", name: "Truffle Mushroom Veloute", category: "Starters", price: 16 },
  { id: "item-2", name: "Burrata with Heirloom Tomato", category: "Starters", price: 18 },
  { id: "item-3", name: "Seared Scallops", category: "Starters", price: 24 },
  { id: "item-4", name: "Gold Leaf Caesar", category: "Salads", price: 15 },
  { id: "item-5", name: "Pear & Walnut Garden", category: "Salads", price: 17 },
  { id: "item-6", name: "Wagyu Ribeye", category: "Mains", price: 68 },
  { id: "item-7", name: "Saffron Lobster Risotto", category: "Mains", price: 46 },
  { id: "item-8", name: "Herb Crusted Lamb Rack", category: "Mains", price: 52 },
  { id: "item-9", name: "Black Garlic Sea Bass", category: "Mains", price: 42 },
  { id: "item-10", name: "Wild Mushroom Tagliatelle", category: "Mains", price: 29 },
  { id: "item-11", name: "Vanilla Bean Creme Brulee", category: "Desserts", price: 13 },
  { id: "item-12", name: "Dark Chocolate Souffle", category: "Desserts", price: 15 },
  { id: "item-13", name: "Pistachio Rose Panna Cotta", category: "Desserts", price: 14 },
  { id: "item-14", name: "Signature Citrus Spritz", category: "Drinks", price: 12 },
  { id: "item-15", name: "Espresso Martini", category: "Drinks", price: 16 },
  { id: "item-16", name: "Still or Sparkling Water", category: "Drinks", price: 7 }
];

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml"
};

function ensureMenuFile() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(MENU_FILE)) {
    fs.writeFileSync(MENU_FILE, JSON.stringify(defaultMenuItems, null, 2));
  }
  if (!fs.existsSync(ORDERS_FILE)) {
    fs.writeFileSync(ORDERS_FILE, JSON.stringify([], null, 2));
  }
}

function readMenu() {
  ensureMenuFile();
  return JSON.parse(fs.readFileSync(MENU_FILE, "utf8"));
}

function writeMenu(items) {
  ensureMenuFile();
  fs.writeFileSync(MENU_FILE, JSON.stringify(items, null, 2));
}

function readOrders() {
  ensureMenuFile();
  return JSON.parse(fs.readFileSync(ORDERS_FILE, "utf8"));
}

function writeOrders(orders) {
  ensureMenuFile();
  fs.writeFileSync(ORDERS_FILE, JSON.stringify(orders, null, 2));
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function getBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        req.destroy();
        reject(new Error("Request body too large"));
      }
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
  });
}

function getToken(req) {
  const auth = req.headers.authorization || "";
  return auth.startsWith("Bearer ") ? auth.slice(7) : "";
}

function requireAdmin(req, res) {
  if (sessions.has(getToken(req))) return true;
  sendJson(res, 401, { error: "Unauthorized" });
  return false;
}

function cleanMenuItem(item) {
  const name = String(item.name || "").trim();
  const category = String(item.category || "").trim();
  const price = Number(item.price);

  if (!name || !category || Number.isNaN(price) || price < 0) {
    return null;
  }

  return {
    id: item.id || `item-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`,
    name,
    category,
    price
  };
}

function cleanOrder(body) {
  const customerName = String(body.customerName || "").trim();
  const tableNumber = String(body.tableNumber || "").trim();
  const note = String(body.note || "").trim();
  const orderItems = Array.isArray(body.items) ? body.items : [];

  if (!customerName || !tableNumber || !orderItems.length) return null;

  const menuById = new Map(readMenu().map((item) => [item.id, item]));
  const items = orderItems
    .map((item) => {
      const menuItem = menuById.get(String(item.id || ""));
      const quantity = Math.max(1, Math.floor(Number(item.quantity) || 0));
      if (!menuItem || !quantity) return null;

      return {
        id: menuItem.id,
        name: menuItem.name,
        category: menuItem.category,
        price: menuItem.price,
        quantity,
        lineTotal: Number((menuItem.price * quantity).toFixed(2))
      };
    })
    .filter(Boolean);

  if (!items.length) return null;

  const total = items.reduce((sum, item) => sum + item.lineTotal, 0);

  return {
    id: `order-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`,
    customerName,
    tableNumber,
    note,
    status: "Pending",
    items,
    total: Number(total.toFixed(2)),
    createdAt: new Date().toISOString()
  };
}

async function handleApi(req, res, pathname) {
  if (req.method === "GET" && pathname === "/api/menu") {
    sendJson(res, 200, { items: readMenu() });
    return;
  }

  const orderDeleteMatch = pathname.match(/^\/api\/orders\/([^/]+)$/);
  if (req.method === "DELETE" && orderDeleteMatch) {
    if (!requireAdmin(req, res)) return;

    const nextOrders = readOrders().filter((order) => order.id !== orderDeleteMatch[1]);
    writeOrders(nextOrders);
    sendJson(res, 200, { orders: nextOrders });
    return;
  }

  if (req.method === "POST" && pathname === "/api/orders") {
    const order = cleanOrder(await getBody(req));
    if (!order) {
      sendJson(res, 400, { error: "Invalid order" });
      return;
    }

    const orders = [order, ...readOrders()];
    writeOrders(orders);
    sendJson(res, 201, { order });
    return;
  }

  if (req.method === "POST" && pathname === "/api/login") {
    const body = await getBody(req);
    if (body.password !== ADMIN_PASSWORD) {
      sendJson(res, 401, { error: "Wrong password" });
      return;
    }

    const token = crypto.randomBytes(32).toString("hex");
    sessions.add(token);
    sendJson(res, 200, { token });
    return;
  }

  if (req.method === "POST" && pathname === "/api/logout") {
    sessions.delete(getToken(req));
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method === "POST" && pathname === "/api/menu") {
    if (!requireAdmin(req, res)) return;
    const item = cleanMenuItem(await getBody(req));
    if (!item) {
      sendJson(res, 400, { error: "Invalid menu item" });
      return;
    }

    const items = [item, ...readMenu()];
    writeMenu(items);
    sendJson(res, 201, { item, items });
    return;
  }

  const updateMatch = pathname.match(/^\/api\/menu\/([^/]+)$/);
  if (req.method === "PUT" && updateMatch) {
    if (!requireAdmin(req, res)) return;
    const items = readMenu();
    const item = cleanMenuItem({ ...(await getBody(req)), id: updateMatch[1] });
    if (!item) {
      sendJson(res, 400, { error: "Invalid menu item" });
      return;
    }

    const nextItems = items.map((current) => (current.id === updateMatch[1] ? item : current));
    writeMenu(nextItems);
    sendJson(res, 200, { item, items: nextItems });
    return;
  }

  if (req.method === "DELETE" && updateMatch) {
    if (!requireAdmin(req, res)) return;
    const nextItems = readMenu().filter((item) => item.id !== updateMatch[1]);
    writeMenu(nextItems);
    sendJson(res, 200, { items: nextItems });
    return;
  }

  if (req.method === "GET" && pathname === "/api/orders") {
    if (!requireAdmin(req, res)) return;
    sendJson(res, 200, { orders: readOrders() });
    return;
  }

  const orderStatusMatch = pathname.match(/^\/api\/orders\/([^/]+)\/status$/);
  if (req.method === "PUT" && orderStatusMatch) {
    if (!requireAdmin(req, res)) return;

    const allowedStatuses = ["Pending", "Preparing", "Completed", "Cancelled"];
    const body = await getBody(req);
    const status = String(body.status || "");

    if (!allowedStatuses.includes(status)) {
      sendJson(res, 400, { error: "Invalid order status" });
      return;
    }

    const orders = readOrders();
    const nextOrders = orders.map((order) => (
      order.id === orderStatusMatch[1] ? { ...order, status } : order
    ));
    writeOrders(nextOrders);
    sendJson(res, 200, { orders: nextOrders });
    return;
  }

  sendJson(res, 404, { error: "API route not found" });
}

function serveStatic(res, pathname) {
  const requestedPath = pathname === "/" || pathname.toLowerCase().includes("admin")
    ? "/index.html"
    : pathname;
  const filePath = path.normalize(path.join(PUBLIC_DIR, requestedPath));

  if (!filePath.startsWith(PUBLIC_DIR) || filePath.includes(`${path.sep}data${path.sep}`)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }

    const type = mimeTypes[path.extname(filePath).toLowerCase()] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": type });
    res.end(content);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname.startsWith("/api/")) {
      await handleApi(req, res, url.pathname);
      return;
    }
    serveStatic(res, url.pathname);
  } catch (error) {
    sendJson(res, 500, { error: error.message || "Server error" });
  }
});

ensureMenuFile();
server.listen(PORT, () => {
  console.log(`Restaurant menu server running on http://localhost:${PORT}`);
});
