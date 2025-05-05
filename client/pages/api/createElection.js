import axios from 'axios';

// api route handler for creating an election
export default async function handler(req, res) {
  try {
    console.log('Sending to server:', req.body);

    // send create election request to backend load balancer
    const response = await axios.post('http://localhost:4850/createElection', req.body);

    // return backend response to client
    return res.status(response.status).json(response.data);
  } catch (err) {
    
    // log error if request fails
    console.error('Error in createElection API:', err);
    if (err.response) {
      // forward error response from backend
      console.error('Server response:', err.response.data);
      return res.status(err.response.status).json(err.response.data);
    }

    return res.status(500).json({ success: false, error: err.message });
  }
}