const express = require('express');
const router = express.Router();
const { authenticate, authorize, optionalAuthenticate } = require('../../middleware/auth');

// Protected route - any authenticated user
router.get('/profile', authenticate, (req, res) => {
  res.json({
    success: true,
    data: req.user,
    message: 'Protected profile accessed'
  });
});

// Admin only route
router.get('/admin', 
  authenticate, 
  authorize('admin', 'superadmin'), 
  (req, res) => {
    res.json({
      success: true,
      message: 'Admin area accessed',
      user: req.user
    });
  }
);

// Optional authentication - works with or without token
router.get('/public-with-user', optionalAuthenticate, (req, res) => {
  res.json({
    success: true,
    message: req.user ? 'Authenticated user' : 'Public access',
    user: req.user
  });
});

// Student only route
router.get('/student-dashboard',
  authenticate,
  authorize('student', 'admin', 'superadmin'),
  (req, res) => {
    res.json({
      success: true,
      message: 'Student dashboard accessed',
      user: req.user
    });
  }
);

module.exports = router;