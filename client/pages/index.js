import { useState } from 'react';
import axios from 'axios';
import { ethers } from 'ethers';

export default function Home() {
  const [electionId, setElectionId] = useState('');
  const [voteData, setVoteData] = useState('');
  const [wallet, setWallet] = useState(null);
  const [message, setMessage] = useState('');

  const connectWallet = async () => {
    if (!window.ethereum) {
      alert('MetaMask not detected');
      return;
    }
    const provider = new ethers.providers.Web3Provider(window.ethereum);
    await provider.send('eth_requestAccounts', []);
    const signer = provider.getSigner();
    setWallet(signer);
  };

  const castVote = async () => {
    try {
      if (!wallet) return alert('Connect wallet first.');
      const payloadObj = { electionId, voteData };
      const messageStr = JSON.stringify(payloadObj);
      const signature = await wallet.signMessage(messageStr);
      const voterAddress = await wallet.getAddress();
      const payload = { voterAddress, electionId, voteData, signature };
      const res = await axios.post('/api/castVote', payload);
      setMessage(res.data.message);
    } catch (err) {
      // Show the detailed error from the server if available
      setMessage(`Error: ${err.response?.data?.error || err.message}`);
    }
  };

  return (
    <div style={{ padding: '2rem' }}>
      <h1>Blockchain Voting</h1>
      {!wallet ? (
        <button onClick={connectWallet}>Connect MetaMask</button>
      ) : (
        <>
          <p>Connected: {wallet._address}</p>
          <input placeholder="Election ID" value={electionId} onChange={e => setElectionId(e.target.value)} />
          <input placeholder="Your Vote" value={voteData} onChange={e => setVoteData(e.target.value)} />
          <button onClick={castVote}>Submit Vote</button>
          {message && <p>{message}</p>}
        </>
      )}
    </div>
  );
}