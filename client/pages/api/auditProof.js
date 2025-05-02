import axios from 'axios';

export default async function handler(req, res) {
  try {
    const { blockIndex } = req.query;
    const response = await axios.get(
      `http://localhost:3001/auditProof?blockIndex=${blockIndex}`
    );
    res.status(response.status).json(response.data);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}
