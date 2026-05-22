# Restaurant Manual Management System

Deploy-ready QR restaurant menu with a customer menu page and password-protected admin panel.
Customers can add menu items to a cart and submit orders. Admin can manage menu items and update order status.

## Easy Start On Windows

Double-click:

```text
start-website.bat
```

It opens the customer website automatically.

Admin page:

```text
http://localhost:3000/admin
```

Default admin password:

```text
admin123
```

Do not open `index.html` directly. Orders need the server.

## Run With Command

```bash
npm start
```

Open:

- Customer menu: `http://localhost:3000`
- Admin panel: `http://localhost:3000/admin`

## Change Admin Password

On your hosting platform, add an environment variable:

```text
ADMIN_PASSWORD=your-strong-password
```

## Deploy

This project can deploy on Node.js hosting such as Render, Railway, Fly.io, or a VPS.

Use:

```text
Build command: none
Start command: npm start
```

Important: menu data is stored in `data/menu.json`. For long-term production use, deploy on a server with persistent storage, or later connect the API to a database.

Order data is stored in:

```text
data/orders.json
```
