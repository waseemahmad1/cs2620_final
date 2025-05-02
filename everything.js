/* ================= README.md ================= */
/*
# Blockchain Voting System

## Prerequisites
- Node.js v16+ and npm
- MetaMask (or other Web3) browser extension

## Installation & Setup

1. **Clone the repo**
   ```bash
   git clone <repo_url>
   cd <repo_folder>
   ```

2. **Server**
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
1. Open `http://localhost:3000` in your browser.
2. Connect your MetaMask wallet when prompted.
3. Enter an **Election ID** and your **Vote**, then click **Submit Vote**.
4. To audit, navigate to `/audit` and input a block index.
*/

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
      "level": "^8.0.0",
      "ethers": "^5.7.2",
      "body-parser": "^1.20.2",
      "fs-extra": "^11.1.1",
      "axios": "^1.4.0"
    }
  }
  
  /* ================= server/peers.js ================= */
  // List of peer node URLs
  module.exports = [
    'http://localhost:3001',
    'http://localhost:3002'
  ];
  
  /* ================= server/index.js ================= */
  const express = require('express');
  const bodyParser = require('body-parser');
  const { Level } = require('level');
  const fs = require('fs-extra');
  const path = require('path');
  const axios = require('axios');
  const peers = require('./peers');
  const { Blockchain } = require('../blockchain/Blockchain');
  const { PoAConsensus } = require('../consensus/PoAConsensus');
  
  // Ensure DB directory exists
  const dbDir = path.resolve(__dirname, 'voting-db');
  fs.ensureDirSync(dbDir);
  
  let db;
  try {
    db = new Level(dbDir, { valueEncoding: 'json' });
  } catch (err) {
    console.error(`Failed to open LevelDB at ${dbDir}:`, err);
    process.exit(1);
  }
  
  const authorityKeys = [ /* public keys here */ ];
  const consensus = new PoAConsensus(authorityKeys);
  const chain = new Blockchain(db, consensus);
  const app = express();
  app.use(bodyParser.json());
  
  // Broadcast utilities
  tasync function broadcastToPeers(path, payload) {
    for (const peer of peers) {
      try {
        await axios.post(`${peer}${path}`, payload);
      } catch (e) {
        console.warn(`Failed to broadcast to ${peer}${path}:`, e.message);
      }
    }
  }
  
  // Sync chain from first peer
  (async function syncChain() {
    if (!peers.length) return;
    try {
      const res = await axios.get(`${peers[0]}/getChain`);
      const remote = res.data;
      const localHeight = await chain.getChainHeight();
      if (remote.length > localHeight) {
        for (let i = localHeight; i < remote.length; i++) {
          await chain.addBlockFromRemote(remote[i]);
        }
        console.log(`Synced ${remote.length - localHeight} blocks from peer`);
      }
    } catch (e) {
      console.warn('Chain sync failed:', e.message);
    }
  })();
  
  // Cast a new vote and broadcast
  app.post('/castVote', async (req, res) => {
    const { voterAddress, electionId, voteData, signature } = req.body;
    try {
      await chain.addTransaction({ voterAddress, electionId, voteData, signature });
      await broadcastToPeers('/receiveTransaction', req.body);
      res.json({ success: true, message: 'Vote submitted.' });
    } catch (err) {
      res.status(400).json({ success: false, error: err.message });
    }
  });
  
  // Receive a transaction from a peer
  app.post('/receiveTransaction', async (req, res) => {
    try {
      await chain.addTransaction(req.body);
      res.json({ success: true });
    } catch (err) {
      res.status(400).json({ success: false, error: err.message });
    }
  });
  
  // Receive a new block from a peer
  app.post('/receiveBlock', async (req, res) => {
    try {
      await chain.addBlockFromRemote(req.body);
      res.json({ success: true });
    } catch (err) {
      res.status(400).json({ success: false, error: err.message });
    }
  });
  
  // Get full chain
  app.get('/getChain', async (req, res) => {
    try {
      const blocks = await chain.getChain();
      res.json(blocks);
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });
  
  // Audit proof
  app.get('/auditProof', async (req, res) => {
    try {
      const proof = await chain.getAuditProof(Number(req.query.blockIndex));
      res.json(proof);
    } catch (err) {
      res.status(400).json({ success: false, error: err.message });
    }
  });
  
  const PORT = process.env.PORT || 3001;
  app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
  
  /* ================= blockchain/Block.js ================= */
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
  
  /* ================= blockchain/Blockchain.js ================= */
  const { Block } = require('./Block');
  class Blockchain {
    constructor(db, consensus) {
      this.db = db;
      this.consensus = consensus;
      this.pendingTransactions = [];
      this.isCreatingBlock = false;
      this.height = 0;
      this.initializeChain();
    }
    async initializeChain() {
      try { await this.db.get('block-0'); } catch {
        const genesis = new Block(0, Date.now(), [], '0', 'genesis');
        await this.db.put('block-0', JSON.stringify(genesis));
      }
      this.height = await this._loadHeight();
    }
    async _loadHeight() {
      let count = 0;
      return new Promise((resolve, reject) => {
        this.db.createKeyStream()
          .on('data', key => { if (key.startsWith('block-')) count++; })
          .on('end', () => resolve(count))
          .on('error', err => reject(err));
      });
    }
    async getChainHeight() { return this.height; }
    async getLatestBlock() {
      const data = await this.db.get(`block-${this.height-1}`);
      return JSON.parse(data);
    }
    async addTransaction(tx) {
      if (!this.consensus.verifyTransaction(tx)) throw new Error('Invalid transaction');
      this.pendingTransactions.push(tx);
      if (this.pendingTransactions.length >= this.consensus.txPerBlock && !this.isCreatingBlock) {
        this.isCreatingBlock = true;
        await this.createBlock();
        this.isCreatingBlock = false;
      }
    }
    async createBlock() {
      const latest = await this.getLatestBlock();
      const index = latest.index + 1;
      const txs = [...this.pendingTransactions];
      this.pendingTransactions = [];
      const validator = this.consensus.chooseValidator(index);
      const block = new Block(index, Date.now(), txs, latest.hash, validator);
      if (!this.consensus.verifyBlock(block, latest)) throw new Error('Invalid block');
      await this.db.put(`block-${index}`, JSON.stringify(block));
      this.height++;
    }
    async addBlockFromRemote(blockObj) {
      const latest = await this.getLatestBlock();
      if (blockObj.previousHash !== latest.hash) throw new Error('Chain mismatch');
      if (!this.consensus.verifyBlock(new Block(
        blockObj.index,
        blockObj.timestamp,
        blockObj.transactions,
        blockObj.previousHash,
        blockObj.validator
      ), latest)) throw new Error('Invalid remote block');
      await this.db.put(`block-${blockObj.index}`, JSON.stringify(blockObj));
      this.height++;
    }
    async getChain() {
      const blocks = [];
      for (let i = 0; i < this.height; i++) {
        const data = await this.db.get(`block-${i}`);
        blocks.push(JSON.parse(data));
      }
      return blocks;
    }
    async getAuditProof(idx) {
      const target = await this.db.get(`block-${idx}`);
      const chain = await this.getChain();
      return { block: JSON.parse(target), chain };
    }
  }
  module.exports = { Blockchain };
  
  /* ================= consensus/PoAConsensus.js ================= */
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
    chooseValidator(index) {
      if (!this.authorityKeys.length) throw new Error('No authorities');
      return this.authorityKeys[index % this.authorityKeys.length];
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
    "scripts": { "dev": "next dev", "build": "next build" },
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
    const [eid, setEid] = useState('');
    const [vote, setVote] = useState('');
    const [wallet, setWallet] = useState(null);
    const [msg, setMsg] = useState('');
    const connectWallet = async () => {
      if (!window.ethereum) return alert('MetaMask not detected');
      const provider = new ethers.providers.Web3Provider(window.ethereum);
      await provider.send('eth_requestAccounts', []);
      setWallet(provider.getSigner());
    };
    const cast = async () => {
      if (!wallet) return alert('Connect wallet');
      const payload = { voterAddress: await wallet.getAddress(), electionId: eid, voteData: vote, signature: await wallet.signMessage(JSON.stringify({ electionId: eid, voteData: vote })) };
      const res = await axios.post('/api/castVote', payload);
      setMsg(res.data.message);
    };
    return (
      <div style={{padding:'2rem'}}>
        <h1>Voting</h1>
        {!wallet ? <button onClick={connectWallet}>Connect MetaMask</button> : (
          <>
            <p>Address: {wallet._address}</p>
            <input placeholder="Election ID" value={eid} onChange={e=>setEid(e.target.value)} />
            <input placeholder="Your Vote" value={vote} onChange={e=>setVote(e.target.value)} />
            <button onClick={cast}>Submit</button>
            {msg && <p>{msg}</p>}
          </>
        )}
      </div>
    );
  }
  
  /* ================= client/pages/api/castVote.js ================= */
  import axios from 'axios';
  export default async function handler(req,res){
    try{const r=await axios.post('http://localhost:3001/castVote',req.body);res.status(r.status).json(r.data);}catch(e){res.status(500).json({error:e.message});}
  }
  
  /* ================= client/pages/audit.js ================= */
  import {useState} from 'react';import axios from 'axios';
  export default function Audit(){const [i,setI]=useState('');const [p,setP]=useState(null);
    const get=async()=>{try{const r=await axios.get(`/api/auditProof?blockIndex=${i}`);setP(r.data);}catch(e){console.error(e);} };
    return (<div style={{padding:'2rem'}}><h1>Audit</h1><input placeholder="Index" value={i} onChange={e=>setI(e.target.value)}/><button onClick={get}>Go</button>{p&&<pre>{JSON.stringify(p,null,2)}</pre>}</div>);
  }
  
  /* ================= client/pages/api/auditProof.js ================= */
  import axios from 'axios';
  export default async function handler(req,res){
    try{const{blockIndex}=req.query;const r=await axios.get(`http://localhost:3001/auditProof?blockIndex=${blockIndex}`);res.status(r.status).json(r.data);}catch(e){res.status(500).json({error:e.message});}
  }
  