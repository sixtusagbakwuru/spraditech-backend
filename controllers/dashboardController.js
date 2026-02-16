const { supabase } = require('../config/supabaseClient');

class DashboardController {
  /**
   * Get dashboard overview data for the authenticated user
   */
  async getDashboardOverview(req, res) {
    try {
      const userId = req.user.id; // From auth middleware

      console.log('📊 Fetching dashboard overview for user:', userId);

      // PARALLEL REQUESTS - Execute all database calls simultaneously
      const [
        userDataResult,
        enrollmentsResult,
        lessonProgressResult,
        userAssignmentsResult,
        upcomingLessonsResult,
        allAssignmentsResult
      ] = await Promise.allSettled([
        // 1. Fetch user data
        supabase
          .from('users')
          .select('*')
          .eq('id', userId)
          .single(),

        // 2. Fetch enrollments with course details
        supabase
          .from('enrollments')
          .select(`
            *,
            courses (*)
          `)
          .eq('user_id', userId)
          .not('course_id', 'is', null),

        // 3. Fetch user lesson progress
        supabase
          .from('user_lesson_progress')
          .select(`
            *,
            lessons (title, lesson_type, duration, content_url),
            courses (name)
          `)
          .eq('user_id', userId),

        // 4. Fetch user assignments
        supabase
          .from('user_assignments')
          .select(`
            *,
            assignments (*),
            courses (name)
          `)
          .eq('user_id', userId),

        // 5. Fetch upcoming lessons (including past if not completed) - limited to 10 for overview
        (async () => {
          return await supabase
            .from('user_lesson_progress')
            .select(`
              *,
              lessons (title, lesson_type, duration, content_url),
              courses (name)
            `)
            .eq('user_id', userId)
            .eq('completed', false)
            .order('scheduled_date', { ascending: true, nullsLast: true })
            .limit(10);
        })(),

        // 6. Fetch all unsubmitted assignments for counting (for View All functionality)
        (async () => {
          return await supabase
            .from('user_assignments')
            .select(`
              *,
              assignments (*),
              courses (name)
            `)
            .eq('user_id', userId)
            .not('status', 'in', '("submitted","graded")')
            .order('due_date', { ascending: true, nullsLast: true });
        })()
      ]);

      // Handle results with proper error checking
      if (userDataResult.status === 'rejected') {
        throw userDataResult.reason;
      }
      
      const { data: userData, error: userDataError } = userDataResult.value;
      if (userDataError) throw userDataError;

      // Handle enrollments (can be empty but not error)
      const enrollments = enrollmentsResult.status === 'fulfilled' 
        ? enrollmentsResult.value.data || [] 
        : [];
      
      const enrollmentsError = enrollmentsResult.status === 'fulfilled' 
        ? enrollmentsResult.value.error 
        : null;
      
      if (enrollmentsError) console.warn("⚠️ Enrollments warning:", enrollmentsError);

      // Handle lesson progress
      if (lessonProgressResult.status === 'rejected') {
        throw lessonProgressResult.reason;
      }
      
      const { data: lessonProgress, error: progressError } = lessonProgressResult.value;
      if (progressError) throw progressError;

      // Handle user assignments
      if (userAssignmentsResult.status === 'rejected') {
        throw userAssignmentsResult.reason;
      }
      
      const { data: userAssignments, error: assignmentsError } = userAssignmentsResult.value;
      if (assignmentsError) throw assignmentsError;

      // Handle upcoming lessons (including past if not completed) - for overview display
      const upcomingLessonsData = upcomingLessonsResult.status === 'fulfilled' 
        ? upcomingLessonsResult.value.data || [] 
        : [];
      
      // Handle all unsubmitted assignments (for View All)
      const allUnsubmittedAssignments = allAssignmentsResult.status === 'fulfilled'
        ? allAssignmentsResult.value.data || []
        : [];

      const upcomingLessonsError = upcomingLessonsResult.status === 'fulfilled' 
        ? upcomingLessonsResult.value.error 
        : null;
      
      if (upcomingLessonsError) console.warn("⚠️ Upcoming lessons warning:", upcomingLessonsError);

      // Get valid course IDs safely
      const validCourseIds = (enrollments || [])
        .filter(enrollment => enrollment?.course_id !== null && enrollment?.course_id !== undefined)
        .map(enrollment => enrollment.course_id);

      console.log(`📊 Found ${validCourseIds.length} valid course IDs`);

      // Calculate dashboard statistics with safe defaults
      const totalCourses = enrollments?.length || 0;
      
      // Change from Hours Studied to Lessons Completed
      const totalCompletedLessons = lessonProgress?.filter(progress => progress?.completed === true).length || 0;

      const completedAssignments = userAssignments?.filter(
        assignment => assignment?.status === "submitted" || assignment?.status === "graded"
      ).length || 0;

      const totalAssignments = userAssignments?.length || 0;

      // Calculate overall progress safely
      const totalUserLessons = lessonProgress?.length || 0;
      const overallProgress = totalUserLessons > 0 
        ? Math.round((totalCompletedLessons / totalUserLessons) * 100) 
        : 0;

      // 🗓 FORMAT UPCOMING CLASSES with null safety - NOW INCLUDES PAST IF NOT COMPLETED
      const upcomingClasses = (upcomingLessonsData || []).map((userProgress) => {
        const lesson = userProgress?.lessons || {};
        const course = userProgress?.courses || {};
        
        const courseName = course?.name || "Unknown Course";
        const instructor = userProgress?.instructor || "Unknown Instructor";
        const lessonTitle = lesson?.title || "Untitled Lesson";
        const lessonType = lesson?.lesson_type || "video";

        // Handle scheduled date safely
        let displayDate = "Scheduled soon";
        let displayTime = "Flexible";
        let actualDate = null;
        let isPastDue = false;

        if (userProgress?.scheduled_date) {
          try {
            const scheduledDate = new Date(userProgress.scheduled_date);
            if (!isNaN(scheduledDate.getTime())) {
              actualDate = scheduledDate.toISOString();
              
              const today = new Date();
              const tomorrow = new Date(today);
              tomorrow.setDate(tomorrow.getDate() + 1);

              // Check if the lesson is past due
              if (scheduledDate < today) {
                isPastDue = true;
                displayDate = "Past due";
              } else if (scheduledDate.toDateString() === today.toDateString()) {
                displayDate = "Today";
              } else if (scheduledDate.toDateString() === tomorrow.toDateString()) {
                displayDate = "Tomorrow";
              } else {
                displayDate = scheduledDate.toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric"
                });
              }

              displayTime = scheduledDate.toLocaleTimeString("en-US", {
                hour: 'numeric',
                minute: '2-digit',
                hour12: true
              });
            }
          } catch (dateError) {
            console.warn("⚠️ Invalid date format:", userProgress.scheduled_date);
          }
        }

        const lessonUrl = userProgress?.lesson_url || lesson?.content_url || null;

        return {
          id: userProgress?.id,
          lessonId: userProgress?.lesson_id,
          course: courseName,
          topic: lessonTitle,
          time: displayTime,
          date: displayDate,
          type: lessonType === "live" ? "live" : "video",
          instructor: instructor,
          lessonUrl: lessonUrl,
          actualDate: actualDate,
          isPastDue: isPastDue
        };
      });

