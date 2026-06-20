const fs = require('node:fs');
const path = require('node:path');

const required = [
  'package.json',
  'src/main/main.js',
  'src/main/preload.js',
  'src/renderer/index.html',
  'src/renderer/styles.css',
  'src/renderer/app.js'
];

const missing = required.filter((file) => !fs.existsSync(path.join(process.cwd(), file)));

if (missing.length > 0) {
  console.error(`Missing files:\n${missing.map((file) => `- ${file}`).join('\n')}`);
  process.exit(1);
}

console.log('Tonicue project structure looks good.');
