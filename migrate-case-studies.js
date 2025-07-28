const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '../rai-values-react/case-studies.json');
const data = JSON.parse(fs.readFileSync(file, 'utf-8'));

const updated = data.map(entry => ({
  ...entry,
  status: entry.status || 'pending',
  group: entry.group || ''
}));

fs.writeFileSync(file, JSON.stringify(updated, null, 2));
console.log('Migration complete!'); 