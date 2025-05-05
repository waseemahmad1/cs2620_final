import { useState, useEffect } from 'react';
import axios from 'axios';
import { ethers } from 'ethers';

export default function Home() {
  const [electionId, setElectionId] = useState('');
  const [voteData, setVoteData] = useState('');
  const [wallet, setWallet] = useState(null);
  const [message, setMessage] = useState('');
  const [ledger, setLedger] = useState([]);

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

  // Create Election handler
  const handleCreate = async () => {
    try {
      const electionId = prompt('Enter new Election ID:');
      if (!electionId) return;
      const message = JSON.stringify({ electionId });
      const signature = await wallet.signMessage(message);
      const res = await axios.post('/api/createElection', { electionId, signature });
      setMessage(res.data.success ? 'Election created!' : res.data.error);
    } catch (err) {
      setMessage(`Error: ${err.response?.data?.error || err.message}`);
    }
  };

  // Vote handler (enhanced version using prompts)
  const handleVote = async () => {
    try {
      const electionId = prompt('Enter Election ID:');
      if (!electionId) return;
      const voteData = prompt('Enter your Vote:');
      if (!voteData) return;
      const message = JSON.stringify({ electionId, voteData });
      const signature = await wallet.signMessage(message);
      const voterAddress = await wallet.getAddress();
      const res = await axios.post('/api/castVote', {
        electionId,
        voterAddress,
        voteData,
        signature
      });
      setMessage(res.data.success ? 'Vote submitted!' : res.data.error);
    } catch (err) {
      setMessage(`Error: ${err.response?.data?.error || err.message}`);
    }
  };

  // Original vote handler (using form inputs)
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

  // Add this function with your other handlers
  const handleClose = async () => {
    try {
      const electionId = prompt('Enter Election ID to close:');
      if (!electionId) return;
      
      const message = JSON.stringify({ action: 'close', electionId });
      const signature = await wallet.signMessage(message);
      
      const res = await axios.post('/api/closeElection', { electionId, signature });
      setMessage(res.data.success ? 'Election closed successfully!' : res.data.error);
    } catch (err) {
      setMessage(`Error: ${err.response?.data?.error || err.message}`);
    }
  };

  // View Ledger handler
  const handleViewLedger = async () => {
    const electionId = prompt('Enter Election ID to view history:');
    if (!electionId) return;
    try {
      const { data } = await axios.get('/api/getLedger', {
        params: { electionId }
      });
      setLedger(data.votes);
      setMessage('');
    } catch (err) {
      setMessage(`Error: ${err.response?.data?.error || err.message}`);
      setLedger([]);
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
          
          {/* Enhanced UI with new buttons */}
          <div style={{ marginBottom: '1rem' }}>
            <button 
              onClick={handleCreate} 
              style={{ marginRight: '0.5rem', background: '#4CAF50', color: 'white', padding: '8px 16px' }}
            >
              Create Election
            </button>
            <button 
              onClick={handleVote}
              style={{ background: '#2196F3', color: 'white', padding: '8px 16px' }}
            >
              Quick Vote
            </button>
            <button 
              onClick={handleClose}
              style={{ marginLeft: '0.5rem', background: '#FF5722', color: 'white', padding: '8px 16px' }}
            >
              End Election
            </button>
            <button 
              onClick={handleViewLedger}
              style={{ background: '#9C27B0', color: 'white', padding: '8px 16px' }}
            >
              View Ledger
            </button>
          </div>

          {/* Original form for voting */}
          <div style={{ marginTop: '1rem' }}>
            <h3>Vote with Form</h3>
            <input placeholder="Election ID" value={electionId} onChange={e => setElectionId(e.target.value)} />
            <input placeholder="Your Vote" value={voteData} onChange={e => setVoteData(e.target.value)} />
            <button onClick={castVote}>Submit Vote</button>
          </div>
          
          {message && <p style={{ marginTop: '1rem', fontWeight: 'bold' }}>{message}</p>}
          
          {/* Display ledger results */}
          {ledger.length > 0 && (
            <div style={{ marginTop: '2rem', padding: '1rem', border: '1px solid #ddd', borderRadius: '5px' }}>
              <h2>Election History</h2>
              <ul style={{ listStyleType: 'none', padding: 0 }}>
                {ledger.map(({ voterAddress, voteData }, i) => (
                  <li key={i} style={{ padding: '8px 0', borderBottom: '1px solid #eee' }}>
                    <strong>{voterAddress.substring(0, 10)}...{voterAddress.substring(32)}</strong> voted "{voteData}"
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}