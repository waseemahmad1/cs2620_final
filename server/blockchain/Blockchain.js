const fs = require('fs-extra');
const path = require('path');
const { Block } = require('./Block');

class Blockchain {
  constructor(ipfs, consensus) {
    this.ipfs = ipfs;       // Store IPFS client properly
    this.consensus = consensus;
    this.pendingTransactions = [];
    this.isCreatingBlock = false;
    this.height = 0;
    
    // Initialize our CIDs file path and array
    this.cidsFile = path.resolve(__dirname, '../blocks.json');
    fs.ensureFileSync(this.cidsFile);
    
    // Add voted registry functionality
    this.votedFile = path.resolve(__dirname, '../voted.json');
    fs.ensureFileSync(this.votedFile);
    this.votedRegistry = new Set();
    
    this.initializeChain();
  }

  async initializeChain() {
    // Load CID list from file
    try {
      this.cids = await fs.readJson(this.cidsFile);
      console.log(`Loaded ${this.cids.length} block CIDs`);
      this.height = this.cids.length;
    } catch (err) {
      // Create genesis block if no blocks exist
      console.log('No blocks found, creating genesis block');
      const genesis = new Block(0, Date.now(), [], '0', 'genesis');
      const { cid } = await this.ipfs.add(JSON.stringify(genesis));
      this.cids = [cid.toString()];
      await fs.writeJson(this.cidsFile, this.cids);
      this.height = 1;
    }
      
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

  async getChainHeight() {
    return this.height;
  }

  async getLatestBlock() {
    try {
      if (this.height === 0 || this.cids.length === 0) {
        return null;
      }
      
      const latestCid = this.cids[this.height - 1];
      if (!latestCid) return null;
      
      // Properly handle AsyncIterable from ipfs.cat()
      let content = [];
      for await (const chunk of this.ipfs.cat(latestCid)) {
        content.push(chunk);
      }
      const blockData = Buffer.concat(content).toString();
      return JSON.parse(blockData);
    } catch (err) {
      console.error(`Failed to get latest block: ${err.message}`);
      return null;
    }
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
    try {
      // Get the latest block for its hash
      const previousBlock = await this.getLatestBlock();

      // Create new block
      const newIndex = this.height;
      const txs = this.pendingTransactions.splice(0);
      const validator = this.consensus.chooseValidator(newIndex);
      const block = new Block(newIndex, Date.now(), txs, previousBlock ? previousBlock.hash : '0', validator);

      // Convert block to JSON string for storage
      const blockString = JSON.stringify(block);
      
      // Store in IPFS (not LevelDB)e block to IPFS
      const { cid } = await this.ipfs.add(blockString);
      
      // Add the CID to our array of block CIDs
      this.cids[newIndex] = cid.toString();
      
      // Persist the updated CID array
      await fs.writeJson(this.cidsFile, this.cids);

      // Update chain height
      this.height++;

      console.log(`Created block ${newIndex} with CID ${cid.toString()}`);
      return block;
    } catch (err) {
      console.error(`Failed to create block: ${err.message}`);
      throw new Error(`Failed to create block: ${err.message}`);
    }
  }

  async getChain() {
    try {
      const blocks = [];
      for (let i = 0; i < this.cids.length; i++) {
        try {
          // Properly handle AsyncIterable from ipfs.cat()
          let content = [];
          for await (const chunk of this.ipfs.cat(this.cids[i])) {
            content.push(chunk);
          }
          const blockData = Buffer.concat(content).toString();
          const block = JSON.parse(blockData);
          blocks.push(block);
        } catch (blockError) {
          console.error(`Error retrieving block ${i}:`, blockError.message);
        }
      }
      return blocks;
    } catch (err) {
      throw new Error(`Failed to get chain: ${err.message}`);
    }
  }

  async getAuditProof(blockIndex) {
    try {
      if (blockIndex < 0 || blockIndex >= this.height) {
        throw new Error('Invalid block index');
      }
      
      // Use IPFS instead of LevelDB
      const cid = this.cids[blockIndex];
      if (!cid) {
        throw new Error(`No CID found for block ${blockIndex}`);
      }
      
      let content = [];
      for await (const chunk of this.ipfs.cat(cid)) {
        content.push(chunk);
      }
      const blockData = Buffer.concat(content).toString();
      const block = JSON.parse(blockData);
      
      // Get the entire chain for verification
      const chain = await this.getChain();
      
      return { block, chain };
    } catch (err) {
      throw new Error(`Failed to get audit proof: ${err.message}`);
    }
  }
}

module.exports = { Blockchain };