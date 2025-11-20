# LitePos Core.js Refactoring Plan

## Issues Identified
1. **Duplicate Functions**: Core.js contains legacy implementations that duplicate module functionality
2. **Static DOM Caching**: `els['id']` fails for dynamically created elements
3. **Solution**: Use `getElement(id)` which caches on first access

## Refactoring Strategy

### Phase 1: Critical Fallback Functions (PRIORITY)
Update core.js fallback functions to use `getElement()`:
- [ ] `loadProductToForm()` 
- [ ] `clearProductForm()`
- [ ] `saveProductFromForm()`
- [ ] `loadCustomerToForm()`
- [ ] `clearCustomerForm()`
- [ ] `saveCustomerFromForm()`
- [ ] `renderProductsTable()`
- [ ] `renderCustomersTable()`

### Phase 2: POS Functions
- [ ] `updateSaleTotals()`
- [ ] `renderCartTable()`
- [ ] `setCurrentCustomer()`
- [ ] `addProductToCart()`

### Phase 3: UI Functions
- [ ] `switchTab()`
- [ ] `showMainScreen()`
- [ ] `loadShopIntoHeader()`

### Phase 4: Admin Functions
- [ ] User management
- [ ] Shop settings
- [ ] Sales reports

## Implementation Pattern

### Before:
```javascript
if (els['product-edit-name']) {
    els['product-edit-name'].value = p.name;
}
```

### After:
```javascript
const nameEl = getElement('product-edit-name');
if (nameEl) {
    nameEl.value = p.name;
}
```

## Module Delegation Pattern

Core.js should primarily delegate to modules:

```javascript
function saveProductFromForm() {
    // Try module first
    if (window.LitePos?.products?.saveProductFromForm) {
        try { 
            return window.LitePos.products.saveProductFromForm(); 
        } catch (e) { 
            console.error('Module failed:', e); 
        }
    }
    // Fallback implementation using getElement()
    // ...
}
```

## Testing Checklist
- [ ] Product CRUD (add, edit, delete)
- [ ] Customer CRUD
- [ ] Brand/Supplier fields save correctly
- [ ] Filter dropdowns populate
- [ ] Cart operations
- [ ] Sale completion
- [ ] Tab switching
- [ ] Dynamic elements (modals, overlays)

## Files to Update
1. `app/core.js` - Replace els['id'] with getElement('id')
2. `app/modules/*.js` - Ensure proper element access
3. `app/modules/ui.js` - Update element caching strategy
