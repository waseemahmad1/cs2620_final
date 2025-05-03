const fs = require('fs-extra');
const path = require('path');
const { Block } = require('./Block');

class Blockchain {
  constructor(db, consensus) {
    this.db = db;
    this.consensus = consensus;
    this.pendingTransactions = [];
    this.isCreatingBlock = false;
    this.height = 0;
    
    // Add voted registry functionality (from the IPFS implementation)
    this.votedFile = path.resolve(__dirname, '../voted.json');
    fs.ensureFileSync(this.votedFile);
    this.votedRegistry = new Set();
    
    this.initializeChain();
  }

  async initializeChain() {
    try {
      await this.db.get('block-0');
    } catch {
      const genesis = new Block(0, Date.now(), [], '0', 'genesis');
      await this.db.put('block-0', JSON.stringify(genesis));
    }
    
    // Load current height
    this.height = await this._loadHeight();
    
    // Load voted registry
    try {
      const votedList = await fs.readJson(this.votedFile);
      this.votedRegistry = new Set(votedList);
      console.log(`Loaded ${this.votedRegistry.size} previous voters`);
    } catch (err) {
      console.log('No previous voters found, creating new registry');
      await fs.writeJson(this.votedFile, []);
    }
  }

  async _loadHeight() {
    // ...existing code unchanged...
  }

  async getChainHeight() {
    // ...existing code unchanged...
  }

  async getLatestBlock() {
    // ...existing code unchanged...
  }

  async addTransaction(tx) {
    // Add duplicate vote checking
    const key = `${tx.electionId}:${tx.voterAddress}`;
    if (this.votedRegistry.has(key)) {
      throw new Error('Duplicate vote detected');
    }
    
    if (!this.consensus.verifyTransaction(tx)) {
      throw new Error('Invalid transaction');
    }
    
    // Mark as voted and persist
    this.votedRegistry.add(key);
    await fs.writeJson(this.votedFile, [...this.votedRegistry]);
    console.log(`Registered vote from ${tx.voterAddress} for election ${tx.electionId}`);
    
    this.pendingTransactions.push(tx);
    if (this.pendingTransactions.length >= this.consensus.txPerBlock && !this.isCreatingBlock) {
      this.isCreatingBlock = true;
      await this.createBlock();
      this.isCreatingBlock = false;
    }
  }

  async createBlock() {
    // ...existing code unchanged...
  }

  async getChain() {
    // ...existing code unchanged...
  }

  async getAuditProof(blockIndex) {
    // ...existing code unchanged...
  }
}

module.exports = { Blockchain };