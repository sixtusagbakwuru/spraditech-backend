const express = require('express');
const router = express.Router();
const forgotPasswordController = require('../../controllers/forgotPasswordController');

/**
 * @route   POST /api/forgot-password/request
 * @desc    Request password reset email
 * @access  Public
 */
router.post('/request', forgotPasswordController.requestReset);

/**
 * @route   GET /api/forgot-password/verify/:token
 * @desc    Verify reset token
 * @access  Public
 */
router.get('/verify/:token', forgotPasswordController.verifyToken);

/**
 * @route   POST /api/forgot-password/reset
 * @desc    Reset password with token
 * @access  Public
 */
router.post('/reset', forgotPasswordController.resetPassword);

module.exports = router;