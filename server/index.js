const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs-extra');
const { ethers } = require('ethers');
const Redis = require('ioredis');
const { Blockchain } = require('./blockchain/Blockchain');
const { PoAConsensus } = require('./consensus/PoAConsensus');

// set up redis connection, usually we would hide this but for demo purposes for class it's okay
const redis = new Redis({
  host: 'localhost',
  port: 3472,
  password: 'waseem'
});

// stub consul for service discovery (not used in prod)
const consul = {
  catalog: {
    service: {
      nodes: () => Promise.resolve([])
    }
  }
};

// get available servers (stubbed)
async function getAvailableServers() {
  const services = await consul.catalog.service.nodes('blockchain-voting');
  return services.filter(s => s.ServiceStatus === 'passing');
}

async function startServer() {
  // ensure voting-db directory exists
  const dbDir = path.resolve(__dirname, 'voting-db');
  fs.ensureDirSync(dbDir);

  // import ipfs client and connect to local ipfs node
  const ipfsModule = await import('ipfs-http-client');
  const createIpfs = ipfsModule.create;
  const ipfs = createIpfs({ url: 'http://localhost:5001' });

  // set up proof-of-authority consensus with validator addresses, usually we would hide this but for demo purposes for class it's okay
  const authorityKeys = [
    '0x206120Cdc0d7F8F66b2d1Fb774158e53F4f67658'
  ];
  const consensus = new PoAConsensus(authorityKeys);

  // initialize blockchain with ipfs, consensus, and redis
  const chain = new Blockchain(ipfs, consensus, redis);

  // set up express app
  const app = express();
  app.use(bodyParser.json());

  // create election endpoint
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

  // get election endpoint
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

  // cast vote endpoint
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

  // close election endpoint
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

  // get ledger (votes for an election) endpoint
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

  // get full chain endpoint
  app.get('/getChain', async (req, res) => {
    try {
      res.json(await chain.getChain());
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // audit proof endpoint
  app.get('/auditProof', async (req, res) => {
    try {
      const idx = Number(req.query.blockIndex);
      res.json(await chain.getAuditProof(idx));
    } catch (err) {
      res.status(400).json({ success: false, error: err.message });
    }
  });

  // health check endpoint
  app.get('/health', (req, res) => res.send('OK'));

  // start express server
  const PORT = process.env.PORT || 3001;
  const HOST = '0.0.0.0';
  app.listen(PORT, HOST, () => {
    console.log(`✅ Server listening on ${HOST}:${PORT}`);
  });

  // start blockchain sync in background
  chain.startBlockchainSync()
    .then(() => console.log('🔄 Blockchain sync started'))
    .catch(err => console.error('❌ Blockchain sync error:', err));
}

// start the server
startServer().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});