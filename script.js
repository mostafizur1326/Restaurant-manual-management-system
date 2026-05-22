const SESSION_TOKEN_KEY = "aurora-admin-token";

const menuContainer = document.querySelector("#menuItems");
const categoryTabs = document.querySelector("#categoryTabs");
const searchInput = document.querySelector("#searchInput");
const emptyState = document.querySelector("#emptyState");
const adminAccessButton = document.querySelector("#adminAccessButton");
const adminLogin = document.querySelector("#adminLogin");
const adminLoginForm = document.querySelector("#adminLoginForm");
const adminPassword = document.querySelector("#adminPassword");
const loginError = document.querySelector("#loginError");
const closeLogin = document.querySelector("#closeLogin");
const adminPanel = document.querySelector("#adminPanel");
const menuForm = document.querySelector("#menuForm");
const editingId = document.querySelector("#editingId");
const itemName = document.querySelector("#itemName");
const itemCategory = document.querySelector("#itemCategory");
const itemPrice = document.querySelector("#itemPrice");
const saveItemButton = document.querySelector("#saveItemButton");
const cancelEditButton = document.querySelector("#cancelEditButton");
const adminTableBody = document.querySelector("#adminTableBody");
const logoutButton = document.querySelector("#logoutButton");
const orderCart = document.querySelector("#orderCart");
const cartItems = document.querySelector("#cartItems");
const cartEmpty = document.querySelector("#cartEmpty");
const cartTotal = document.querySelector("#cartTotal");
const orderForm = document.querySelector("#orderForm");
const customerName = document.querySelector("#customerName");
const tableNumber = document.querySelector("#tableNumber");
const orderNote = document.querySelector("#orderNote");
const orderMessage = document.querySelector("#orderMessage");
const ordersList = document.querySelector("#ordersList");
const ordersEmpty = document.querySelector("#ordersEmpty");
const refreshOrdersButton = document.querySelector("#refreshOrdersButton");
const enableSoundButton = document.querySelector("#enableSoundButton");
const orderSound = document.querySelector("#orderSound");

let menuItems = [];
let cart = [];
let orders = [];
let activeCategory = "All";
let soundEnabled = false;
let ordersLoadedOnce = false;

const formatPrice = (price) => `$${Number(price).toFixed(2)}`;
const getAdminToken = () => sessionStorage.getItem(SESSION_TOKEN_KEY);
const setAdminToken = (token) => sessionStorage.setItem(SESSION_TOKEN_KEY, token);
const clearAdminToken = () => sessionStorage.removeItem(SESSION_TOKEN_KEY);
const escapeHtml = (value) => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

async function apiRequest(path, options = {}) {
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {})
  };
  const token = getAdminToken();

  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(path, { ...options, headers });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || "Request failed");
  }

  return data;
}

async function loadMenuItems() {
  const data = await apiRequest("/api/menu");
  menuItems = data.items || [];
  refreshMenuViews();
}

async function loadOrders() {
  if (!getAdminToken()) return;

  const data = await apiRequest("/api/orders");
  const nextOrders = data.orders || [];
  const previousOrderIds = new Set(orders.map((order) => order.id));
  const hasNewOrder = ordersLoadedOnce && nextOrders.some((order) => !previousOrderIds.has(order.id));
  orders = nextOrders;
  ordersLoadedOnce = true;
  renderOrders();

  if (hasNewOrder) {
    playOrderSound();
  }
}

function getCategories() {
  return ["All", ...new Set(menuItems.map((item) => item.category).filter(Boolean))];
}

function renderTabs() {
  const categories = getCategories();
  if (!categories.includes(activeCategory)) activeCategory = "All";

  categoryTabs.innerHTML = categories
    .map((category) => {
      const isActive = category === activeCategory;
      return `<button type="button" aria-pressed="${isActive}" data-category="${category}">${category}</button>`;
    })
    .join("");
}

