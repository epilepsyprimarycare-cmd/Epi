const fs = require('fs');
const path = require('path');

// Get all JS files recursively
function getJsFiles(dir) {
  let files = [];
  const items = fs.readdirSync(dir);
  
  for (const item of items) {
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);
    
    if (stat.isDirectory() && item !== 'node_modules') {
      files = files.concat(getJsFiles(fullPath));
    } else if (item.endsWith('.js')) {
      files.push(fullPath);
    }
  }
  return files;
}

const jsFiles = getJsFiles('.');
let totalReplaced = 0;
let filesModified = 0;
const modifiedFilesList = [];

for (const file of jsFiles) {
  // Skip test files and node_modules
  if (file.includes('node_modules') || file.includes('CDS-TEST-MODULE') || file.includes('run-cds-tests')) {
    continue;
  }
  
  let content = fs.readFileSync(file, 'utf8');
  const original = content;
  
  // Replace console.log with Logger.debug
  content = content.replace(/console\.log\(/g, 'window.Logger.debug(');
  
  // Replace console.warn with Logger.warn
  content = content.replace(/console\.warn\(/g, 'window.Logger.warn(');
  
  // Replace console.error with Logger.error
  content = content.replace(/console\.error\(/g, 'window.Logger.error(');
  
  if (content !== original) {
    fs.writeFileSync(file, content, 'utf8');
    const replacementCount = (original.match(/console\.(log|warn|error)\(/g) || []).length;
    window.Logger.debug(`✓ ${file}: ${replacementCount} replacements`);
    modifiedFilesList.push(file);
    filesModified++;
    totalReplaced += replacementCount;
  }
}

window.Logger.debug('\n=====================================');
window.Logger.debug('✅ Migration completed!');
window.Logger.debug('=====================================');
window.Logger.debug(`📊 Files modified: ${filesModified}`);
window.Logger.debug(`📝 Total replacements: ${totalReplaced}`);
window.Logger.debug('=====================================\n');

if (filesModified > 0) {
  window.Logger.debug('Modified files:');
  modifiedFilesList.forEach(f => window.Logger.debug(`  - ${f}`));
}
