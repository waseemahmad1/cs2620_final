import axios from 'axios';

export default async function handler(req, res) {
  try {
    console.log('Getting ledger for election:', req.query.electionId);
    const { electionId } = req.query;
    const response = await axios.get(`http://localhost:4850/getLedger`, {
      params: { electionId }
    });
    console.log('Ledger API response:', response.data);
    return res.status(response.status).json(response.data);
  } catch (err) {
    console.error('Error in getLedger API:', err);
    if (err.response) {
      console.error('Server response:', err.response.data);
      return res.status(err.response.status).json(err.response.data);
    }
    return res.status(500).json({ success: false, error: err.message });
  }
}