      // Sort upcoming classes: past due first, then by scheduled date
      upcomingClasses.sort((a, b) => {
        if (a.isPastDue && !b.isPastDue) return -1;
        if (!a.isPastDue && b.isPastDue) return 1;
        if (a.actualDate && b.actualDate) {
          return new Date(a.actualDate).getTime() - new Date(b.actualDate).getTime();
        }
        if (a.actualDate) return -1;
        if (b.actualDate) return 1;
        return 0;
      });

      // 📝 FORMAT RECENT ASSIGNMENTS - ONLY UNSUBMITTED, limited to 10 for overview
      const unsubmittedAssignments = (userAssignments || [])
        .filter(userAssignment => 
          userAssignment?.status !== "submitted" && 
          userAssignment?.status !== "graded"
        )
        .map((userAssignment) => {
          const assignment = userAssignment?.assignments || {};
          const course = userAssignment?.courses || {};
          
          const assignmentTitle = assignment?.title || "Unknown Assignment";
          const courseName = course?.name || "Unknown Course";
          
          let dueDateDisplay = "No due date";
          let actualDueDate = null;
          let isPastDue = false;

          if (userAssignment?.due_date) {
            try {
              const dueDate = new Date(userAssignment.due_date);
              if (!isNaN(dueDate.getTime())) {
                actualDueDate = dueDate.toISOString();
                
                const today = new Date();
                const tomorrow = new Date(today);
                tomorrow.setDate(tomorrow.getDate() + 1);

                // Check if assignment is past due
                if (dueDate < today) {
                  isPastDue = true;
                  dueDateDisplay = "Past due";
                } else if (dueDate.toDateString() === today.toDateString()) {
                  dueDateDisplay = "Today";
                } else if (dueDate.toDateString() === tomorrow.toDateString()) {
                  dueDateDisplay = "Tomorrow";
                } else {
                  dueDateDisplay = dueDate.toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric"
                  });
                }
              }
            } catch (dateError) {
              console.warn("⚠️ Invalid due date format:", userAssignment.due_date);
            }
          }

