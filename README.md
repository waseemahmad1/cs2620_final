# Blockchain Voting System (IPFS Storage)

**Authors:**  
- Waseem Ahmad (<waseemahmad@college.harvard.edu>)  
- Max Peng (<mpeng@college.harvard.edu>)

## Prerequisites
- Node.js and npm
- IPFS daemon
- Redis server
- MetaMask browser extension

## Installation & Setup

### 1. Install Homebrew (if not already installed)
```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

### 2. Install IPFS
```bash
brew install ipfs
ipfs init
ipfs daemon
```

### 3. Install Redis
```bash
brew install redis
brew services start redis
```

### 4. Clone the repo
```bash
git clone <repo_url>
cd <repo_folder>
```

### 5. Server Setup (uses IPFS for block storage)
```bash
cd server
npm install
npm start 
```

### Quick Start Guide (please email us if there are issues!)

1. **Start IPFS daemon (machine 1 only)**
    ```bash
    ipfs daemon
    ```
2. **Start Redis server (machine 1 only)**
    ```bash
    brew services start redis
    ```
3. **Start the backend server (below is an example)**
    ```bash
    cd server
    PORT=3002 npm start
    ```
4. **On another machine (or terminal), start another server (below is an example)**
    ```bash
    cd server
    PORT=3003 npm start
    ```
4. **Start the client (on both machines)**
    ```bash
    cd client
    npm run dev
    ```
5. **Start the load balancer (machine 1 only)**
    ```bash
    cd server
    node load-balancer.js
    ```

## Usage
1. Ensure your IPFS daemon is running (`ipfs daemon`).
2. Ensure your Redis server is running (`brew services start redis`).
3. Open `http://localhost:3000` and connect MetaMask.

## Notes
- The server expects IPFS to be running and accessible at `localhost:5001`.
- The server expects Redis to be running on the configured port (default or as set in `redis.conf`).
- Install [ioredis](https://www.npmjs.com/package/ioredis) as a dependency (already included in `package.json`).
- You may need to download http-proxy, in which case you should do this: cd server --> npm install http-proxy