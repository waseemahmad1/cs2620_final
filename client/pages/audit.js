import { useState } from 'react';
import apiClient from '../utils/apiClient';

// audit proof page component
export default function Audit() {
  // state for block index input
  const [index, setIndex] = useState('');
  // state for proof result
  const [proof, setProof] = useState(null);
  // state for error messages
  const [error, setError] = useState('');

  // function to fetch audit proof from backend
  const getProof = async () => {
    try {
      setError('');
      // send request to api route with block index
      const data = await apiClient.get(`/api/auditProof`, {
        params: { blockIndex: index }
      });
      setProof(data);
    } catch (err) {
      // handle and display errors
      console.error('Error fetching proof:', err);
      setError(`Failed to fetch proof: ${err.message}`);
      setProof(null);
    }
  };

  return (
    <div style={{ padding: '2rem' }}>
      <h1>Audit Proof</h1>
      <div style={{ marginBottom: '1rem' }}>
        {/* input for block index */}
        <input 
          placeholder="Block Index" 
          value={index} 
          onChange={e => setIndex(e.target.value)} 
          style={{ marginRight: '0.5rem' }}
        />
        {/* button to trigger proof fetch */}
        <button 
          onClick={getProof}
          style={{ background: '#2196F3', color: 'white', padding: '8px 16px' }}
        >
          Get Proof
        </button>
      </div>
      
      {/* display error message if any */}
      {error && (
        <div style={{ color: 'red', marginBottom: '1rem' }}>
          {error}
        </div>
      )}
      
      {/* display proof result if available */}
      {proof && (
        <pre style={{ 
          background: '#f5f5f5', 
          padding: '1rem', 
          borderRadius: '5px',
          overflowX: 'auto' 
        }}>
          {JSON.stringify(proof, null, 2)}
        </pre>
      )}
    </div>
  );
}