          // Calculate progress based on assignment status
          let progress = 0;
          const status = userAssignment?.status || "not-started";
          
          if (status === "in-progress") {
            progress = 50;
          }

          return {
            id: userAssignment?.id || `temp-${Math.random()}`,
            title: assignmentTitle,
            course: courseName,
            dueDate: dueDateDisplay,
            status: status,
            progress: progress,
            actualDueDate: actualDueDate,
            isPastDue: isPastDue
          };
        });

      // Sort unsubmitted assignments: past due first, then by due date
      unsubmittedAssignments.sort((a, b) => {
        if (a.isPastDue && !b.isPastDue) return -1;
        if (!a.isPastDue && b.isPastDue) return 1;
        if (a.actualDueDate && b.actualDueDate) {
          return new Date(a.actualDueDate).getTime() - new Date(b.actualDueDate).getTime();
        }
        if (a.actualDueDate) return -1;
        if (b.actualDueDate) return 1;
        return 0;
      });

      // Take only the 10 most urgent assignments for overview
      const displayAssignments = unsubmittedAssignments.slice(0, 10);

      // Format all unsubmitted assignments for View All functionality
      const allUnsubmittedAssignmentsFormatted = (allUnsubmittedAssignments || [])
        .filter(userAssignment => 
          userAssignment?.status !== "submitted" && 
          userAssignment?.status !== "graded"
        )
        .map((userAssignment) => {
          const assignment = userAssignment?.assignments || {};
          const course = userAssignment?.courses || {};
          
          const assignmentTitle = assignment?.title || "Unknown Assignment";
          const courseName = course?.name || "Unknown Course";
          
          let dueDateDisplay = "No due date";
          let actualDueDate = null;
          let isPastDue = false;

          if (userAssignment?.due_date) {
            try {
              const dueDate = new Date(userAssignment.due_date);
              if (!isNaN(dueDate.getTime())) {
                actualDueDate = dueDate.toISOString();
                
                const today = new Date();

                if (dueDate < today) {
                  isPastDue = true;
                  dueDateDisplay = "Past due";
                } else {
                  dueDateDisplay = dueDate.toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric"
                  });
                }
              }
            } catch (dateError) {
              console.warn("⚠️ Invalid due date format:", userAssignment.due_date);
            }
          }

          let progress = 0;
          const status = userAssignment?.status || "not-started";
          
          if (status === "in-progress") {
            progress = 50;
          }

          return {
            id: userAssignment?.id || `temp-${Math.random()}`,
            title: assignmentTitle,
            course: courseName,
            dueDate: dueDateDisplay,
            status: status,
            progress: progress,
            actualDueDate: actualDueDate,
            isPastDue: isPastDue
          };
        });

      // Sort all unsubmitted assignments
      allUnsubmittedAssignmentsFormatted.sort((a, b) => {
        if (a.isPastDue && !b.isPastDue) return -1;
        if (!a.isPastDue && b.isPastDue) return 1;
        if (a.actualDueDate && b.actualDueDate) {
          return new Date(a.actualDueDate).getTime() - new Date(b.actualDueDate).getTime();
        }
        if (a.actualDueDate) return -1;
        if (b.actualDueDate) return 1;
        return 0;
      });

      // 📊 FORMAT COURSE PROGRESS with null safety
      const courseProgress = (enrollments || []).map((enrollment) => {
        const courseId = enrollment?.course_id;
        
        if (!courseId) {
          return {
            courseName: "Unknown Course",
            progress: 0
          };
        }

        const courseLessons = (lessonProgress || []).filter(
          progress => progress?.course_id === courseId
        );
        
        const completedCourseLessons = courseLessons.filter(
          progress => progress?.completed === true
        ).length;
        
        const progressPercent = courseLessons.length > 0 
          ? Math.round((completedCourseLessons / courseLessons.length) * 100) 
          : 0;

        return {
          courseName: enrollment?.courses?.name || enrollment?.course_name || "Unknown Course",
          progress: progressPercent
        };
      });

      const responseData = {
        user: {
          firstName: userData?.first_name || "User",
          lastName: userData?.last_name || "",
          email: userData?.email || userData?.email || userId
        },
        stats: {
          coursesEnrolled: totalCourses,
          lessonsCompleted: totalCompletedLessons, // Changed from hoursStudied to lessonsCompleted
          assignmentsDone: `${completedAssignments}/${totalAssignments}`,
          overallProgress: overallProgress
        },
        upcomingClasses, // Now includes past if not completed, limited to 10
        recentAssignments: displayAssignments, // Only unsubmitted, limited to 10
        allAssignments: allUnsubmittedAssignmentsFormatted, // All unsubmitted for View All
        courseProgress
      };

      console.log("✅ Successfully processed dashboard data");
      console.log(`📊 Stats: ${totalCourses} courses, ${totalCompletedLessons} lessons completed, ${overallProgress}% progress`);
      console.log(`🗓 Upcoming (including past due): ${upcomingClasses.length} lessons`);
      console.log(`📝 Unsubmitted assignments: ${unsubmittedAssignments.length} total, showing ${displayAssignments.length}`);

      return res.status(200).json({
        success: true,
        data: responseData,
        message: 'Dashboard overview fetched successfully'
      });

    } catch (error) {
      console.error('❌ Dashboard overview error:', error);
      return res.status(500).json({
        success: false,
        error: error.message || 'Failed to fetch dashboard overview',
        ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
      });
    }
  }

  /**
   * Get all upcoming lessons (for View All page)
   */
  async getAllUpcomingLessons(req, res) {
    try {
      const userId = req.user.id;

      const { data: upcomingLessons, error } = await supabase
        .from('user_lesson_progress')
        .select(`
          *,
          lessons (title, lesson_type, duration, content_url),
          courses (name)
        `)
        .eq('user_id', userId)
        .eq('completed', false)
        .order('scheduled_date', { ascending: true, nullsLast: true });

      if (error) {
        throw error;
      }

      // Format the lessons
      const formattedLessons = (upcomingLessons || []).map((userProgress) => {
        const lesson = userProgress?.lessons || {};
        const course = userProgress?.courses || {};
        
        const courseName = course?.name || "Unknown Course";
        const instructor = userProgress?.instructor || "Unknown Instructor";
        const lessonTitle = lesson?.title || "Untitled Lesson";
        const lessonType = lesson?.lesson_type || "video";

        let displayDate = "Scheduled soon";
        let displayTime = "Flexible";
        let actualDate = null;
        let isPastDue = false;

        if (userProgress?.scheduled_date) {
          try {
            const scheduledDate = new Date(userProgress.scheduled_date);
            if (!isNaN(scheduledDate.getTime())) {
              actualDate = scheduledDate.toISOString();
              
              const today = new Date();

              if (scheduledDate < today) {
                isPastDue = true;
                displayDate = "Past due";
              } else {
                displayDate = scheduledDate.toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric"
                });
              }

              displayTime = scheduledDate.toLocaleTimeString("en-US", {
                hour: 'numeric',
                minute: '2-digit',
                hour12: true
              });
            }
          } catch (dateError) {
            console.warn("⚠️ Invalid date format:", userProgress.scheduled_date);
          }
        }

        const lessonUrl = userProgress?.lesson_url || lesson?.content_url || null;

        return {
          id: userProgress?.id,
          lessonId: userProgress?.lesson_id,
          course: courseName,
          topic: lessonTitle,
          time: displayTime,
          date: displayDate,
          type: lessonType === "live" ? "live" : "video",
          instructor: instructor,
          lessonUrl: lessonUrl,
          actualDate: actualDate,
          isPastDue: isPastDue
        };
      });

      // Sort: past due first, then by date
      formattedLessons.sort((a, b) => {
        if (a.isPastDue && !b.isPastDue) return -1;
        if (!a.isPastDue && b.isPastDue) return 1;
        if (a.actualDate && b.actualDate) {
          return new Date(a.actualDate).getTime() - new Date(b.actualDate).getTime();
        }
        return 0;
      });

      return res.status(200).json({
        success: true,
        data: formattedLessons,
        message: 'All upcoming lessons fetched successfully'
      });

    } catch (error) {
      console.error('❌ Get all upcoming lessons error:', error);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * Get all unsubmitted assignments (for View All page)
   */
  async getAllUnsubmittedAssignments(req, res) {
    try {
      const userId = req.user.id;

      const { data: assignments, error } = await supabase
        .from('user_assignments')
        .select(`
          *,
          assignments (*),
          courses (name)
        `)
        .eq('user_id', userId)
        .not('status', 'in', '("submitted","graded")')
        .order('due_date', { ascending: true, nullsLast: true });

      if (error) {
        throw error;
      }

      // Format the assignments
      const formattedAssignments = (assignments || []).map((userAssignment) => {
        const assignment = userAssignment?.assignments || {};
        const course = userAssignment?.courses || {};
        
        const assignmentTitle = assignment?.title || "Unknown Assignment";
        const courseName = course?.name || "Unknown Course";
        
        let dueDateDisplay = "No due date";
        let actualDueDate = null;
        let isPastDue = false;

        if (userAssignment?.due_date) {
          try {
            const dueDate = new Date(userAssignment.due_date);
            if (!isNaN(dueDate.getTime())) {
              actualDueDate = dueDate.toISOString();
              
              const today = new Date();

              if (dueDate < today) {
                isPastDue = true;
                dueDateDisplay = "Past due";
              } else {
                dueDateDisplay = dueDate.toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric"
                });
              }
            }
          } catch (dateError) {
            console.warn("⚠️ Invalid due date format:", userAssignment.due_date);
          }
        }

        let progress = 0;
        const status = userAssignment?.status || "not-started";
        
        if (status === "in-progress") {
          progress = 50;
        }

        return {
          id: userAssignment?.id,
          title: assignmentTitle,
          course: courseName,
          dueDate: dueDateDisplay,
          status: status,
          progress: progress,
          actualDueDate: actualDueDate,
          isPastDue: isPastDue
        };
      });

      // Sort: past due first, then by due date
      formattedAssignments.sort((a, b) => {
        if (a.isPastDue && !b.isPastDue) return -1;
        if (!a.isPastDue && b.isPastDue) return 1;
        if (a.actualDueDate && b.actualDueDate) {
          return new Date(a.actualDueDate).getTime() - new Date(b.actualDueDate).getTime();
        }
        return 0;
      });

      return res.status(200).json({
        success: true,
        data: formattedAssignments,
        message: 'All unsubmitted assignments fetched successfully'
      });

    } catch (error) {
      console.error('❌ Get all assignments error:', error);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
}

