const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs-extra');
const { Blockchain } = require('./blockchain/Blockchain');
const { PoAConsensus } = require('./consensus/PoAConsensus');
// Add ethers import for signature verification
const { ethers } = require('ethers');

// Wrap the initialization and server start in an async function
async function startServer() {
  // Use dynamic import
  const { create } = await import('ipfs-http-client');

  // Initialize IPFS client (default to localhost)
  const ipfs = create({ url: process.env.IPFS_API_URL || 'http://localhost:5001' });

  // PoA consensus setup: at least one validator key is required
  const authorityKeys = [
    '0x206120Cdc0d7F8F66b2d1Fb774158e53F4f67658',  // your test wallet
  ];
  const consensus = new PoAConsensus(authorityKeys);
  const chain = new Blockchain(ipfs, consensus);

  // Create a simple in-memory database for elections
  // For a production system, you'd want to use LevelDB or another persistent store
  const elections = new Map();
  
  const app = express();
  app.use(bodyParser.json());
  
  // 1) Create Election endpoint
  app.post('/createElection', async (req, res) => {
    try {
      const { electionId, signature } = req.body;
      const creator = ethers.utils.verifyMessage(
        JSON.stringify({ electionId }),
        signature
      );
      const key = `election-${electionId}`;
      
      // Check if election already exists
      if (elections.has(key)) {
        return res.status(400).json({ success: false, error: 'Election already exists' });
      }
      
      const election = { electionId, creator, status: 'open', createdAt: Date.now() };
      elections.set(key, election);
      res.json({ success: true, election });
    } catch (err) {
      res.status(400).json({ success: false, error: err.message });
    }
  });

  // 2) Get Election endpoint
  app.get('/getElection', async (req, res) => {
    try {
      const { electionId } = req.query;
      const key = `election-${electionId}`;
      
      if (!elections.has(key)) {
        return res.status(404).json({ success: false, error: 'Election not found' });
      }
      
      res.json(elections.get(key));
    } catch (err) {
      res.status(404).json({ success: false, error: 'Election not found' });
    }
  });

  // 3) Cast vote endpoint (updated to enforce open election)
  app.post('/castVote', async (req, res) => {
    try {
      console.log('▶️  /castVote body:', req.body);
      const { voterAddress, electionId, voteData, signature } = req.body;
      
      // Ensure election exists and is open
      const key = `election-${electionId}`;
      if (!elections.has(key)) {
        return res.status(400).json({ success: false, error: 'Election not found' });
      }
      
      const election = elections.get(key);
      if (election.status !== 'open') {
        return res.status(400).json({ success: false, error: 'Election is closed' });
      }
      
      await chain.addTransaction({ voterAddress, electionId, voteData, signature });
      res.json({ success: true, message: 'Vote submitted.' });
    } catch (err) {
      res.status(400).json({ success: false, error: err.message });
    }
  });

  // 4) Close Election endpoint (new functionality)
  app.post('/closeElection', async (req, res) => {
    try {
      const { electionId, signature } = req.body;
      const sender = ethers.utils.verifyMessage(
        JSON.stringify({ action: 'close', electionId }),
        signature
      );
      
      const key = `election-${electionId}`;
      if (!elections.has(key)) {
        return res.status(404).json({ success: false, error: 'Election not found' });
      }
      
      const election = elections.get(key);
      // Only the creator can close the election
      if (sender !== election.creator) {
        return res.status(403).json({ success: false, error: 'Only the election creator can close it' });
      }
      
      election.status = 'closed';
      election.closedAt = Date.now();
      elections.set(key, election);
      
      res.json({ success: true, message: 'Election closed successfully' });
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

  // 5) View Ledger (Get all votes for a given election)
  app.get('/getLedger', async (req, res) => {
    try {
      const { electionId } = req.query;
      
      // ensure election exists
      const key = `election-${electionId}`;
      if (!elections.has(key)) {
        return res.status(404).json({ success: false, error: 'Election not found' });
      }
      
      // fetch full chain from blockchain
      const blocks = await chain.getChain();
      
      // collect only transactions for this election
      const votes = blocks
        .flatMap(block => block.transactions)
        .filter(tx => tx.electionId === electionId);
        
      res.json({ success: true, votes });
    } catch (err) {
      res.status(400).json({ success: false, error: err.message });
    }
  });

  const PORT = process.env.PORT || 3001;
  app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
}

// Call the async function to start the server
startServer().catch(err => {
  console.error("Failed to start server:", err);
  process.exit(1);
});