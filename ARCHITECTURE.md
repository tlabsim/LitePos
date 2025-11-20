# LitePos Architecture Quick Reference

## Element Access Pattern

### ❌ OLD (Static Caching)
```javascript
// PROBLEM: Fails for dynamically created elements
els['product-overlay'].classList.add('hidden');
els['customer-edit-address'].value = '';
```

### ✅ NEW (Dynamic Caching)
```javascript
// SOLUTION: Caches on first access, works for dynamic elements
getElement('product-overlay').classList.add('hidden');
getElement('customer-edit-address').value = '';
```

## Module Delegation Pattern

### Core.js Functions
`core.js` now acts as a **thin delegator layer** that:
1. Tries to call the module implementation first
2. Syncs database state with modules
3. Falls back gracefully if module unavailable
4. Logs helpful warnings for debugging

### Example: Product CRUD
```javascript
// In core.js
function saveProductFromForm() {
    // Try module first
    if (window.LitePos?.products?.saveProductFromForm) {
        try {
            // Sync DB state
            if (window.LitePos.state) window.LitePos.state.db = db;
            // Call module
            window.LitePos.products.saveProductFromForm();
            // Sync DB back
            if (window.LitePos.state?.db) db = window.LitePos.state.db;
            return;
        } catch (e) { 
            console.error('[core.js] Module delegation failed:', e); 
        }
    }
    // Fallback warning
    console.warn('[core.js] saveProductFromForm: module not available');
}

// In products.js module
function saveProductFromForm() {
    const db = _getDb(); // Get DB from state
    const els = _getEls(); // Get element cache
    
    const name = els['product-edit-name'].value.trim();
    const sku = els['product-edit-sku'].value.trim();
    const brand = els['product-edit-brand']?.value.trim() || '';
    const supplier = els['product-edit-supplier']?.value.trim() || '';
    // ... full implementation here
    
    if (API?.saveDb) API.saveDb(); // Save to localStorage
    renderProductsTable(); // Re-render
}

// Module exports
window.LitePos.products = {
    renderProductsTable,
    loadProductToForm,
    clearProductForm,
    saveProductFromForm,
    // ... more exports
};
```

## Module Structure

### Products Module (`app/modules/products.js`)
**Exports**:
- `renderProductsTable()` - Render products with filters, sorting, pagination
- `renderProductSearchTable()` - Render POS product search overlay
- `loadProductToForm(id)` - Load product into edit form (with brand/supplier)
- `clearProductForm()` - Clear edit form (including brand/supplier)
- `saveProductFromForm()` - Save product (with brand/supplier)
- `focusProductSearch()` - Focus POS product search
- `updateCategorySuggestions()` - Update category dropdown & datalist
- `updateBrandSuggestions()` - Update brand dropdown & datalist
- `updateSupplierSuggestions()` - Update supplier dropdown & datalist

### Customers Module (`app/modules/customers.js`)
**Exports**:
- `renderCustomersTable()` - Render customers table
- `loadCustomerToForm(id)` - Load customer into edit form (with address)
- `clearCustomerForm()` - Clear edit form (including address)
- `saveCustomerFromForm()` - Save customer (with address)
- `findCustomerFromInput()` - Find customer by phone
- `setCurrentCustomer(id)` - Set current customer in POS
- `saveQuickCustomer()` - Quick save from POS
- `focusCustomerPhone()` - Focus customer phone input
- `deleteCustomer(id)` - Delete customer with confirmation

### UI Module (`app/modules/ui.js`)
**Purpose**: Element caching, toast notifications, utilities

**Element Cache** (`window.LitePos.elements`):
```javascript
// Core POS elements
'product-search', 'product-overlay', 'product-search-table',
'cart-table', 'sale-customer-phone', 'sale-subtotal',

// Product edit form
'product-edit-name', 'product-edit-sku', 'product-edit-barcode',
'product-edit-category', 'product-edit-brand', 'product-edit-supplier',
'product-edit-buy', 'product-edit-sell', 'product-edit-stock',

// Customer edit form
'customer-edit-name', 'customer-edit-phone', 
'customer-edit-address', 'customer-edit-notes',

// Product filters
'product-filter-category', 'product-filter-brand', 
'product-filter-supplier', 'product-filter-low-stock',

// ... and many more
```

