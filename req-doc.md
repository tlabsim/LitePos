# LitePOS — BDT (Browser-Only POS)

**Structured Requirements Prompt (Markdown)**

You are building a **single-page Point of Sale (POS)** web application named **“LitePOS — BDT”** for small shops in Bangladesh. The app must run entirely in the browser, use **LocalStorage** as its “database”, and be implemented in **exactly three files**:

* `index.html` – structure & layout only
* `styles.css` – all styling
* `app.js` – all behavior and data logic

No other files and **no external dependencies** are allowed.

---

## 1. Technology & Dependencies

1. The application must be **100% client-side**:

   * No backend / server code.
   * All data persisted in **`localStorage`**.

2. Allowed:

   * Plain **HTML**
   * Plain **CSS**
   * Plain **JavaScript (ES5/ES6)**

3. Not allowed:

   * No frameworks: **React, Vue, Angular**, etc.
   * No JavaScript libraries: **jQuery, Chart.js**, etc.
   * No CSS frameworks: **Tailwind, Bootstrap**, etc.
   * No external CDNs or imports of any kind.
   * No module bundlers (Webpack, Vite, etc.).

---

## 2. Visual Style & Layout

### 2.1 Overall Layout

* Use a **modern dark theme**, card-based layout, with:

  * Rounded corners (pill-like and card radius).
  * Subtle “glassmorphism” effects (slight transparency and glow).
  * Soft shadows for depth.
* Main app shell:

  * Centered container with max width around **1280–1360px**.
  * Light border and strong drop shadow for “floating card” effect.
  * Occupies most of the viewport height, but scrollable if needed.

### 2.2 Header

* A fixed-looking **app header** at the top of the main shell:

  * Left: branding:

    * Circular logo mark containing the **“৳”** symbol.
    * Shop name (dynamic from settings).
    * Short Bangla subheader (e.g. `বাংলা বিক্রয় ব্যবস্থা`).
  * Right:

    * Optional shop phone number.
    * A pill showing current user session:

      * Text like: `Signed in as {Name}` and `[Role]`.
      * Small presence dot indicating “online”.
    * Logout button.

### 2.3 Tabs / Navigation Bar

* Directly under the header, a **tab bar** with navigation buttons (touch-friendly):

  * **POS** (New Sale)
  * **Customers**
  * **Products**
  * **Sales**
  * **Reports**
  * **Admin** (visible only for Superadmin)

* Active tab:

  * Uses accent color (green) border and background glow.
  * Slight box-shadow to appear raised.

### 2.4 Touch-Friendly Design

* All primary interactive elements must be **large enough for touch**:

  * Buttons: minimum 44×44 px target size.
  * Table rows: comfortable row height (≥ 40 px).
  * Inputs: increased padding and font size (14–16px+).
* Adequate spacing between buttons and inputs; avoid crowded layouts.

### 2.5 Typography & Colors

* Font: system UI stack:

  ```css
  font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  ```

* Use **Bangla subheaders** under major headings, e.g.:

  * `New Sale · নতুন বিক্রয়`
  * `Customers · গ্রাহক`
  * `Products · পণ্যসমূহ`
  * `Reports · রিপোর্ট`
  * `Admin · সেটিংস`

* Colors:

  * Background: deep navy/black with subtle radial gradients.
  * Text: high contrast (light grey to white).
  * Secondary text: muted grey.
  * Accent primary: **Green** (`#22c55e`, `#16a34a`).
  * Accent secondary: **Gold** (`#eab308`, `#ca8a04`).
  * Danger: **Red** (`#ef4444`).

---

## 3. Currency & Formatting

1. Default currency is **Bangladeshi Taka (BDT)**.
2. All monetary values:

   * Display with **currency symbol `৳`** prefixed.
   * Use **two decimal places**: `৳ 120.00`.
   * Ideally use tabular numbers for alignment where possible.
3. Ensure consistent formatting across:

   * POS totals
   * Product prices
   * Reports
   * Receipts

---

## 4. Authentication, Users & Roles

### 4.1 User Roles

There are exactly **two roles**:

1. **Superadmin**

   * Full access to:

     * POS (New Sale)
     * Customers
     * Products
     * Sales
     * Reports
     * Admin (Shop settings, user management, backup/restore)