module.exports = new DashboardController();


// const { supabase } = require('../config/supabaseClient');

// class DashboardController {
//   /**
//    * Get dashboard overview data for the authenticated user
//    */
//   async getDashboardOverview(req, res) {
//     try {
//       const userId = req.user.id; // From auth middleware

//       console.log('📊 Fetching dashboard overview for user:', userId);

//       // PARALLEL REQUESTS - Execute all database calls simultaneously
//       const [
//         userDataResult,
//         enrollmentsResult,
//         lessonProgressResult,
//         userAssignmentsResult,
//         upcomingLessonsResult
//       ] = await Promise.allSettled([
//         // 1. Fetch user data
//         supabase
//           .from('users')
//           .select('*')
//           .eq('id', userId)
//           .single(),

//         // 2. Fetch enrollments with course details
//         supabase
//           .from('enrollments')
//           .select(`
//             *,
//             courses (*)
//           `)
//           .eq('user_id', userId)
//           .not('course_id', 'is', null),

//         // 3. Fetch user lesson progress
//         supabase
//           .from('user_lesson_progress')
//           .select(`
//             *,
//             lessons (title, lesson_type, duration, content_url),
//             courses (name)
//           `)
//           .eq('user_id', userId),

//         // 4. Fetch user assignments
//         supabase
//           .from('user_assignments')
//           .select(`
//             *,
//             assignments (*),
//             courses (name)
//           `)
//           .eq('user_id', userId),

