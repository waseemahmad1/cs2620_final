class PoAConsensus {
    constructor(authorityKeys) {
      this.authorityKeys = authorityKeys;
      this.txPerBlock = 10;
    }
  
    verifyTransaction(tx) {
      const signer = require('ethers').utils.verifyMessage(
        JSON.stringify({ electionId: tx.electionId, voteData: tx.voteData }),
        tx.signature
      );
      return signer === tx.voterAddress;
    }
  
    chooseValidator(blockIndex) {
      if (!this.authorityKeys.length) throw new Error('No authority keys available');
      return this.authorityKeys[blockIndex % this.authorityKeys.length];
    }
  
    verifyBlock(block, previous) {
      if (block.previousHash !== previous.hash) return false;
      if (block.hash !== block.computeHash()) return false;
      if (!this.authorityKeys.includes(block.validator)) return false;
      return true;
    }
  }