2. **Salesperson**

   * Allowed:

     * POS
     * Customers
     * Products (view, and basic editing is acceptable)
     * Sales (view & filter list)
     * Reports (read KPIs & charts)
   * Not allowed:

     * Admin tab and all its features (cannot manage users, cannot backup/restore).

### 4.2 Data Structure for Users

```js
user = {
  id: string,
  name: string,
  username: string,
  pin: string,         // 4–6 digits, stored as plain text or simple hash
  role: "superadmin" | "sales",
  createdAt: ISOString
}
```

### 4.3 First-Time Setup (Superadmin Creation)

* On first run (when `litepos_users` is empty or missing):

  * Show a **setup panel** instead of normal login.
  * Ask for:

    * Superadmin Name
    * Username
    * PIN (4–6 digits)
    * Confirm PIN
  * Validate:

    * All fields are non-empty.
    * PIN matches confirmation.
    * PIN is 4–6 digits.
    * Username is unique.
  * Once created:

    * Save Superadmin user to LocalStorage.
    * Switch to the normal sign-in view.

### 4.4 Login Flow

* After user(s) exist:

  * Show **login form**:

    * User dropdown (from LocalStorage).
    * PIN input.
  * On login (Enter key or “Enter POS” button):

    * Check selected user’s `pin`.
    * If valid, set `currentUser` in memory and persist session info in LocalStorage (optional).
    * Update header to show logged-in user.
    * Navigate to POS tab by default.

### 4.5 Logout

* Logout button in header:

  * Clears session/localStorage session key.
  * Clears `currentUser`.
  * Hides main app screen.
  * Shows login screen again.

---

## 5. LocalStorage “Database”

Use fixed keys such as:

* `litepos_shop`
* `litepos_users`
* `litepos_products`
* `litepos_customers`
* `litepos_sales`
* `litepos_session` (optional, for remembering logged-in user)

### 5.1 Shop Settings

```js
shop = {
  name: "LitePOS",
  address: "Shop Address",
  phone: "01XXXXXXXXX"
}
```

### 5.2 Product

```js
product = {
  id: string,
  name: string,
  sku: string,
  buyPrice: number,
  sellPrice: number,
  stock: number | null,
  lowStockThreshold: number | null,
  createdAt: ISOString,
  updatedAt: ISOString
}
```

### 5.3 Customer (Phone-Centered)

```js
customer = {
  id: string,
  name: string,
  phone: string,      // primary key for lookups
  notes: string,
  createdAt: ISOString,
  updatedAt: ISOString,
  lastSaleId: string | null
}
```

### 5.4 Sale & Line Items

```js
sale = {
  id: string,
  status: "open" | "closed",
  customerPhone: string | null,
  customerNameSnapshot: string,
  salespersonUsername: string,
  createdAt: ISOString,
  closedAt: ISOString | null,

  items: [
    {
      productId: string,
      productSku: string,
      productNameSnapshot: string,
      qty: number,
      unitPrice: number,
      unitBuyPrice: number,
      lineTotal: number,
      lineProfit: number
    }
  ],

  subtotal: number,
  discount: number,
  total: number,
  payment: number,
  change: number,
  totalProfit: number,
  payment_method: 'cash' | 'card' | 'bKash' | 'Nagad',
  payment_details: string | null
}
```
Support Bangladehi specific payment system including MFS - bKash and Nagad
bKash logo: https://www.logo.wine/a/logo/BKash/BKash-Logo.wine.svg
Nagad logo: https://www.logo.wine/a/logo/Nagad/Nagad-Logo.wine.svg
---

## 6. Sample Data (Production-Ready Feel)

On initial setup (after creating first Superadmin), if there is no existing data:

* Seed:

  * **Products**: 5–10 items, each with:

    * Buying price, selling price, stock, low-stock threshold.
    * Some items intentionally with low stock (to trigger warnings).
  * **Customers**: 3–5 customers with realistic Bangladeshi phone numbers.
  * **Sales**: several closed sales distributed over ~7 days, for meaningful charts.
  * **Users**:

    * Superadmin (just created).
    * At least one sample salesperson.

---

## 7. POS Tab — New Sale

### 7.1 Layout

Split the POS view into **two main cards**:

1. **Left card**: Customer and cart section.
2. **Right card**: Totals, payment, sale status, receipt and shortcuts.

Use step-like hints at the top:

* Step 1: Customer
* Step 2: Products
* Step 3: Payment

### 7.2 Customer Flow (Phone-First)

1. **Customer Phone input**:

   * Type: tel.
   * Primary search key.
   * Pressing Enter or clicking **Search**:

     * Look up customer by `phone`.
     * If found:

       * Auto-fill **Customer Name**.
       * Set summary card: name, phone, status = “Existing customer”.
     * If not found:

       * Show hint “No previous entry. Use Quick Add.”
       * Keep phone in place.

2. **Customer Name input**:

   * Can be manually entered/edited.
   * If an existing customer is found, pre-populate name.

3. **Customer Summary Card**:

   * Displays:

     * Name (or “Not selected”).
     * Phone.
     * Status: “Existing customer” or “New / not saved”.
   * Includes “Clear” button that:

     * Clears phone and name.
     * Resets summary state.

4. **Quick Add Customer Box**:

   * Uses phone from the main phone input.
   * Fields:

     * Name
     * Notes
   * On “Save customer”:

     * If a customer with that phone exists, update its name and notes.
     * Otherwise, create a new customer.
   * After save:

     * Ensure POS uses this customer as current.

### 7.3 Product Search & Add to Cart

1. Search input:

   * Placeholder “Search by name or SKU…”.
   * Filters product list in real-time.

2. Product table:

   * Columns:

     * Product
     * SKU
     * Sell price (৳)
     * Stock (with low-stock badge if applicable)
     * “Add” button

3. Adding items:

   * Clicking `Add` button or row:

     * Adds product to cart with `qty = 1`.
     * If product already in cart, increment quantity.
   * No item should be added with negative or zero quantity.

4. Low-stock warning:

   * If `stock != null` and `stock <= lowStockThreshold`:

     * Show a “LOW” badge or warning text in orange/red.

### 7.4 Cart & Quantities

1. Cart table:

   * Columns:

     * Item name
     * Qty (with `-` and `+` buttons)
     * Unit price
     * Line total
     * Remove button

2. Quantity controls:

   * Small round `-` and `+` buttons, touch-friendly.
   * Changing qty updates totals instantly.
   * If qty becomes 0 or less, remove the line.

3. Removing line:

   * “✕” button fully removes that product from cart.

4. Cart summary:

   * Show **items count** (sum of quantities).

### 7.5 Open vs Closed Sales & Resume

1. **New sale**:

   * Button “New sale (Alt+N)”.
   * Clears cart, discount, payment, customer selection, and resets `currentSaleId`.

2. **Hold / Save Open sale**:

   * Button “Hold / Save Open (Alt+H)”.
   * Requirements:

     * Cart must not be empty.
   * Behavior:

     * Save current sale as status `"open"` in LocalStorage.
     * Includes all items, discount, partial payment (if any), customer snapshot.
     * Set `currentSaleId` to that sale’s ID.
     * Show clear status “Open / On hold”.

3. **Cancel Open sale**:

   * Button “Cancel Open”.
   * Only works if `currentSaleId` refers to an open sale.
   * Confirmation dialog before removing from storage.
   * After cancellation:

     * Clear POS state.

4. **Open sales list**:

   * Horizontal strip showing open sales as “pills”:

     * Each pill: `{Customer name} · {Total} · {Created Time}`.
   * Touching a pill:

     * Loads that sale into POS:

       * Customer fields, cart items, discount, payment.
       * Sets `currentSaleId`.
       * Updates sale status text as “Open / On hold”.

5. Closed sales:

   * Once sale is closed (see below), it should not show in open sales list.

### 7.6 Payment & Completing Sale

Right side card handles:

1. **Subtotal**:

   * Sum of `lineTotal` for all cart items.

2. **Discount field** (BDT, flat):

   * Numeric input, initial 0.
   * Subtotal − discount = **Total payable**.
   * Do not allow discount > subtotal (or if it is, clamp to subtotal).

3. **Total payable**:

   * Display in bold, large font with `৳`.

4. **Payment received**:

   * Numeric input.
   * May be equal to or greater than `Total payable`.