function renderMenu() {
  const query = searchInput.value.trim().toLowerCase();
  const filteredItems = menuItems.filter((item) => {
    const matchesCategory = activeCategory === "All" || item.category === activeCategory;
    const matchesQuery = item.name.toLowerCase().includes(query);
    return matchesCategory && matchesQuery;
  });

  menuContainer.innerHTML = filteredItems
    .map((item) => `
      <article class="menu-item">
        <div>
          <h3 class="menu-item__name">${escapeHtml(item.name)}</h3>
          <p class="menu-item__category">${escapeHtml(item.category)}</p>
        </div>
        <div class="menu-item__actions">
          <strong class="menu-item__price">${formatPrice(item.price)}</strong>
          <button class="add-to-cart" type="button" data-cart-id="${item.id}">Add</button>
        </div>
      </article>
    `)
    .join("");

  emptyState.hidden = filteredItems.length > 0;
}

function renderAdminTable() {
  adminTableBody.innerHTML = menuItems
    .map((item) => `
      <tr>
        <td>${escapeHtml(item.name)}</td>
        <td>${escapeHtml(item.category)}</td>
        <td>${formatPrice(item.price)}</td>
        <td>
          <div class="row-actions">
            <button type="button" data-action="edit" data-id="${item.id}">Edit</button>
            <button type="button" data-action="delete" data-id="${item.id}">Delete</button>
          </div>
        </td>
      </tr>
    `)
    .join("");
}

function renderCart() {
  const cartDetails = cart
    .map((cartItem) => {
      const item = menuItems.find((menuItem) => menuItem.id === cartItem.id);
      return item ? { ...item, quantity: cartItem.quantity } : null;
    })
    .filter(Boolean);

  const total = cartDetails.reduce((sum, item) => sum + item.price * item.quantity, 0);
  cartTotal.textContent = formatPrice(total);
  cartEmpty.hidden = cartDetails.length > 0;

  cartItems.innerHTML = cartDetails
    .map((item) => `
      <article class="cart-item">
        <div>
          <h3>${escapeHtml(item.name)}</h3>
          <p>${formatPrice(item.price)} each</p>
        </div>
        <div class="quantity-control" aria-label="${escapeHtml(item.name)} quantity">
          <button type="button" data-quantity-action="decrease" data-id="${item.id}">-</button>
          <strong>${item.quantity}</strong>
          <button type="button" data-quantity-action="increase" data-id="${item.id}">+</button>
        </div>
        <button class="remove-cart-item" type="button" data-remove-id="${item.id}">Remove</button>
      </article>
    `)
    .join("");
}

function renderOrders() {
  ordersEmpty.hidden = orders.length > 0;
  ordersList.innerHTML = orders
    .map((order) => {
      const createdAt = new Date(order.createdAt).toLocaleString();
      const statusClass = `status-pill--${String(order.status).toLowerCase()}`;
      const lines = order.items.map((item) => `
        <div class="order-line">
          <span>${escapeHtml(item.name)} x ${item.quantity}</span>
          <strong>${formatPrice(item.lineTotal)}</strong>
        </div>
      `).join("");

      return `
        <article class="order-card">
          <div class="order-card__top">
            <div>
              <h3>Table ${escapeHtml(order.tableNumber)} - ${escapeHtml(order.customerName)}</h3>
              <p>${createdAt}</p>
              ${order.note ? `<p>Note: ${escapeHtml(order.note)}</p>` : ""}
            </div>
            <span class="status-pill ${statusClass}">${escapeHtml(order.status)}</span>
          </div>
          <div class="order-lines">${lines}</div>
          <p><strong>Total: ${formatPrice(order.total)}</strong></p>
          <div class="order-status-actions">
            <button class="status-button status-button--pending" type="button" data-order-id="${order.id}" data-status="Pending">Pending</button>
            <button class="status-button status-button--preparing" type="button" data-order-id="${order.id}" data-status="Preparing">Preparing</button>
            <button class="status-button status-button--completed" type="button" data-order-id="${order.id}" data-status="Completed">Completed</button>
            <button class="status-button status-button--cancelled" type="button" data-order-id="${order.id}" data-status="Cancelled">Cancelled</button>
            <button class="danger-button" type="button" data-delete-order-id="${order.id}">Remove</button>
          </div>
        </article>
      `;
    })
    .join("");
}

