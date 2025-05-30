import { useState, useEffect } from 'react';
import axios from 'axios';
import { ethers } from 'ethers';

// main home component for blockchain voting app
export default function Home() {
  // state variables for election id, vote data, wallet, messages, and ledger
  const [electionId, setElectionId] = useState('');
  const [voteData, setVoteData] = useState('');
  const [wallet, setWallet] = useState(null);
  const [message, setMessage] = useState('');
  const [ledger, setLedger] = useState([]);

  // connect to metamask wallet
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

  // handler for creating a new election
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

  // handler for voting using prompts
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

  // handler for voting using form inputs
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
      // show the detailed error from the server if available
      setMessage(`Error: ${err.response?.data?.error || err.message}`);
    }
  };

  // handler for closing an election
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

  // handler for viewing the ledger of an election
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
      {/* show connect button if wallet not connected */}
      {!wallet ? (
        <button onClick={connectWallet}>Connect MetaMask</button>
      ) : (
        <>
          <p>Connected: {wallet._address}</p>
          
          {/* buttons for election actions */}
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

          {/* form for voting using inputs */}
          <div style={{ marginTop: '1rem' }}>
            <h3>Vote with Form</h3>
            <input placeholder="Election ID" value={electionId} onChange={e => setElectionId(e.target.value)} />
            <input placeholder="Your Vote" value={voteData} onChange={e => setVoteData(e.target.value)} />
            <button onClick={castVote}>Submit Vote</button>
          </div>
          
          {/* display message if any */}
          {message && <p style={{ marginTop: '1rem', fontWeight: 'bold' }}>{message}</p>}
          
          {/* display ledger results if available */}
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