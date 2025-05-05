const http = require('http');
const httpProxy = require('http-proxy');

// List your backend servers here:
const targets = [
  'http://127.0.0.1:3002',
  'http://127.0.0.1:3003',
  'http://127.0.0.1:3004',
  'http://127.0.0.1:3005',
  'http://127.0.0.1:3006',
  'http://127.0.0.1:3007',
  'http://127.0.0.1:3008',
  'http://127.0.0.1:3009',
  'http://127.0.0.1:3010'
];

// Track server health status
const serverStatus = targets.map(() => true); // All servers start as healthy

// Check server health periodically
function checkServerHealth() {
  targets.forEach((target, index) => {
    http.get(`${target}/health`, (res) => {
      if (res.statusCode === 200) {
        if (!serverStatus[index]) {
          console.log(`✅ Server ${target} is back online`);
        }
        serverStatus[index] = true;
      } else {
        serverStatus[index] = false;
      }
    }).on('error', () => {
      serverStatus[index] = false;
    });
  });
}

// Check health every 5 seconds
setInterval(checkServerHealth, 5000);
checkServerHealth(); // Initial check

// Round-robin index
let idx = 0;
const proxy = httpProxy.createProxyServer();

// For every incoming request, try healthy backends first
const server = http.createServer((req, res) => {
  // Find next healthy server
  let attempts = 0;
  let targetIndex;
  
  const tryProxy = (attempts) => {
    if (attempts >= targets.length) {
      res.writeHead(502, { 'Content-Type': 'text/plain' });
      return res.end('Bad Gateway: no backends available');
    }
    
    // Try to find a healthy server first
    for (let i = 0; i < targets.length; i++) {
      targetIndex = (idx + i) % targets.length;
      if (serverStatus[targetIndex]) {
        break;
      }
    }
    
    // Update round-robin index
    idx = (targetIndex + 1) % targets.length;
    
    const target = targets[targetIndex];
    console.log(`Proxying request to ${target}`);
    
    proxy.web(req, res, { target }, (err) => {
      console.error(`Proxy to ${target} failed:`, err.message);
      serverStatus[targetIndex] = false; // Mark as failed
      tryProxy(attempts + 1);
    });
  };

  tryProxy(0);
});

server.listen(4850, '0.0.0.0', () => {
  console.log('🔀 Load balancer listening on 0.0.0.0:4850');
});