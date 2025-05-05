import axios from 'axios';

export default async function handler(req, res) {
  try {
    const { electionId } = req.query;
    const response = await axios.get(`http://localhost:3001/getLedger`, {
      params: { electionId }
    });
    return res.status(response.status).json(response.data);
  } catch (err) {
    if (err.response) {
      // forward the real status + JSON from your Express server
      return res.status(err.response.status).json(err.response.data);
    }
    // something else went wrong (network, code bug, etc)
    return res.status(500).json({ success: false, error: err.message });
  }
}
