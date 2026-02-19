const express = require('express');
const router = express.Router();
const lessonController = require('../../controllers/lessonController');
const { authenticate } = require('../../middleware/auth');

/**
 * @route   POST /api/lessons/progress
 * @desc    Get lesson data by progress ID (POST with body)
 * @access  Private
 */
router.post('/progress', authenticate, lessonController.getLessonByProgress);

/**
 * @route   GET /api/lessons/progress/:progressId
 * @desc    Get lesson data by progress ID (GET with params)
 * @access  Private
 */
router.get('/progress/:progressId', authenticate, lessonController.getLessonByProgressId);

/**
 * @route   POST /api/lessons/progress/update
 * @desc    Update lesson progress
 * @access  Private
 */
router.post('/progress/update', authenticate, lessonController.updateLessonProgress);

module.exports = router;