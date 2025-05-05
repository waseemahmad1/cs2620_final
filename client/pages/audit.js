import { useState } from 'react';
import apiClient from '../utils/apiClient';

export default function Audit() {
  const [index, setIndex] = useState('');
  const [proof, setProof] = useState(null);
  const [error, setError] = useState('');

  const getProof = async () => {
    try {
      setError('');
      const data = await apiClient.get(`/api/auditProof`, {
        params: { blockIndex: index }
      });
      setProof(data);
    } catch (err) {
      console.error('Error fetching proof:', err);
      setError(`Failed to fetch proof: ${err.message}`);
      setProof(null);
    }
  };

  return (
    <div style={{ padding: '2rem' }}>
      <h1>Audit Proof</h1>
      <div style={{ marginBottom: '1rem' }}>
        <input 
          placeholder="Block Index" 
          value={index} 
          onChange={e => setIndex(e.target.value)} 
          style={{ marginRight: '0.5rem' }}
        />
        <button 
          onClick={getProof}
          style={{ background: '#2196F3', color: 'white', padding: '8px 16px' }}
        >
          Get Proof
        </button>
      </div>
      
      {error && (
        <div style={{ color: 'red', marginBottom: '1rem' }}>
          {error}
        </div>
      )}
      
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