//         // 5. Fetch upcoming lessons
//         (async () => {
//           const today = new Date();
//           const oneWeekFromNow = new Date(today);
//           oneWeekFromNow.setDate(oneWeekFromNow.getDate() + 7);

//           return await supabase
//             .from('user_lesson_progress')
//             .select(`
//               *,
//               lessons (title, lesson_type, duration, content_url),
//               courses (name)
//             `)
//             .eq('user_id', userId)
//             .eq('completed', false)
//             .not('scheduled_date', 'is', null)
//             .gte('scheduled_date', today.toISOString())
//             .lte('scheduled_date', oneWeekFromNow.toISOString())
//             .order('scheduled_date', { ascending: true })
//             .limit(50);
//         })()
//       ]);

//       // Handle results with proper error checking
//       if (userDataResult.status === 'rejected') {
//         throw userDataResult.reason;
//       }
      
//       const { data: userData, error: userDataError } = userDataResult.value;
//       if (userDataError) throw userDataError;

//       // Handle enrollments (can be empty but not error)
//       const enrollments = enrollmentsResult.status === 'fulfilled' 
//         ? enrollmentsResult.value.data || [] 
//         : [];
      
//       const enrollmentsError = enrollmentsResult.status === 'fulfilled' 
//         ? enrollmentsResult.value.error 
//         : null;
      
