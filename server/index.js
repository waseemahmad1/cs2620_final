const express = require('express');
const bodyParser = require('body-parser');
const level = require('level');
const fs = require('fs-extra');
const path = require('path');
const { Blockchain } = require('./blockchain/Blockchain');
const { PoAConsensus } = require('./consensus/PoAConsensus');

// Ensure DB directory exists
const dbDir = path.resolve(__dirname, 'voting-db');
fs.ensureDirSync(dbDir);

let db;
try {
  db = level(dbDir);
} catch (err) {
  console.error(`Failed to open LevelDB at ${dbDir}:`, err);
  process.exit(1);
}

// Authority public keys for PoA consensus
const authorityKeys = [
  // insert authority public keys here
];
const consensus = new PoAConsensus(authorityKeys);
const chain = new Blockchain(db, consensus);

const app = express();
app.use(bodyParser.json());

// Endpoint to cast a vote
app.post('/castVote', async (req, res) => {
  const { voterAddress, electionId, voteData, signature } = req.body;
  try {
    await chain.addTransaction({ voterAddress, electionId, voteData, signature });
    res.json({ success: true, message: 'Vote submitted.' });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// Retrieve full blockchain
app.get('/getChain', async (req, res) => {
  try {
    const blocks = await chain.getChain();
    res.json(blocks);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get audit proof for a block index
app.get('/auditProof', async (req, res) => {
  const { blockIndex } = req.query;
  try {
    const proof = await chain.getAuditProof(Number(blockIndex));
    res.json(proof);
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));