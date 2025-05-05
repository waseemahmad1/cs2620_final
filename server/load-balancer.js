const http = require('http');
const httpProxy = require('http-proxy');

// list of backend servers to load balance
const targets = [
  'http://10.250.115.135:3002',
  'http://10.250.48.217:3003',
];

// track health status of each backend server
const serverStatus = targets.map(() => true); // all servers start as healthy

// function to check health of each backend server
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

// check health every 5 seconds
setInterval(checkServerHealth, 5000);
checkServerHealth(); // initial check

// round-robin index for load balancing
let idx = 0;
const proxy = httpProxy.createProxyServer();

// create http server to handle incoming requests
const server = http.createServer((req, res) => {
  // find next healthy backend server
  let attempts = 0;
  let targetIndex;
  
  const tryProxy = (attempts) => {
    if (attempts >= targets.length) {
      res.writeHead(502, { 'Content-Type': 'text/plain' });
      return res.end('Bad Gateway: no backends available');
    }
    
    // try to find a healthy server
    for (let i = 0; i < targets.length; i++) {
      targetIndex = (idx + i) % targets.length;
      if (serverStatus[targetIndex]) {
        break;
      }
    }
    
    // update round-robin index
    idx = (targetIndex + 1) % targets.length;
    
    const target = targets[targetIndex];
    console.log(`Proxying request to ${target}`);
    
    // proxy the request to the selected backend
    proxy.web(req, res, { target }, (err) => {
      console.error(`Proxy to ${target} failed:`, err.message);
      serverStatus[targetIndex] = false; // mark as failed
      tryProxy(attempts + 1); // try next backend
    });
  };

  tryProxy(0);
});

// start the load balancer on port 4850
server.listen(4850, '0.0.0.0', () => {
  console.log('🔀 Load balancer listening on 0.0.0.0:4850');
});