//       if (enrollmentsError) console.warn("⚠️ Enrollments warning:", enrollmentsError);

//       // Handle lesson progress
//       if (lessonProgressResult.status === 'rejected') {
//         throw lessonProgressResult.reason;
//       }
      
//       const { data: lessonProgress, error: progressError } = lessonProgressResult.value;
//       if (progressError) throw progressError;

//       // Handle user assignments
//       if (userAssignmentsResult.status === 'rejected') {
//         throw userAssignmentsResult.reason;
//       }
      
//       const { data: userAssignments, error: assignmentsError } = userAssignmentsResult.value;
//       if (assignmentsError) throw assignmentsError;

//       // Handle upcoming lessons (can be empty but not error)
//       const upcomingLessons = upcomingLessonsResult.status === 'fulfilled' 
//         ? upcomingLessonsResult.value.data || [] 
//         : [];
      
//       const upcomingLessonsError = upcomingLessonsResult.status === 'fulfilled' 
//         ? upcomingLessonsResult.value.error 
//         : null;
      
//       if (upcomingLessonsError) console.warn("⚠️ Upcoming lessons warning:", upcomingLessonsError);

//       // Get valid course IDs safely
//       const validCourseIds = (enrollments || [])
//         .filter(enrollment => enrollment?.course_id !== null && enrollment?.course_id !== undefined)
//         .map(enrollment => enrollment.course_id);

