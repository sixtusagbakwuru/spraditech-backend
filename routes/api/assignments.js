const express = require('express');
const router = express.Router();
const assignmentController = require('../../controllers/assignmentController');
const { authenticate } = require('../../middleware/auth');

/**
 * @route   GET /api/assignments/:id
 * @desc    Get assignment details
 * @access  Private
 */
router.get('/:id', authenticate, assignmentController.getAssignment);

/**
 * @route   GET /api/assignments/:id/progress
 * @desc    Get user's progress on assignment
 * @access  Private
 */
router.get('/:id/progress', authenticate, assignmentController.getUserProgress);

/**
 * @route   POST /api/assignments/:id/start
 * @desc    Start working on assignment
 * @access  Private
 */
router.post('/:id/start', authenticate, assignmentController.startAssignment);

/**
 * @route   POST /api/assignments/:id/save
 * @desc    Save progress on assignment
 * @access  Private
 */
router.post('/:id/save', authenticate, assignmentController.saveProgress);

/**
 * @route   POST /api/assignments/:id/submit
 * @desc    Submit assignment
 * @access  Private
 */
router.post('/:id/submit', authenticate, assignmentController.submitAssignment);

/**
 * @route   GET /api/assignments/course/:courseId
 * @desc    Get all assignments for a course
 * @access  Private
 */
router.get('/course/:courseId', authenticate, assignmentController.getCourseAssignments);

module.exports = router;