5. **Change**:

   * `payment - total`.
   * Show `0.00` if payment < total; treat as underpaid.

6. **Sale status text**:

   * “New”, “Open”, or “Closed”.

7. **Complete & Close Sale (Alt+C)**:

   * Validation:

     * Cart must not be empty.
     * Total must be ≥ 0.
   * On success:

     * Calculate per-line profit: `(unitPrice - unitBuyPrice) * qty`.
     * Sum up to `totalProfit`.
     * Mark sale as `"closed"`, set `closedAt`.
     * Save sale to LocalStorage.
     * Decrement product stock (if stock tracking is enabled).
     * Update snapshots:

       * `lastSaleId` for the customer (if any).
     * Store sale ID as `lastClosedSaleId` (for printing).
     * Clear POS (start a new empty sale).
   * Show confirmation toast “Sale completed and closed”.

8. **Today’s summary mini card**:

   * Display:

     * Number of sales today.
     * Total value today.
     * Last sale time and total.
   * Also show current salesperson’s name.

---

## 8. Receipt Printing

### 8.1 Hidden Receipt Template

In the HTML, include a hidden section for the receipt:

* Contains:

  * Shop name.
  * Shop address.
  * Shop phone.
  * Sale ID, date/time.
  * Customer name and phone.
  * Table of items (name, qty, price, total).
  * Subtotal, discount, total, payment, change.
  * Closing note in Bangla (e.g., “ধন্যবাদ! আবার আসবেন।”).

### 8.2 Receipt Size Selector

* Dropdown with options:

  * **A4 (ফুল সাইজ)**
  * **80mm roll**
  * **58mm roll**

* Use CSS `@media print` and `@page` size rules:

  * For A4: default print size.
  * For 80mm/58mm:

    * Set `@page size: 80mm auto;` or `58mm auto;`
    * Narrow layout in CSS for receipt.

### 8.3 Print Last Receipt

* Button “Print last receipt (Alt+R)”:

  * Uses the **most recently closed sale**.
  * Populates the receipt template.
  * Temporarily sets class on `body`:

    * e.g., `print-receipt` and maybe `receipt-80mm` or `receipt-58mm`.
  * Calls `window.print()`.
  * After printing, removes the print-specific classes.

---

## 9. Customers Tab

### 9.1 Customer List (Left Card)

* Search input:

  * Filters by name or phone.

* Table columns:

  * Name
  * Phone (center-aligned)
  * Notes
  * Last sale date (if any)

* Sort customers by `lastSaleDate` descending or `createdAt`.

* Clicking a row:

  * Loads customer into edit form on the right.

### 9.2 Edit / Add Customer (Right Card)

* Fields:

  * Name
  * Phone
  * Notes
* Buttons:

  * “Save customer”:

    * Phone is treated as unique key.
    * If phone exists: update existing customer.
    * Otherwise: create a new one.
  * “New”:

    * Clears the form for a new entry.

---

## 10. Products Tab

### 10.1 Product List (Left Card)

* Search input:

  * Filter by name or SKU.

* Table columns:

  * Name
  * SKU
  * Buying Price (৳)
  * Selling Price (৳)
  * Stock
  * Low stock indicator

* For each product:

  * If `stock !== null` and `stock <= lowStockThreshold`, show “LOW” badge or highlight.

* Clicking a row:

  * Loads that product into the edit form.

### 10.2 Add / Edit Product (Right Card)

* Fields:

  * Name
  * SKU
  * Buying price (BDT)
  * Selling price (BDT)
  * Stock (number or null for “not tracked”)
  * Low stock alert threshold

* Buttons:

  * “Save product”:

    * If product with same SKU exists: update it.
    * Else: create new product with new ID.
  * “New”: clears the form.

* Validation:

  * Name required.
  * Numeric fields must not be negative.
  * It’s okay if SKU is optional, but recommended as unique.

---

## 11. Sales Tab — List & Filters

### 11.1 Filters

* Filter row elements:

  * From date (Date input)
  * To date (Date input)
  * Status dropdown:

    * All
    * Open
    * Closed
  * Salesperson dropdown:

    * All
    * Each user (by ID or username)
  * Free text search field:

    * Filters by customer name, phone, or sale ID.
  * “Clear filters” button:

    * Resets all filters and re-renders full list.