## Database Schema Extensions

### Products Schema
```javascript
{
    id: 'p1',
    name: 'Product Name',
    sku: 'SKU123',
    barcode: '1234567890',      // Optional
    category: 'Electronics',     // Optional
    brand: 'Brand Name',         // ✅ NEW
    supplier: 'Supplier Name',   // ✅ NEW
    buyPrice: 100,
    sellPrice: 150,
    stock: 50,
    lowStockAt: 10,
    createdAt: '2024-01-01T00:00:00.000Z'
}
```

### Customers Schema
```javascript
{
    id: 'c1',
    name: 'Customer Name',
    phone: '01234567890',
    address: '123 Main St',      // ✅ NEW
    notes: 'VIP customer',
    lastSaleAt: '2024-01-01T00:00:00.000Z',
    lastSaleTotal: 1500
}
```

### Sales Schema (Edit Mode)
```javascript
{
    id: 's123',
    items: [...],
    customer: {...},
    subtotal: 1000,
    discount: 50,
    discountPercent: 5,          // ✅ NEW (displayed in UI)
    total: 950,
    createdAt: '2024-01-01T10:00:00.000Z',
    createdBy: 'u1',
    lastModifiedAt: '2024-01-01T11:00:00.000Z',  // ✅ NEW
    lastModifiedBy: 'u2'         // ✅ NEW
}
```

## Common Patterns

### Adding New Product Fields
1. Update schema in module (`products.js`)
2. Add form field IDs to `ui.js` element cache
3. Use `getElement()` to access fields (dynamic caching)
4. Add field to `loadProductToForm()`, `clearProductForm()`, `saveProductFromForm()`
5. Add datalist/dropdown if needed with suggestion functions

### Adding New Customer Fields
1. Update schema in module (`customers.js`)
2. Add form field IDs to `ui.js` element cache
3. Use `getElement()` to access fields
4. Add field to `loadCustomerToForm()`, `clearCustomerForm()`, `saveCustomerFromForm()`

### Adding New Filters
1. Add filter element ID to `ui.js` cache
2. Add filter dropdown HTML to `index.html`
3. Create `updateXxxSuggestions()` function in module
4. Add filter logic to `renderProductsTable()`
5. Export function from module

## Debugging Tips

### Check Module Loading
```javascript
// In browser console
console.log(window.LitePos); 
// Should show: { products: {...}, customers: {...}, ui: {...}, ... }

console.log(Object.keys(window.LitePos.products));
// Should show all exported functions
```

### Check Element Cache
```javascript
// In browser console
console.log(window.LitePos.elements);
// Should show all cached elements

console.log(getElement('product-edit-brand'));
// Should return the element or null
```

### Check Database State
```javascript
// In browser console
console.log(db.products.map(p => ({ name: p.name, brand: p.brand })));
// Should show all products with brand field

console.log(db.customers.map(c => ({ name: c.name, address: c.address })));
// Should show all customers with address field
```

## File Organization

```
LitePos/
├── index.html                 # Main HTML with all forms
├── styles.css                 # Styles
├── app.js                     # Module loader (loads all scripts)
├── app/
│   ├── core.js               # App initialization, thin delegators
│   ├── modules/
│   │   ├── ui.js            # Element cache, toasts, utilities
│   │   ├── products.js      # Product CRUD, filters, search
│   │   ├── customers.js     # Customer CRUD
│   │   ├── pos.js           # POS cart logic
│   │   ├── sales.js         # Sales history, reports
│   │   └── utils.js         # Money formatting, date helpers
│   └── core.js.backup       # Backup before refactoring
└── migrate-to-getElement.ps1  # Migration script
```

---
**Remember**: Always use `getElement()` for DOM access, always delegate to modules from core.js!
