const express = require('express');
const router = express.Router();
const dashboardController = require('../../controllers/dashboardController');
const { authenticate } = require('../../middleware/auth');

/**
 * @route   GET /api/dashboard/overview
 * @desc    Get dashboard overview data for authenticated user
 * @access  Private
 */
router.get('/overview', authenticate, dashboardController.getDashboardOverview);

/**
 * @route   GET /api/dashboard/upcoming-lessons/all
 * @desc    Get all upcoming lessons (for View All page)
 * @access  Private
 */
router.get('/upcoming-lessons/all', authenticate, dashboardController.getAllUpcomingLessons);

/**
 * @route   GET /api/dashboard/assignments/all
 * @desc    Get all unsubmitted assignments (for View All page)
 * @access  Private
 */
router.get('/assignments/all', authenticate, dashboardController.getAllUnsubmittedAssignments);

module.exports = router;


// const express = require('express');
// const router = express.Router();
// const dashboardController = require('../../controllers/dashboardController');
// const { authenticate } = require('../../middleware/auth');

// /**
//  * @route   GET /api/dashboard/overview
//  * @desc    Get dashboard overview data for authenticated user
//  * @access  Private
//  */
// router.get('/overview', authenticate, dashboardController.getDashboardOverview);

// module.exports = router;