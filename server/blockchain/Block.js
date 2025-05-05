const { keccak256, toUtf8Bytes } = require('ethers').utils;

class Block {
  constructor(index, timestamp, transactions, previousHash, validator) {
    this.index = index;
    this.timestamp = timestamp;
    this.transactions = transactions;
    this.previousHash = previousHash;
    this.validator = validator;
    this.hash = this.computeHash();
  }

  
  computeHash() {
    const data = `${this.index}${this.timestamp}${JSON.stringify(this.transactions)}${this.previousHash}${this.validator}`;
    return keccak256(toUtf8Bytes(data));
  }
}

module.exports = { Block };