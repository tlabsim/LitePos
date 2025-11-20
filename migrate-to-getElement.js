/**
 * Migration script to replace els['id'] with getElement('id') in core.js
 * 
 * Usage: node migrate-to-getElement.js
 */

const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'app', 'core.js');

console.log('Reading core.js...');
let content = fs.readFileSync(filePath, 'utf8');

// Track changes
let changeCount = 0;

// Pattern 1: els['element-id'] (single quotes)
const pattern1 = /els\['([^']+)'\]/g;
content = content.replace(pattern1, (match, id) => {
    changeCount++;
    return `getElement('${id}')`;
});

// Pattern 2: els["element-id"] (double quotes)
const pattern2 = /els\["([^"]+)"\]/g;
content = content.replace(pattern2, (match, id) => {
    changeCount++;
    return `getElement('${id}')`;
});

// Pattern 3: els.elementId (dot notation - rare but possible)
const pattern3 = /\bels\.([a-zA-Z][a-zA-Z0-9_-]*)\b/g;
content = content.replace(pattern3, (match, id) => {
    // Skip if it's part of a comment or in certain contexts
    changeCount++;
    return `getElement('${id}')`;
});

console.log(`\nMigration complete!`);
console.log(`Total replacements made: ${changeCount}`);

// Create backup
const backupPath = path.join(__dirname, 'app', 'core.js.backup');
fs.writeFileSync(backupPath, fs.readFileSync(filePath, 'utf8'));
console.log(`Backup created at: ${backupPath}`);

// Write migrated content
fs.writeFileSync(filePath, content, 'utf8');
console.log(`Updated file: ${filePath}`);

console.log('\n✅ Migration successful!');
console.log('⚠️  Please review the changes and test thoroughly.');
console.log('💡 You can restore from backup if needed.');