### 11.2 Sales Table

* Columns:

  * Date/Time
  * Customer
  * Phone
  * Salesperson
  * Status
  * Items count
  * Total (৳)
  * Profit (৳) — computed from stored line items.

* Sorting:

  * Most recent sales first.

* Filtering:

  * Done on the full array of `sales` in memory according to the filters.

---

## 12. Reports Tab — KPIs, Chart, Export & Print

### 12.1 KPIs

Display KPI cards:

1. **Total sales value** (sum of total of all closed sales) and **invoice count**.
2. **Today’s sales value** and **today’s invoice count**.
3. **Total profit** and **profit margin**:

   * `profit margin = (totalProfit / totalSales) * 100%`
4. **Total customers** (count of unique customers in LocalStorage).
5. **Open sales** (count of `sales` with status `"open"`).

### 12.2 Last 7 Days Chart (No External Library)

* Use a `<canvas id="salesChart">`.
* Logic in pure JS:

  * Build an array of last 7 dates (including today).
  * For each date, sum total of closed sales.
  * Compute a y-scale from 0 to max value.
  * Draw simple bar or line chart:

    * Bars with gradient fill using `canvas` API.
    * Labels (e.g., `23 Mar`) under each bar.
  * Keep chart visually consistent with dark theme.

### 12.3 Export / Print Report

1. **Period selection**:

   * From date & To date for the report.

2. **Export CSV** button:

   * Generates CSV with columns such as:

     * DateTime
     * Sale ID
     * Customer
     * Phone
     * Salesperson
     * Status
     * Total
     * Profit
   * Only include **closed** sales within the selected date range.
   * Use Blob and `a.href = URL.createObjectURL()` to trigger download.

3. **Print report**:

   * Renders a summary table in a `<div>` (e.g., total per day).
   * Use `window.print()` and `@media print` styles so:

     * Only this report area is visible on print.
     * Hide the rest of the app.

---

## 13. Admin Tab — Shop Settings, Users, Backup/Restore

### 13.1 Shop Settings

* Fields:

  * Shop name
  * Address
  * Phone

* Actions:

  * “Save settings”:

    * Persist to LocalStorage.
    * Update header display and receipt template.

### 13.2 User & Role Management

* Table of users:

  * Name
  * Username
  * Role

* Form for add/edit user:

  * Name
  * Username
  * PIN (4–6 digits; optional for editing, required for creating)
  * Role: `superadmin` or `sales`

* Buttons:

  * “Save user”:

    * If username exists: update user details (and PIN if provided).
    * If not: create a new user.
  * “New”: clears form.

* Only Superadmin can access this tab and perform user management.

### 13.3 Backup & Restore

1. **Download backup (JSON)**:

   * Combine all data into one object:

     ```js
     backup = {
       version: "1.0.0",
       exportedAt: ISOString,
       data: {
         shop,
         users,
         products,
         customers,
         sales
       }
     }
     ```

   * Download as `litepos-backup-YYYY-MM-DD.json`.

2. **Restore from file**:

   * File input (JSON only).
   * On file select:

     * Parse JSON.
     * Validate structure (must contain `data` with arrays/objects).
     * Ask user to confirm:

       * “Restoring will replace all current data. Continue?”
     * If confirmed:

       * Overwrite LocalStorage keys with backup data.
       * Reinitialize in-memory state.
       * Force logout and require login again.

---

## 14. Keyboard Shortcuts

Implement global `keydown` handler with these shortcuts:

### 14.1 Tab Navigation (Global)

* **Alt+1** → POS tab
* **Alt+2** → Customers tab
* **Alt+3** → Products tab
* **Alt+4** → Sales tab
* **Alt+5** → Reports tab
* **Alt+6** → Admin tab (only if logged-in user is Superadmin)

### 14.2 POS-Specific Shortcuts

* **Alt+F** → Focus **Customer Phone** input.
* **Alt+P** → Focus **Product Search** input.
* **Alt+N** → Start **New sale** (clear current).
* **Alt+H** → **Hold / Save Open** sale.
* **Alt+C** → **Complete & Close** current sale.
* **Alt+R** → **Print last receipt**.

### 14.3 Global Behavior