//       console.log(`📊 Found ${validCourseIds.length} valid course IDs`);

//       // Calculate dashboard statistics with safe defaults
//       const totalCourses = enrollments?.length || 0;
      
//       const totalHoursStudied = (lessonProgress?.reduce((total, progress) => {
//         return total + (progress.time_spent || 0);
//       }, 0) || 0) / 3600;

//       const completedAssignments = userAssignments?.filter(
//         assignment => assignment?.status === "submitted" || assignment?.status === "graded"
//       ).length || 0;

//       const totalAssignments = userAssignments?.length || 0;

//       // Calculate overall progress safely
//       const totalCompletedLessons = lessonProgress?.filter(progress => progress?.completed === true).length || 0;
//       const totalUserLessons = lessonProgress?.length || 0;
//       const overallProgress = totalUserLessons > 0 
//         ? Math.round((totalCompletedLessons / totalUserLessons) * 100) 
//         : 0;

//       // 🗓 FORMAT UPCOMING CLASSES with null safety
//       const upcomingClasses = (upcomingLessons || []).map((userProgress) => {
//         const lesson = userProgress?.lessons || {};
//         const course = userProgress?.courses || {};
        
//         const courseName = course?.name || "Unknown Course";
//         const instructor = userProgress?.instructor || "Unknown Instructor";
//         const lessonTitle = lesson?.title || "Untitled Lesson";
//         const lessonType = lesson?.lesson_type || "video";

//         // Handle scheduled date safely
//         let displayDate = "Scheduled soon";
//         let displayTime = "Flexible";
//         let actualDate = null;

//         if (userProgress?.scheduled_date) {
//           try {
//             const scheduledDate = new Date(userProgress.scheduled_date);
//             if (!isNaN(scheduledDate.getTime())) {
//               actualDate = scheduledDate.toISOString();
              
//               const today = new Date();
//               const tomorrow = new Date(today);
//               tomorrow.setDate(tomorrow.getDate() + 1);

//               if (scheduledDate.toDateString() === today.toDateString()) {
//                 displayDate = "Today";
//               } else if (scheduledDate.toDateString() === tomorrow.toDateString()) {
//                 displayDate = "Tomorrow";
//               } else {
//                 displayDate = scheduledDate.toLocaleDateString("en-US", {
//                   month: "short",
//                   day: "numeric"
//                 });
//               }

//               displayTime = scheduledDate.toLocaleTimeString("en-US", {
//                 hour: 'numeric',
//                 minute: '2-digit',
//                 hour12: true
//               });
//             }
//           } catch (dateError) {
//             console.warn("⚠️ Invalid date format:", userProgress.scheduled_date);
//           }
//         }

//         const lessonUrl = userProgress?.lesson_url || lesson?.content_url || null;

//         return {
//           id: userProgress?.id,
//           lessonId: userProgress?.lesson_id,
//           course: courseName,
//           topic: lessonTitle,
//           time: displayTime,
//           date: displayDate,
//           type: lessonType === "live" ? "live" : "video",
//           instructor: instructor,
//           lessonUrl: lessonUrl,
//           actualDate: actualDate
//         };
//       });

//       // 📝 FORMAT RECENT ASSIGNMENTS with null safety
//       const recentAssignments = (userAssignments || []).map((userAssignment) => {
//         const assignment = userAssignment?.assignments || {};
//         const course = userAssignment?.courses || {};
        
//         const assignmentTitle = assignment?.title || "Unknown Assignment";
//         const courseName = course?.name || "Unknown Course";
        
//         let dueDateDisplay = "No due date";
//         let actualDueDate = null;

//         if (userAssignment?.due_date) {
//           try {
//             const dueDate = new Date(userAssignment.due_date);
//             if (!isNaN(dueDate.getTime())) {
//               actualDueDate = dueDate.toISOString();
              
