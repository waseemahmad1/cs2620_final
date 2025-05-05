class PoAConsensus {
  // constructor takes an array of authority keys
  constructor(authorityKeys) {
    this.authorityKeys = authorityKeys;
    this.txPerBlock = 1; // number of transactions per block
  }

  // verify that a transaction is signed by the voter
  verifyTransaction(tx) {
    const signer = require('ethers').utils.verifyMessage(
      JSON.stringify({ electionId: tx.electionId, voteData: tx.voteData }),
      tx.signature
    );
    return signer === tx.voterAddress;
  }

  // choose a validator for a given block index
  chooseValidator(blockIndex) {
    if (!this.authorityKeys.length) throw new Error('No authority keys');
    return this.authorityKeys[blockIndex % this.authorityKeys.length];
  }

  // verify that a block is valid
  verifyBlock(block, previous) {
    if (block.previousHash !== previous.hash) return false;
    if (block.hash !== block.computeHash()) return false;
    if (!this.authorityKeys.includes(block.validator)) return false;
    return true;
  }
}

module.exports = { PoAConsensus };