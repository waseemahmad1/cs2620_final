import axios from 'axios';

export default async function handler(req, res) {
  try {
    console.log('Sending to server:', req.body);
    const response = await axios.post('http://localhost:4850/createElection', req.body);
    return res.status(response.status).json(response.data);
  } catch (err) {
    console.error('Error in createElection API:', err);
    if (err.response) {
      console.error('Server response:', err.response.data);
      return res.status(err.response.status).json(err.response.data);
    }
    return res.status(500).json({ success: false, error: err.message });
  }
}