//               const today = new Date();
//               const tomorrow = new Date(today);
//               tomorrow.setDate(tomorrow.getDate() + 1);

//               if (dueDate.toDateString() === today.toDateString()) {
//                 dueDateDisplay = "Today";
//               } else if (dueDate.toDateString() === tomorrow.toDateString()) {
//                 dueDateDisplay = "Tomorrow";
//               } else {
//                 dueDateDisplay = dueDate.toLocaleDateString("en-US", {
//                   month: "short",
//                   day: "numeric",
//                   year: "numeric"
//                 });
//               }
//             }
//           } catch (dateError) {
//             console.warn("⚠️ Invalid due date format:", userAssignment.due_date);
//           }
//         }

//         // Calculate progress based on assignment status
//         let progress = 0;
//         const status = userAssignment?.status || "not-started";
        
//         if (status === "submitted" || status === "graded") {
//           progress = 100;
//         } else if (status === "in-progress") {
//           progress = 50;
//         }

//         return {
//           id: userAssignment?.id || `temp-${Math.random()}`,
//           title: assignmentTitle,
//           course: courseName,
//           dueDate: dueDateDisplay,
//           status: status,
//           progress: progress,
//           actualDueDate: actualDueDate
//         };
//       });

//       // Sort assignments by due date (closest first, then no due date last)
//       recentAssignments.sort((a, b) => {
//         if (!a.actualDueDate && !b.actualDueDate) return 0;
//         if (!a.actualDueDate) return 1;
//         if (!b.actualDueDate) return -1;
//         return new Date(a.actualDueDate).getTime() - new Date(b.actualDueDate).getTime();
//       });

//       // Take only the 3 most recent/urgent assignments
//       const displayAssignments = recentAssignments.slice(0, 3);

//       // 📊 FORMAT COURSE PROGRESS with null safety
//       const courseProgress = (enrollments || []).map((enrollment) => {
//         const courseId = enrollment?.course_id;
        
//         if (!courseId) {
//           return {
//             courseName: "Unknown Course",
//             progress: 0
//           };
//         }

//         const courseLessons = (lessonProgress || []).filter(
//           progress => progress?.course_id === courseId
//         );
        
//         const completedCourseLessons = courseLessons.filter(
//           progress => progress?.completed === true
//         ).length;
        
//         const progressPercent = courseLessons.length > 0 
//           ? Math.round((completedCourseLessons / courseLessons.length) * 100) 
//           : 0;

//         return {
//           courseName: enrollment?.courses?.name || enrollment?.course_name || "Unknown Course",
//           progress: progressPercent
//         };
//       });

//       const responseData = {
//         user: {
//           firstName: userData?.first_name || "User",
//           lastName: userData?.last_name || "",
//           email: userData?.email || userData?.email || userId
//         },
//         stats: {
//           coursesEnrolled: totalCourses,
//           hoursStudied: Math.round(totalHoursStudied),
//           assignmentsDone: `${completedAssignments}/${totalAssignments}`,
//           overallProgress: overallProgress
//         },
//         upcomingClasses,
//         recentAssignments: displayAssignments,
//         courseProgress
//       };

//       console.log("✅ Successfully processed dashboard data");
//       console.log(`📊 Stats: ${totalCourses} courses, ${Math.round(totalHoursStudied)} hours, ${overallProgress}% progress`);
//       console.log(`🗓 Upcoming: ${upcomingClasses.length} classes`);
//       console.log(`📝 Assignments: ${displayAssignments.length} recent`);

//       return res.status(200).json({
//         success: true,
//         data: responseData,
//         message: 'Dashboard overview fetched successfully'
//       });

//     } catch (error) {
//       console.error('❌ Dashboard overview error:', error);
//       return res.status(500).json({
//         success: false,
//         error: error.message || 'Failed to fetch dashboard overview',
//         ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
//       });
//     }
//   }
// }

// module.exports = new DashboardController();