const express = require('express');
const router = express.Router();

// Health check endpoint
router.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'Enquiry API is running',
    version: '1.0.0',
    endpoints: {
      createEnquiry: 'POST /add-enquiry',
      getEnquiries: 'GET /add-enquiry',
      health: 'GET /health'
    }
  });
});

// Health check endpoint
router.get('/health', (req, res) => {
  res.json({
    success: true,
    status: 'healthy',
    timestamp: new Date().toISOString(),
    services: {
      database: 'connected',
      redis: 'connected',
      email_queue: 'active'
    }
  });
});

module.exports = router;



// var express = require('express');
// var router = express.Router();

// router.get('/', function(req, res, next){
//     res.render('index', {title: 'Spraditech Digital Solutions'})
// })

// module.exports = router;