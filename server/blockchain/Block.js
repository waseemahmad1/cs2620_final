const { keccak256, toUtf8Bytes } = require('ethers').utils;

// block class definition
class Block {
  // constructor sets block properties
  constructor(index, timestamp, transactions, previousHash, validator) {
    this.index = index;
    this.timestamp = timestamp;
    this.transactions = transactions;
    this.previousHash = previousHash;
    this.validator = validator;
    this.hash = this.computeHash();
  }

  // computes the hash of the block
  computeHash() {
    const data = `${this.index}${this.timestamp}${JSON.stringify(this.transactions)}${this.previousHash}${this.validator}`;
    return keccak256(toUtf8Bytes(data));
  }
}

// export block class
module.exports = { Block };