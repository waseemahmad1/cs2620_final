/* ================= README.md ================= */
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


/* ================= server/package.json ================= */
{
  "name": "blockchain-voting-server",
  "version": "1.0.0",
  "main": "index.js",
  "scripts": {
    "start": "node index.js"
  },
  "dependencies": {
    "express": "^4.18.2",
    "ipfs-http-client": "^59.0.0",
    "ethers": "^5.7.2",
    "body-parser": "^1.20.2",
    "fs-extra": "^11.1.1",
    "path": "^0.12.7"
  }
}

/* ================= server/index.js ================= */
const express = require('express');
const bodyParser = require('body-parser');
const { create } = require('ipfs-http-client');
const path = require('path');
const fs = require('fs-extra');
const { Blockchain } = require('./blockchain/Blockchain');
const { PoAConsensus } = require('./consensus/PoAConsensus');

// Initialize IPFS client (default to localhost)
const ipfs = create({ url: process.env.IPFS_API_URL || 'http://localhost:5001' });

// Authority public keys for PoA consensus
const authorityKeys = [ /* insert public keys */ ];
const consensus = new PoAConsensus(authorityKeys);
const chain = new Blockchain(ipfs, consensus);

const app = express();
app.use(bodyParser.json());

// Cast vote endpoint
app.post('/castVote', async (req, res) => {
  try {
    const { voterAddress, electionId, voteData, signature } = req.body;
    await chain.addTransaction({ voterAddress, electionId, voteData, signature });
    res.json({ success: true, message: 'Vote submitted.' });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// Retrieve chain
app.get('/getChain', async (req, res) => {
  try {
    const blocks = await chain.getChain();
    res.json(blocks);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Audit proof endpoint
app.get('/auditProof', async (req, res) => {
  try {
    const idx = Number(req.query.blockIndex);
    const proof = await chain.getAuditProof(idx);
    res.json(proof);
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));


/* ================= server/blockchain/Block.js ================= */
const { keccak256, toUtf8Bytes } = require('ethers').utils;

class Block {
  constructor(index, timestamp, transactions, previousHash, validator) {
    this.index = index;
    this.timestamp = timestamp;
    this.transactions = transactions;
    this.previousHash = previousHash;
    this.validator = validator;
    this.hash = this.computeHash();
  }

  computeHash() {
    const data = `${this.index}${this.timestamp}${JSON.stringify(this.transactions)}${this.previousHash}${this.validator}`;
    return keccak256(toUtf8Bytes(data));
  }
}

module.exports = { Block };

/* ================= server/blockchain/Blockchain.js ================= */
const fs = require('fs-extra');
const path = require('path');
const { Block } = require('./Block');

class Blockchain {
  constructor(ipfsClient, consensus) {
    this.ipfs = ipfsClient;
    this.consensus = consensus;
    this.pendingTransactions = [];
    this.cidsFile = path.resolve(__dirname, '../blocks.json');
    fs.ensureFileSync(this.cidsFile);
    this.initializeChain();
  }

  async initializeChain() {
    let cids;
    try {
      cids = fs.readJsonSync(this.cidsFile);
    } catch {
      const genesis = new Block(0, Date.now(), [], '0', 'genesis');
      const { cid } = await this.ipfs.add(JSON.stringify(genesis));
      cids = [cid.toString()];
      fs.writeJsonSync(this.cidsFile, cids);
    }
    this.cids = cids;
  }

  async addTransaction(tx) {
    if (!this.consensus.verifyTransaction(tx)) {
      throw new Error('Invalid transaction');
    }
    this.pendingTransactions.push(tx);
    if (this.pendingTransactions.length >= this.consensus.txPerBlock) {
      await this.createBlock();
    }
  }

  async createBlock() {
    const lastCid = this.cids[this.cids.length - 1];
    const prevData = await this.ipfs.cat(lastCid);
    const previous = JSON.parse(Buffer.from(prevData).toString());
    const newIndex = previous.index + 1;
    const txs = this.pendingTransactions.splice(0);
    const validator = this.consensus.chooseValidator(newIndex);
    const block = new Block(newIndex, Date.now(), txs, previous.hash, validator);
    if (!this.consensus.verifyBlock(block, previous)) {
      throw new Error('Block verification failed');
    }
    const { cid } = await this.ipfs.add(JSON.stringify(block));
    this.cids.push(cid.toString());
    fs.writeJsonSync(this.cidsFile, this.cids);
  }

  async getChain() {
    const blocks = [];
    for (const cid of this.cids) {
      const data = await this.ipfs.cat(cid);
      blocks.push(JSON.parse(Buffer.from(data).toString()));
    }
    return blocks;
  }

  async getAuditProof(idx) {
    if (idx < 0 || idx >= this.cids.length) {
      throw new Error('Invalid block index');
    }
    const blockData = await this.ipfs.cat(this.cids[idx]);
    const block = JSON.parse(Buffer.from(blockData).toString());
    const chain = await this.getChain();
    return { block, chain };
  }
}

module.exports = { Blockchain };

/* ================= server/consensus/PoAConsensus.js ================= */
class PoAConsensus {
  constructor(authorityKeys) {
    this.authorityKeys = authorityKeys;
    this.txPerBlock = 10;
  }

  verifyTransaction(tx) {
    const signer = require('ethers').utils.verifyMessage(
      JSON.stringify({ electionId: tx.electionId, voteData: tx.voteData }),
      tx.signature
    );
    return signer === tx.voterAddress;
  }

  chooseValidator(blockIndex) {
    if (!this.authorityKeys.length) throw new Error('No authority keys');
    return this.authorityKeys[blockIndex % this.authorityKeys.length];
  }

  verifyBlock(block, previous) {
    if (block.previousHash !== previous.hash) return false;
    if (block.hash !== block.computeHash()) return false;
    if (!this.authorityKeys.includes(block.validator)) return false;
    return true;
  }
}

module.exports = { PoAConsensus };

/* ================= client/package.json ================= */
{
  "name": "blockchain-voting-client",
  "version": "1.0.0",
  "scripts": {
    "dev": "next dev",
    "build": "next build"
  },
  "dependencies": {
    "axios": "^1.4.0",
    "ethers": "^5.7.2",
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "next": "^13.5.0"
  }
}

/* ================= client/pages/index.js ================= */
import { useState } from 'react';
import axios from 'axios';
import { ethers } from 'ethers';

export default function Home() {
  const [electionId, setElectionId] = useState('');
  const [voteData, setVoteData] = useState('');
  const [wallet, setWallet] = useState(null);
  const [message, setMessage] = useState('');

  const connectWallet = async () => {
    if (!window.ethereum) {
      alert('MetaMask not detected');
      return;
    }
    const provider = new ethers.providers.Web3Provider(window.ethereum);
    await provider.send('eth_requestAccounts', []);
    const signer = provider.getSigner();
    setWallet(signer);
  };

  const castVote = async () => {
    if (!wallet) return alert('Connect wallet first.');
    const payloadObj = { electionId, voteData };
    const messageStr = JSON.stringify(payloadObj);
    const signature = await wallet.signMessage(messageStr);
    const voterAddress = await wallet.getAddress();
    const payload = { voterAddress, electionId, voteData, signature };
    const res = await axios.post('/api/castVote', payload);
    setMessage(res.data.message);
  };

  return (
    <div style={{ padding: '2rem' }}>
      <h1>Blockchain Voting</h1>
      {!wallet ? (
        <button onClick={connectWallet}>Connect MetaMask</button>
      ) : (
        <>
          <p>Connected: {wallet._address}</p>
          <input placeholder="Election ID" value={electionId} onChange={e => setElectionId(e.target.value)} />
          <input placeholder="Your Vote" value={voteData} onChange={e => setVoteData(e.target.value)} />
          <button onClick={castVote}>Submit Vote</button>
          {message && <p>{message}</p>}
        </>
      )}
    </div>
  );
}

/* ================= client/pages/api/castVote.js ================= */
import axios from 'axios';

export default async function handler(req, res) {
  try {
    const response = await axios.post('http://localhost:3001/castVote', req.body);
    res.status(response.status).json(response.data);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

/* ================= client/pages/audit.js ================= */
import { useState } from 'react';
import axios from 'axios';

export default function Audit() {
  const [index, setIndex] = useState('');
  const [proof, setProof] = useState(null);

  const getProof = async () => {
    try {
      const res = await axios.get(`/api/auditProof?blockIndex=${index}`);
      setProof(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div style={{ padding: '2rem' }}>
      <h1>Audit Proof</h1>
      <input placeholder="Block Index" value={index} onChange={e => setIndex(e.target.value)} />
      <button onClick={getProof}>Get Proof</button>
      {proof && <pre>{JSON.stringify(proof, null, 2)}</pre>}
    </div>
  );
}

/* ================= client/pages/api/auditProof.js ================= */
import axios from 'axios';

export default async function handler(req, res) {
  try {
    const { blockIndex } = req.query;
    const response = await axios.get(
      `http://localhost:3001/auditProof?blockIndex=${blockIndex}`
    );
    res.status(response.status).json(response.data);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}
