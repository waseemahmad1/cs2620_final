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