function playOrderSound() {
  if (!soundEnabled || !orderSound) return;

  orderSound.currentTime = 0;
  orderSound.play().catch(() => {
    soundEnabled = false;
    enableSoundButton.hidden = false;
  });
}

function refreshMenuViews() {
  renderTabs();
  renderMenu();
  renderAdminTable();
  renderCart();
}

function openAdminLogin() {
  loginError.hidden = true;
  adminPassword.value = "";
  adminLogin.showModal();
  setTimeout(() => adminPassword.focus(), 80);
}

function showAdminPanel() {
  adminPanel.hidden = false;
  enableSoundButton.hidden = soundEnabled;
  adminPanel.scrollIntoView({ behavior: "smooth", block: "start" });
  refreshMenuViews();
  loadOrders().catch(() => {});
}

function isAdminUrl() {
  const adminPattern = /admin/i;
  return adminPattern.test(window.location.pathname) || adminPattern.test(window.location.search) || adminPattern.test(window.location.hash);
}

if (isAdminUrl()) {
  document.body.classList.add("admin-route");
}

function resetForm() {
  editingId.value = "";
  menuForm.reset();
  saveItemButton.textContent = "Add Item";
  cancelEditButton.hidden = true;
}

categoryTabs.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-category]");
  if (!button) return;

  activeCategory = button.dataset.category;
  renderTabs();
  renderMenu();
});

menuContainer.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-cart-id]");
  if (!button) return;

  const existingItem = cart.find((item) => item.id === button.dataset.cartId);
  if (existingItem) {
    existingItem.quantity += 1;
  } else {
    cart.push({ id: button.dataset.cartId, quantity: 1 });
  }

  renderCart();
  orderCart.scrollIntoView({ behavior: "smooth", block: "start" });
});

categoryTabs.addEventListener("wheel", (event) => {
  if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;

  event.preventDefault();
  categoryTabs.scrollLeft += event.deltaY;
}, { passive: false });

searchInput.addEventListener("input", renderMenu);

cartItems.addEventListener("click", (event) => {
  const quantityButton = event.target.closest("button[data-quantity-action]");
  const removeButton = event.target.closest("button[data-remove-id]");

  if (quantityButton) {
    const cartItem = cart.find((item) => item.id === quantityButton.dataset.id);
    if (!cartItem) return;

    cartItem.quantity += quantityButton.dataset.quantityAction === "increase" ? 1 : -1;
    cart = cart.filter((item) => item.quantity > 0);
    renderCart();
  }

  if (removeButton) {
    cart = cart.filter((item) => item.id !== removeButton.dataset.removeId);
    renderCart();
  }
});

orderForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  orderMessage.hidden = true;

  if (!cart.length) {
    orderMessage.textContent = "Please add at least one item before submitting.";
    orderMessage.hidden = false;
    return;
  }

  const orderPayload = {
    customerName: customerName.value.trim(),
    tableNumber: tableNumber.value.trim(),
    note: orderNote.value.trim(),
    items: cart.map((item) => ({ id: item.id, quantity: item.quantity }))
  };

  try {
    const data = await apiRequest("/api/orders", {
      method: "POST",
      body: JSON.stringify(orderPayload)
    });

    cart = [];
    orderForm.reset();
    renderCart();
    orderMessage.textContent = `Order sent to admin. Order ID: ${data.order.id}`;
    orderMessage.classList.remove("order-message--error");
    orderMessage.hidden = false;
  } catch (error) {
    orderMessage.textContent = `Order not submitted: ${error.message}. Run this project with npm start, then open http://localhost:3000.`;
    orderMessage.classList.add("order-message--error");
    orderMessage.hidden = false;
  }
});

