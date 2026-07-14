const d = JSON.parse(require('fs').readFileSync('plugins.json', 'utf8'));
console.log('Всего:', Object.keys(d.plugins).length);
const t = Object.keys(d.plugins).filter(s => d.plugins[s].tables && d.plugins[s].tables.length > 0);
console.log('С таблицами:', t.length);