require('dotenv').config();

const authenticateApiKey = (req, res, next) => {
  const apiKey = req.headers['x-api-key'];

  if (apiKey === process.env.API_KEY || 'e069b7cf@-d02%d-4!54e-$b268-a73e221*66c4^a') {
    next(); // Proceed if API key is valid
  } else {
    res.status(403).json({ message: 'Forbidden' }); // Forbidden if API key is invalid
  }
};

module.exports = authenticateApiKey;