adminAccessButton.addEventListener("click", openAdminLogin);

closeLogin.addEventListener("click", () => adminLogin.close());

adminLoginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  loginError.hidden = true;

  try {
    const data = await apiRequest("/api/login", {
      method: "POST",
      body: JSON.stringify({ password: adminPassword.value })
    });
    setAdminToken(data.token);
    adminLogin.close();
    showAdminPanel();
  } catch {
    loginError.hidden = false;
  }
});

menuForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const nextItem = {
    name: itemName.value.trim(),
    category: itemCategory.value.trim(),
    price: Number(itemPrice.value)
  };

  if (!nextItem.name || !nextItem.category || Number.isNaN(nextItem.price)) return;

  const isEditing = Boolean(editingId.value);
  const path = isEditing ? `/api/menu/${editingId.value}` : "/api/menu";
  const method = isEditing ? "PUT" : "POST";

  const data = await apiRequest(path, {
    method,
    body: JSON.stringify(nextItem)
  });

  menuItems = data.items || menuItems;
  resetForm();
  refreshMenuViews();
});

adminTableBody.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;

  const item = menuItems.find((menuItem) => menuItem.id === button.dataset.id);
  if (!item) return;

  if (button.dataset.action === "edit") {
    editingId.value = item.id;
    itemName.value = item.name;
    itemCategory.value = item.category;
    itemPrice.value = item.price;
    saveItemButton.textContent = "Update Item";
    cancelEditButton.hidden = false;
    itemName.focus();
  }

  if (button.dataset.action === "delete") {
    const confirmed = confirm(`Delete "${item.name}" from the menu?`);
    if (!confirmed) return;

    const data = await apiRequest(`/api/menu/${item.id}`, { method: "DELETE" });
    menuItems = data.items || [];
    resetForm();
    refreshMenuViews();
  }
});

cancelEditButton.addEventListener("click", resetForm);

refreshOrdersButton.addEventListener("click", () => {
  loadOrders().catch(() => {});
});

enableSoundButton.addEventListener("click", () => {
  soundEnabled = true;
  orderSound.currentTime = 0;
  orderSound.play()
    .then(() => {
      orderSound.pause();
      orderSound.currentTime = 0;
      enableSoundButton.hidden = true;
    })
    .catch(() => {
      soundEnabled = false;
      alert("Sound could not be enabled. Please click the button again after the page fully loads.");
    });
});

ordersList.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-order-id][data-status]");
  const deleteButton = event.target.closest("button[data-delete-order-id]");

  if (deleteButton) {
    const confirmed = confirm("Remove this order from admin list?");
    if (!confirmed) return;

    try {
      const data = await apiRequest(`/api/orders/${deleteButton.dataset.deleteOrderId}`, {
        method: "DELETE"
      });

      orders = data.orders || [];
      renderOrders();
    } catch (error) {
      alert(`Order remove failed: ${error.message}`);
    }
    return;
  }

  if (button) {
    try {
      const data = await apiRequest(`/api/orders/${button.dataset.orderId}/status`, {
        method: "PUT",
        body: JSON.stringify({ status: button.dataset.status })
      });

      orders = data.orders || [];
      renderOrders();
    } catch (error) {
      alert(`Status update failed: ${error.message}`);
    }
  }
});

logoutButton.addEventListener("click", async () => {
  await apiRequest("/api/logout", { method: "POST" }).catch(() => {});
  clearAdminToken();
  adminPanel.hidden = true;
  resetForm();
});

loadMenuItems()
  .then(() => {
    if (getAdminToken()) {
      showAdminPanel();
    } else if (isAdminUrl()) {
      openAdminLogin();
    }
  })
  .catch((error) => {
    emptyState.textContent = `Menu could not load: ${error.message}. Run this project with npm start, then open http://localhost:3000.`;
    emptyState.hidden = false;
  });

setInterval(() => {
  if (!adminPanel.hidden && getAdminToken()) {
    loadOrders().catch(() => {});
  }
}, 7000);
