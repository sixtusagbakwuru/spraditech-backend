const { supabase } = require('../config/supabaseClient');

class LessonController {
  /**
   * Get lesson data by progress ID
   */
  async getLessonByProgress(req, res) {
    try {
      const { progressId, userId } = req.body;

      console.log('Fetching lesson data for progress ID:', progressId, 'user ID:', userId);

      // Validate required fields
      if (!progressId || !userId) {
        return res.status(400).json({
          success: false,
          error: 'Missing progressId or userId'
        });
      }

      // First, get the user progress record
      const { data: userProgress, error: progressError } = await supabase
        .from('user_lesson_progress')
        .select('*')
        .eq('id', progressId)
        .eq('user_id', userId)
        .maybeSingle();

      if (progressError) {
        console.error('Error fetching progress record:', progressError);
        return res.status(500).json({
          success: false,
          error: 'Database error while fetching progress'
        });
      }

      if (!userProgress) {
        console.error('Progress record not found for ID:', progressId);
        return res.status(404).json({
          success: false,
          error: 'Progress record not found'
        });
      }

      // Then, fetch the lesson using the lesson_id from the progress record
      const { data: lesson, error: lessonError } = await supabase
        .from('lessons')
        .select(`
          *,
          courses (*)
        `)
        .eq('id', userProgress.lesson_id)
        .maybeSingle();

      if (lessonError) {
        console.error('Error fetching lesson:', lessonError);
        return res.status(500).json({
          success: false,
          error: 'Database error while fetching lesson'
        });
      }

      if (!lesson) {
        console.error('Lesson not found for ID:', userProgress.lesson_id);
        return res.status(404).json({
          success: false,
          error: 'Lesson not found'
        });
      }

      // Get navigation data (previous/next lessons in the same course)
      const { data: courseLessons, error: navigationError } = await supabase
        .from('user_lesson_progress')
        .select(`
          id,
          lesson_id,
          lessons:lesson_id (
            title,
            order_index
          )
        `)
        .eq('user_id', userId)
        .eq('course_id', userProgress.course_id)
        .order('created_at', { ascending: true });

      let navigation = { previousLesson: null, nextLesson: null };

      if (!navigationError && courseLessons && courseLessons.length > 0) {
        const currentIndex = courseLessons.findIndex(progress => progress.id === progressId);
        
        if (currentIndex > 0) {
          navigation.previousLesson = {
            id: courseLessons[currentIndex - 1].id,
            title: courseLessons[currentIndex - 1].lessons?.title || 'Previous Lesson'
          };
        }
        
        if (currentIndex < courseLessons.length - 1) {
          navigation.nextLesson = {
            id: courseLessons[currentIndex + 1].id,
            title: courseLessons[currentIndex + 1].lessons?.title || 'Next Lesson'
          };
        }
      }

      // Return success response
      return res.status(200).json({
        success: true,
        data: {
          lesson,
          userProgress,
          navigation
        }
      });

    } catch (error) {
      console.error('❌ Lesson controller error:', error);
      return res.status(500).json({
        success: false,
        error: 'Internal server error',
        details: error.message,
        ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
      });
    }
  }

  /**
   * Alternative: Get lesson by progress ID via URL parameter (GET request)
   * This might be more RESTful
   */
  async getLessonByProgressId(req, res) {
    try {
      const { progressId } = req.params;
      const userId = req.user?.id || req.query.userId; // Get from auth middleware or query

      console.log('Fetching lesson data for progress ID:', progressId, 'user ID:', userId);

      if (!progressId) {
        return res.status(400).json({
          success: false,
          error: 'Missing progressId'
        });
      }

      if (!userId) {
        return res.status(401).json({
          success: false,
          error: 'User not authenticated'
        });
      }

      // First, get the user progress record
      const { data: userProgress, error: progressError } = await supabase
        .from('user_lesson_progress')
        .select('*')
        .eq('id', progressId)
        .eq('user_id', userId)
        .maybeSingle();

      if (progressError) {
        console.error('Error fetching progress record:', progressError);
        return res.status(500).json({
          success: false,
          error: 'Database error while fetching progress'
        });
      }

      if (!userProgress) {
        return res.status(404).json({
          success: false,
          error: 'Progress record not found'
        });
      }

      // Then, fetch the lesson using the lesson_id from the progress record
      const { data: lesson, error: lessonError } = await supabase
        .from('lessons')
        .select(`
          *,
          courses (*)
        `)
        .eq('id', userProgress.lesson_id)
        .maybeSingle();

      if (lessonError) {
        console.error('Error fetching lesson:', lessonError);
        return res.status(500).json({
          success: false,
          error: 'Database error while fetching lesson'
        });
      }

      if (!lesson) {
        return res.status(404).json({
          success: false,
          error: 'Lesson not found'
        });
      }

      // Get navigation data
      const { data: courseLessons, error: navigationError } = await supabase
        .from('user_lesson_progress')
        .select(`
          id,
          lesson_id,
          lessons:lesson_id (
            title,
            order_index
          )
        `)
        .eq('user_id', userId)
        .eq('course_id', userProgress.course_id)
        .order('created_at', { ascending: true });

      let navigation = { previousLesson: null, nextLesson: null };

      if (!navigationError && courseLessons && courseLessons.length > 0) {
        const currentIndex = courseLessons.findIndex(progress => progress.id === progressId);
        
        if (currentIndex > 0) {
          navigation.previousLesson = {
            id: courseLessons[currentIndex - 1].id,
            title: courseLessons[currentIndex - 1].lessons?.title || 'Previous Lesson'
          };
        }
        
        if (currentIndex < courseLessons.length - 1) {
          navigation.nextLesson = {
            id: courseLessons[currentIndex + 1].id,
            title: courseLessons[currentIndex + 1].lessons?.title || 'Next Lesson'
          };
        }
      }

      return res.status(200).json({
        success: true,
        data: {
          lesson,
          userProgress,
          navigation
        }
      });

    } catch (error) {
      console.error('❌ Lesson controller error:', error);
      return res.status(500).json({
        success: false,
        error: 'Internal server error',
        details: error.message
      });
    }
  }
}

module.exports = new LessonController();