* **Esc**:

  * If current focus is inside an input/textarea/select:

    * Blur the element (remove focus).
  * Used to exit from editing mode gracefully.

* **Enter on login**:

  * When on login screen and focused in PIN field:

    * Pressing Enter should trigger login.

* Shortcuts should:

  * Work even when certain elements are focused (where appropriate).
  * Not interfere with normal text input unless explicitly intended.

---

## 15. Error Handling & UX

1. Use **toast notifications**:

   * Small pill-style notifications at bottom-right.
   * Types:

     * Success (green gradient).
     * Error (red gradient).
   * Auto-dismiss after a few seconds.

2. Input validation:

   * PINs: only digits, length 4–6.
   * Product prices & stock: no negative values.
   * Required fields must be checked before saving user, product, or customer.

3. Confirmations:

   * Cancel open sale: confirm before removing.
   * Restore backup: confirm before overwriting all data.

4. Fallback handling:

   * If LocalStorage fails (e.g., quota exceeded), show a toast explaining that data cannot be saved.

---

## 16. File Structure & Responsibilities

### 16.1 `index.html`

* Contains:

  * Main app shell and header.
  * Login / setup screen (with Superadmin creation support).
  * Main screen with tab-based layout:

    * POS
    * Customers
    * Products
    * Sales
    * Reports
    * Admin
  * Hidden elements for:

    * Receipt template (for printing).
    * Report print area.
  * Toast container.

* Includes:

  * `<link rel="stylesheet" href="styles.css">`
  * `<script src="app.js"></script>` at the end of `<body>`.

### 16.2 `styles.css`

* Handles:

  * Global resets and base styles.
  * Dark theme background and gradients.
  * Card, button, and table styling.
  * Responsive layout adjustments for smaller screens.
  * Touch-friendly sizing and spacing.
  * KPI cards and charts (canvas container styling).
  * Toast styling.
  * Print styles:

    * `@media print`:

      * For receipt printing: show only receipt; hide rest of UI.
      * For report printing: show only report area.
      * `@page` settings for A4 and roll widths (58mm, 80mm).

### 16.3 `app.js`

* Uses an IIFE or similar to encapsulate logic.
* Responsibilities:

  * LocalStorage helpers (`load`, `save`).
  * In-memory state (`currentUser`, `cart`, `sales`, etc.).
  * Initialization:

    * Load data.
    * Show setup or login screen.
    * If logged-in, show main app and render everything.
  * Login & logout logic.
  * Shop header updates.
  * POS flow:

    * Customer lookup and quick add.
    * Product search and cart management.
    * Open sale management (hold/resume/cancel).
    * Sale completion (stock update, profit calculation, last sale, etc.).
    * Cart totals and payment calculations.
  * Customers tab:

    * List & search.
    * Edit and save customers.
  * Products tab:

    * List & search.
    * Edit and save products.
    * Low-stock highlighting.
  * Sales tab:

    * Filtering by date, status, salesperson, query.
    * Render sale table with totals and profit.
  * Reports tab:

    * KPI computation.
    * Last 7 days chart drawing using `canvas`.
    * Report export to CSV.
    * Report printing.
  * Admin tab:

    * Shop settings load & save.
    * User management (add/edit).
    * Backup download (JSON).
    * Restore from JSON file.
  * Keyboard shortcuts:

    * Alt-based navigation and POS shortcuts.
    * Enter/Esc behaviors.
  * Toast notifications.

---

**Goal:**
The final application must be a **single-page, touch-friendly, browser-only POS system** that:

* Uses **LocalStorage** as its only persistence layer.
* Supports **multi-user login** with **Superadmin** and **Salesperson** roles.
* Implements **phone-centered customer management**.
* Handles **open and closed sales**, with full **resume/cancel** support.
* Tracks **products** with **buying price**, **selling price**, **stock**, and **low-stock alerts**.
* Computes **profit** per sale and in reports.
* Displays all amounts in **Bangladeshi Taka (৳)**.
* Provides **receipt printing** with configurable paper sizes (A4/80mm/58mm).
* Includes **data backup/restore** and **CSV report export/printing**.
* Offers **extensive keyboard shortcuts** for fast operation.
* Is implemented in exactly **three files (HTML, CSS, JS)** with **no external dependencies**.
