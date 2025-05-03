# Blockchain Voting System (IPFS Storage)

## Prerequisites
- Node.js v16+ and npm
- IPFS daemon running locally (`ipfs init` then `ipfs daemon`), or set `IPFS_API_URL`
- MetaMask (or other Web3) browser extension

## Installation & Setup

1. **Clone the repo**
   ```bash
   git clone <repo_url>
   cd <repo_folder>
   ```

2. **Server** (uses IPFS for block storage)
   ```bash
   cd server
   npm install
   npm start    # runs on port 3001 by default
   ```

3. **Client**
   ```bash
   cd client
   npm install
   npm run dev  # runs on http://localhost:3000
   ```

## Usage
1. Ensure your IPFS daemon is running.
2. Open `http://localhost:3000` and connect MetaMask.
3. Cast votes and audit blocks (via `/audit`).

