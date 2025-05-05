const fs = require('fs-extra');
const path = require('path');
const { Block } = require('./Block');

// blockchain class
class Blockchain {
  // constructor sets up blockchain properties
  constructor(ipfs, consensus, redis) {
    this.ipfs = ipfs;
    this.consensus = consensus;
    this.redis = redis;
    this.pendingTransactions = [];
    this.isCreatingBlock = false;
    this.height = 0;

    // file for storing block cids
    this.cidsFile = path.resolve(__dirname, '../blocks.json');
    fs.ensureFileSync(this.cidsFile);

    // file for storing voted registry
    this.votedFile = path.resolve(__dirname, '../voted.json');
    fs.ensureFileSync(this.votedFile);
    this.votedRegistry = new Set();

    this.initializeChain();
  }

  // load chain and voted registry from redis or file
  async initializeChain() {
    try {
      const cidsData = await this.redis.get('blockchain:cids');
      if (cidsData) {
        this.cids = JSON.parse(cidsData);
        this.height = this.cids.length;
        console.log(`Loaded ${this.cids.length} block CIDs from Redis`);
        return;
      }
    } catch (err) {
      console.warn('Redis CIDs load failed:', err.message);
    }

    try {
      this.cids = await fs.readJson(this.cidsFile);
      this.height = this.cids.length;
      console.log(`Loaded ${this.cids.length} block CIDs from file`);
      await this.redis.set('blockchain:cids', JSON.stringify(this.cids));
    } catch (err) {
      console.log('No existing chain found, starting new chain');
      this.cids = [];
    }

    try {
      const votedList = await fs.readJson(this.votedFile);
      this.votedRegistry = new Set(votedList);
      console.log(`Loaded ${this.votedRegistry.size} previous voters`);
    } catch (err) {
      console.log('No previous voters found, creating new registry');
      await fs.writeJson(this.votedFile, []);
    }
  }

  // get current chain height
  async getChainHeight() {
    return this.height;
  }

  // get the latest block from the chain
  async getLatestBlock() {
    try {
      if (this.height === 0 || this.cids.length === 0) {
        return null;
      }
      const latestCid = this.cids[this.height - 1];
      if (!latestCid) return null;
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

  // add a transaction to the blockchain
  async addTransaction(tx) {
    // check for duplicate vote
    const key = `${tx.electionId}:${tx.voterAddress}`;
    if (this.votedRegistry.has(key)) {
      throw new Error('Duplicate vote detected');
    }

    // verify transaction
    if (!this.consensus.verifyTransaction(tx)) {
      throw new Error('Invalid transaction');
    }

    // mark as voted and save
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

  // create a new block and add to chain
  async createBlock() {
    try {
      // get previous block
      const previousBlock = await this.getLatestBlock();

      // create new block
      const newIndex = this.height;
      const txs = this.pendingTransactions.splice(0);
      const validator = this.consensus.chooseValidator(newIndex);
      const block = new Block(newIndex, Date.now(), txs, previousBlock ? previousBlock.hash : '0', validator);

      // convert block to string
      const blockString = JSON.stringify(block);

      // add block to ipfs
      const { cid } = await this.ipfs.add(blockString);

      // save cid to array
      this.cids[newIndex] = cid.toString();

      // save cids to redis
      await this.redis.set('blockchain:cids', JSON.stringify(this.cids));

      // save cids to file
      await fs.writeJson(this.cidsFile, this.cids);

      // update height
      this.height++;

      console.log(`Created block ${newIndex} with CID ${cid.toString()}`);

      // notify other servers
      await this.redis.publish('blockchain:new-block', JSON.stringify({
        index: newIndex,
        cid: cid.toString()
      }));

      return block;
    } catch (err) {
      console.error(`Failed to create block: ${err.message}`);
      throw new Error(`Failed to create block: ${err.message}`);
    }
  }

  // get the full chain with a timeout
  async getChain(timeout = 5000) {
    return Promise.race([
      this._getChainImpl(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('IPFS timeout')), timeout)
      )
    ]);
  }

  // helper to get all blocks from ipfs
  async _getChainImpl() {
    try {
      const blocks = [];
      for (let i = 0; i < this.cids.length; i++) {
        try {
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

  // get audit proof for a block
  async getAuditProof(blockIndex) {
    try {
      if (blockIndex < 0 || blockIndex >= this.height) {
        throw new Error('Invalid block index');
      }
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

      // get the full chain
      const chain = await this.getChain();

      return { block, chain };
    } catch (err) {
      throw new Error(`Failed to get audit proof: ${err.message}`);
    }
  }

  // listen for updates from other servers
  async startBlockchainSync() {
    try {
      console.log('Creating Redis subscriber...');
      const subscriber = this.redis.duplicate();

      console.log('Subscribing to blockchain:new-block channel...');
      await Promise.race([
        subscriber.subscribe('blockchain:new-block'),
        new Promise((_, reject) => setTimeout(() =>
          reject(new Error('Redis subscription timeout')), 5000))
      ]);

      console.log('Successfully subscribed to blockchain updates');

      subscriber.on('message', async (channel, message) => {
        // handle new block notifications here
      });

      console.log('Started listening for blockchain updates from other servers');
    } catch (err) {
      console.error('Error in blockchain sync setup:', err.message);
      console.log('Continuing with server startup despite sync issues');
    }
  }
}

module.exports = { Blockchain };

async function startServer() {
  try {
    console.log('Starting server initialization...');
    const chain = new Blockchain(ipfs, consensus, redis);
    console.log('Blockchain instance created');
    console.log('Starting blockchain sync...');
    await chain.startBlockchainSync();
    console.log('Blockchain sync initialized');
    // Express setup...
    console.log('Express server configured, starting to listen...');
  } catch (err) {
    console.error('Server initialization failed:', err);
  }
}