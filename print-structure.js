const fs = require('fs');
const path = require('path');

function walk(dir, indent = '') {
  const items = fs.readdirSync(dir);
  for (let item of items) {
    if (['node_modules', '.git', '.next', 'dist', 'build'].includes(item)) continue;
    const fullPath = path.join(dir, item);
    const isDir = fs.statSync(fullPath).isDirectory();
    console.log(`${indent}${isDir ? '📁' : '📄'} ${item}`);
    if (isDir) walk(fullPath, indent + '  ');
  }
}

walk(process.cwd());
