const { watch } = require('fs');
const { exec } = require('child_process');
const path = require('path');

console.log('Auto-push watcher started...');

let timeout;
const ignoreList = ['.git', 'node_modules', 'auto_push_watcher.js', 'firebase-debug.log'];

watch(__dirname, { recursive: true }, (eventType, filename) => {
  if (!filename) return;
  
  // Ignore specific files/directories
  if (ignoreList.some(item => filename.startsWith(item))) return;

  console.log(`File changed: ${filename}`);

  // Debounce the upload to avoid multiple pushes for simultaneous changes
  clearTimeout(timeout);
  timeout = setTimeout(() => {
    console.log('Running auto_upload.sh...');
    exec('bash auto_upload.sh', (error, stdout, stderr) => {
      if (error) {
        console.error(`Upload error: ${error.message}`);
        return;
      }
      if (stdout) console.log(`Output: ${stdout.trim()}`);
      if (stderr) console.error(`Error Output: ${stderr.trim()}`);
    });
  }, 10000); // 10 seconds delay
});
