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
    try {
      await this.db.get('block-0');
    } catch {
      const genesis = new Block(0, Date.now(), [], '0', 'genesis');
      await this.db.put('block-0', JSON.stringify(genesis));
    }
    // Load current height
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

  async getChainHeight() {
    return this.height;
  }

  async getLatestBlock() {
    const data = await this.db.get(`block-${this.height - 1}`);
    return JSON.parse(data);
  }

  async addTransaction(tx) {
    if (!this.consensus.verifyTransaction(tx)) {
      throw new Error('Invalid transaction');
    }
    this.pendingTransactions.push(tx);
    if (this.pendingTransactions.length >= this.consensus.txPerBlock && !this.isCreatingBlock) {
      this.isCreatingBlock = true;
      await this.createBlock();
      this.isCreatingBlock = false;
    }
  }

  async createBlock() {
    const latest = await this.getLatestBlock();
    const newIndex = latest.index + 1;
    const txs = this.pendingTransactions.slice();
    this.pendingTransactions = [];
    const validator = this.consensus.chooseValidator(newIndex);
    const block = new Block(newIndex, Date.now(), txs, latest.hash, validator);
    if (!this.consensus.verifyBlock(block, latest)) {
      throw new Error('Block verification failed');
    }
    await this.db.put(`block-${newIndex}`, JSON.stringify(block));
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

  async getAuditProof(blockIndex) {
    const target = await this.db.get(`block-${blockIndex}`);
    const chain = await this.getChain();
    return { block: JSON.parse(target), chain };
  }
}

module.exports = { Blockchain };