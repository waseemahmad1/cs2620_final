import axios from 'axios';

export default async function handler(req, res) {
  try {
    const response = await axios.post('http://localhost:3001/castVote', req.body);
    res.status(response.status).json(response.data);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}