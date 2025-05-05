const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs-extra');
const { ethers } = require('ethers');
const Redis = require('ioredis');
const { Blockchain } = require('./blockchain/Blockchain');
const { PoAConsensus } = require('./consensus/PoAConsensus');

// ---- Redis setup ----
// Commands will buffer until Redis is ready (default behavior)
const redis = new Redis({
  host: '127.0.0.1',
  port: 6379
});

// ---- Consul stub for service discovery (local dev) ----
const consul = {
  catalog: {
    service: {
      nodes: () => Promise.resolve([])
    }
  }
};

// (Optional) Utility for discovering other servers
async function getAvailableServers() {
  const services = await consul.catalog.service.nodes('blockchain-voting');
  return services.filter(s => s.ServiceStatus === 'passing');
}

async function startServer() {
  // Ensure any local storage directories exist
  const dbDir = path.resolve(__dirname, 'voting-db');
  fs.ensureDirSync(dbDir);

  // Dynamically import ESM-only IPFS client
  const ipfsModule = await import('ipfs-http-client');
  const createIpfs = ipfsModule.create;
  const ipfs = createIpfs({ url: 'http://localhost:5001' });

  // Proof-of-Authority setup: list your validator addresses here
  const authorityKeys = [
    '0x206120Cdc0d7F8F66b2d1Fb774158e53F4f67658'
    // add more as needed
  ];
  const consensus = new PoAConsensus(authorityKeys);

  // Initialize the blockchain (backed by IPFS + Redis)
  const chain = new Blockchain(ipfs, consensus, redis);

  // ---- Express app & routes ----
  const app = express();
  app.use(bodyParser.json());

  // Create Election
  app.post('/createElection', async (req, res) => {
    try {
      const { electionId, signature } = req.body;
      const creator = ethers.utils.verifyMessage(
        JSON.stringify({ electionId }),
        signature
      );
      const key = `election-${electionId}`;
      if (await redis.get(key)) {
        return res.status(400).json({ success: false, error: 'Election already exists' });
      }
      const election = { electionId, creator, status: 'open', createdAt: Date.now() };
      await redis.set(key, JSON.stringify(election));
      res.json({ success: true, election });
    } catch (err) {
      console.error('❌ createElection error:', err);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  });

  // Get Election
  app.get('/getElection', async (req, res) => {
    try {
      const key = `election-${req.query.electionId}`;
      const data = await redis.get(key);
      if (!data) return res.status(404).json({ success: false, error: 'Election not found' });
      res.json(JSON.parse(data));
    } catch {
      res.status(404).json({ success: false, error: 'Election not found' });
    }
  });

  // Cast Vote
  app.post('/castVote', async (req, res) => {
    try {
      const { voterAddress, electionId, voteData, signature } = req.body;
      const key = `election-${electionId}`;
      const raw = await redis.get(key);
      if (!raw) return res.status(400).json({ success: false, error: 'Election not found' });
      const election = JSON.parse(raw);
      if (election.status !== 'open') {
        return res.status(400).json({ success: false, error: 'Election is closed' });
      }
      await chain.addTransaction({ voterAddress, electionId, voteData, signature });
      res.json({ success: true, message: 'Vote submitted.' });
    } catch (err) {
      res.status(400).json({ success: false, error: err.message });
    }
  });

  // Close Election
  app.post('/closeElection', async (req, res) => {
    try {
      const { electionId, signature } = req.body;
      const sender = ethers.utils.verifyMessage(
        JSON.stringify({ action: 'close', electionId }),
        signature
      );
      const key = `election-${electionId}`;
      const raw = await redis.get(key);
      if (!raw) return res.status(404).json({ success: false, error: 'Election not found' });
      const election = JSON.parse(raw);
      if (sender !== election.creator) {
        return res.status(403).json({ success: false, error: 'Only the creator can close the election' });
      }
      election.status = 'closed';
      election.closedAt = Date.now();
      await redis.set(key, JSON.stringify(election));
      res.json({ success: true, message: 'Election closed successfully' });
    } catch (err) {
      res.status(400).json({ success: false, error: err.message });
    }
  });

  // View Ledger (votes for an election)
  app.get('/getLedger', async (req, res) => {
    try {
      const { electionId } = req.query;
      const raw = await redis.get(`election-${electionId}`);
      if (!raw) return res.status(404).json({ success: false, error: 'Election not found' });
      const blocks = await chain.getChain();
      const votes = blocks
        .flatMap(b => b.transactions)
        .filter(tx => tx.electionId === electionId);
      res.json({ success: true, votes });
    } catch (err) {
      res.status(400).json({ success: false, error: err.message });
    }
  });

  // Retrieve full chain
  app.get('/getChain', async (req, res) => {
    try {
      res.json(await chain.getChain());
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Audit proof
  app.get('/auditProof', async (req, res) => {
    try {
      const idx = Number(req.query.blockIndex);
      res.json(await chain.getAuditProof(idx));
    } catch (err) {
      res.status(400).json({ success: false, error: err.message });
    }
  });

  // Health check
  app.get('/health', (req, res) => res.send('OK'));

  // ---- Start HTTP server (before sync) ----
  const PORT = process.env.PORT || 3001;
  const HOST = '0.0.0.0';
  app.listen(PORT, HOST, () => {
    console.log(`✅ Server listening on ${HOST}:${PORT}`);
  });

  // ---- Kick off blockchain synchronization in background ----
  chain.startBlockchainSync()
    .then(() => console.log('🔄 Blockchain sync started'))
    .catch(err => console.error('❌ Blockchain sync error:', err));
}

// Invoke startup
startServer().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
