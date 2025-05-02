import { useState } from 'react';
import axios from 'axios';

export default function Audit() {
  const [index, setIndex] = useState('');
  const [proof, setProof] = useState(null);

  const getProof = async () => {
    try {
      const res = await axios.get(`/api/auditProof?blockIndex=${index}`);
      setProof(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div style={{ padding: '2rem' }}>
      <h1>Audit Proof</h1>
      <input
        placeholder="Block Index"
        value={index}
        onChange={e => setIndex(e.target.value)}
      />
      <button onClick={getProof}>Get Proof</button>
      {proof && <pre>{JSON.stringify(proof, null, 2)}</pre>}
    </div>
  );
}
