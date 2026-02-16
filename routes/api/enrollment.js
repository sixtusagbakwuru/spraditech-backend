const express = require('express');
const router = express.Router();
const enrollmentController = require('../../controllers/enrollmentController');

/**
 * @route   POST /api/enrollment
 * @desc    Create a new enrollment
 * @access  Public
 */
router.post('/', enrollmentController.createEnrollment);

/**
 * @route   POST /api/enrollment/login
 * @desc    Login user
 * @access  Public
 */
router.post('/login', enrollmentController.login);

/**
 * @route   GET /api/enrollment/:id
 * @desc    Get enrollment by ID
 * @access  Private/Admin
 */
router.get('/:id', enrollmentController.getEnrollment);

/**
 * @route   GET /api/enrollment/user/:userId
 * @desc    Get all enrollments for a user
 * @access  Private/Admin
 */
router.get('/user/:userId', enrollmentController.getUserEnrollments);

/**
 * @route   PATCH /api/enrollment/:id/status
 * @desc    Update enrollment status
 * @access  Private/Admin
 */
router.patch('/:id/status', enrollmentController.updateEnrollmentStatus);

/**
 * @route   POST /api/enrollment/verify-payment
 * @desc    Handle payment verification callback
 * @access  Public (webhook)
 */
router.post('/verify-payment', enrollmentController.handlePaymentVerification);

module.exports = router;


// const express = require('express');
// const router = express.Router();
// const enrollmentController = require('../../controllers/enrollmentController');

// /**
//  * @route   POST /api/enrollment
//  * @desc    Create a new enrollment
//  * @access  Public
//  */
// router.post('/', enrollmentController.createEnrollment);

// /**
//  * @route   GET /api/enrollment/:id
//  * @desc    Get enrollment by ID
//  * @access  Private/Admin
//  */
// router.get('/:id', enrollmentController.getEnrollment);

// /**
//  * @route   GET /api/enrollment/user/:userId
//  * @desc    Get all enrollments for a user
//  * @access  Private/Admin
//  */
// router.get('/user/:userId', enrollmentController.getUserEnrollments);

// /**
//  * @route   PATCH /api/enrollment/:id/status
//  * @desc    Update enrollment status
//  * @access  Private/Admin
//  */
// router.patch('/:id/status', enrollmentController.updateEnrollmentStatus);

// /**
//  * @route   POST /api/enrollment/verify-payment
//  * @desc    Handle payment verification callback
//  * @access  Public (webhook)
//  */
// router.post('/verify-payment', enrollmentController.handlePaymentVerification);

// module.exports = router;



// const express = require('express');
// const router = express.Router();
// const enrollmentController = require('../../controllers/enrollmentController');

// /**
//  * @route   POST /api/enrollment
//  * @desc    Create a new enrollment
//  * @access  Public
//  */
// router.post('/', enrollmentController.createEnrollment);

// /**
//  * @route   GET /api/enrollment/:id
//  * @desc    Get enrollment by ID
//  * @access  Private/Admin
//  */
// router.get('/:id', enrollmentController.getEnrollment);

// /**
//  * @route   GET /api/enrollment/user/:userId
//  * @desc    Get all enrollments for a user
//  * @access  Private/Admin
//  */
// router.get('/user/:userId', enrollmentController.getUserEnrollments);

// /**
//  * @route   PATCH /api/enrollment/:id/status
//  * @desc    Update enrollment status
//  * @access  Private/Admin
//  */
// router.patch('/:id/status', enrollmentController.updateEnrollmentStatus);

// /**
//  * @route   POST /api/enrollment/verify-payment
//  * @desc    Handle payment verification callback
//  * @access  Public (webhook)
//  */
// router.post('/verify-payment', enrollmentController.handlePaymentVerification);

// module.exports = router;