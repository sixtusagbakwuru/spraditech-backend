const { supabase } = require('../config/supabaseClient');

class AssignmentController {
  /**
   * Get assignment details - works with both user_assignment id and assignment_id
   */
  async getAssignment(req, res) {
    try {
      const { id } = req.params;
      const userId = req.user.id;

      console.log(`📚 Fetching assignment ${id} for user ${userId}`);

      // Try to find the assignment - first by user_assignment id, then by assignment_id
      let assignment = null;
      let error = null;

      // First attempt: try by user_assignment primary key (id)
      const result1 = await supabase
        .from('user_assignments')
        .select(`
          *,
          courses:course_id (
            id,
            name
          )
        `)
        .eq('id', id)
        .eq('user_id', userId)
        .maybeSingle();

      if (result1.data) {
        assignment = result1.data;
        console.log(`✅ Found assignment using user_assignment id: ${id}`);
      } else {
        // Second attempt: try by assignment_id
        console.log(`⚠️ Not found by id, trying assignment_id: ${id}`);
        const result2 = await supabase
          .from('user_assignments')
          .select(`
            *,
            courses:course_id (
              id,
              name
            )
          `)
          .eq('assignment_id', id)
          .eq('user_id', userId)
          .maybeSingle();

        if (result2.data) {
          assignment = result2.data;
          console.log(`✅ Found assignment using assignment_id: ${id}`);
        } else {
          error = result2.error;
        }
      }

      if (error) {
        console.error('❌ Assignment fetch error:', error);
        throw error;
      }

      if (!assignment) {
        console.log(`❌ Assignment ${id} not found for user ${userId}`);
        return res.status(404).json({
          success: false,
          error: 'Assignment not found'
        });
      }

      // Format response
      const formattedAssignment = {
        id: assignment.assignment_id, // This is the actual assignment ID
        userAssignmentId: assignment.id, // This is the user_assignment record ID
        title: assignment.title || `Assignment ${assignment.assignment_id.substring(0, 8)}`,
        description: assignment.description || 'No description available.',
        instructions: assignment.instructions || 'No instructions available.',
        courseId: assignment.course_id,
        courseName: assignment.courses?.name || 'Unknown Course',
        dueDate: assignment.due_date,
        totalPoints: assignment.max_grade || 100,
        resources: assignment.resources || [],
        requirements: assignment.requirements || ['Complete the assignment'],
        rubric: assignment.rubric || [],
        status: assignment.status,
        submissionText: assignment.submission_text || '',
        attachments: assignment.attachments || [],
        timeSpent: assignment.time_spent || 0,
        grade: assignment.grade,
        feedback: assignment.feedback,
        submittedAt: assignment.submitted_at,
        startedAt: assignment.started_at,
        lastEdited: assignment.last_edited,
        createdAt: assignment.created_at,
        updatedAt: assignment.updated_at,
        isPlaceholder: !assignment.instructions || assignment.instructions === 'No instructions available.'
      };

      return res.status(200).json({
        success: true,
        data: formattedAssignment
      });

    } catch (error) {
      console.error('❌ Get assignment error:', error);
      return res.status(500).json({
        success: false,
        error: error.message || 'Failed to fetch assignment'
      });
    }
  }

  /**
   * Get user's progress on assignment
   */
  async getUserProgress(req, res) {
    try {
      const { id } = req.params;
      const userId = req.user.id;

      console.log(`📊 Fetching progress for assignment ${id}, user ${userId}`);

      // Try by assignment_id first (most likely)
      let { data: progress, error } = await supabase
        .from('user_assignments')
        .select('*')
        .eq('assignment_id', id)
        .eq('user_id', userId)
        .maybeSingle();

      if (error) {
        console.error('❌ Progress fetch error:', error);
        throw error;
      }

      // If not found, try by user_assignment id
      if (!progress) {
        console.log(`⚠️ Progress not found by assignment_id, trying by id: ${id}`);
        const result = await supabase
          .from('user_assignments')
          .select('*')
          .eq('id', id)
          .eq('user_id', userId)
          .maybeSingle();
        
        progress = result.data;
        error = result.error;

        if (error) throw error;
      }

      return res.status(200).json({
        success: true,
        data: progress || null
      });

    } catch (error) {
      console.error('❌ Get progress error:', error);
      return res.status(500).json({
        success: false,
        error: error.message || 'Failed to fetch progress'
      });
    }
  }

  /**
   * Start working on assignment
   */
  async startAssignment(req, res) {
    try {
      const { id } = req.params;
      const userId = req.user.id;
      const { courseId } = req.body;

      console.log(`🚀 Starting assignment ${id} for user ${userId}`);

      if (!courseId) {
        return res.status(400).json({
          success: false,
          error: 'Course ID is required to start an assignment'
        });
      }

      // Check if user already has this assignment (by assignment_id)
      const { data: existing, error: existingError } = await supabase
        .from('user_assignments')
        .select('*')
        .eq('assignment_id', id)
        .eq('user_id', userId)
        .maybeSingle();

      if (existingError) {
        console.error('❌ Check existing error:', existingError);
        throw existingError;
      }

      if (existing) {
        return res.status(200).json({
          success: true,
          data: existing,
          message: 'Assignment already started'
        });
      }

      // Create new assignment record
      const now = new Date().toISOString();
      const dueDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

      const { data: progress, error: insertError } = await supabase
        .from('user_assignments')
        .insert({
          assignment_id: id,
          user_id: userId,
          course_id: courseId,
          status: 'in_progress',
          due_date: dueDate,
          started_at: now,
          last_edited: now,
          created_at: now,
          updated_at: now,
          time_spent: 0,
          attachments: [],
          submission_text: '',
          grade: null,
          feedback: null,
          title: `Assignment ${id.substring(0, 8)}`,
          description: 'Assignment details will be added soon.',
          instructions: 'No instructions available.',
          max_grade: 100,
          resources: [],
          requirements: ['Complete the assignment'],
          rubric: []
        })
        .select()
        .single();

      if (insertError) {
        console.error('❌ Insert error:', insertError);
        throw insertError;
      }

      console.log(`✅ Assignment started successfully for user ${userId}`);

      return res.status(200).json({
        success: true,
        data: progress,
        message: 'Assignment started successfully'
      });

    } catch (error) {
      console.error('❌ Start assignment error:', error);
      return res.status(500).json({
        success: false,
        error: error.message || 'Failed to start assignment'
      });
    }
  }

  /**
   * Save progress on assignment
   */
  /**
 * Save progress on assignment
 */
async saveProgress(req, res) {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const { submissionText, timeSpent, attachments } = req.body;

    console.log(`💾 Saving progress for assignment ${id}, user ${userId}`);

    // Find the record - try both assignment_id and id
    let existing = null;
    
    // First try by assignment_id
    const result1 = await supabase
      .from('user_assignments')
      .select('id')
      .eq('assignment_id', id)
      .eq('user_id', userId)
      .maybeSingle();

    if (result1.data) {
      existing = result1.data;
      console.log('✅ Found by assignment_id for save');
    } else {
      // Then try by id
      const result2 = await supabase
        .from('user_assignments')
        .select('id')
        .eq('id', id)
        .eq('user_id', userId)
        .maybeSingle();
      
      if (result2.data) {
        existing = result2.data;
        console.log('✅ Found by id for save');
      }
    }

    if (!existing) {
      console.log(`❌ No record found for save - assignment ${id}, user ${userId}`);
      return res.status(400).json({
        success: false,
        error: 'Assignment not found. Please start the assignment first.'
      });
    }

    // Update progress
    const now = new Date().toISOString();
    const { data: progress, error: updateError } = await supabase
      .from('user_assignments')
      .update({
        submission_text: submissionText || '',
        time_spent: timeSpent || 0,
        attachments: attachments ? attachments.map(name => ({ name, uploadedAt: now })) : [],
        last_edited: now,
        updated_at: now,
        status: 'in_progress'
      })
      .eq('id', existing.id)
      .select()
      .single();

    if (updateError) {
      console.error('❌ Update error:', updateError);
      throw updateError;
    }

    console.log(`✅ Progress saved for user ${userId}`);

    return res.status(200).json({
      success: true,
      data: progress,
      message: 'Progress saved successfully'
    });

  } catch (error) {
    console.error('❌ Save progress error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to save progress'
    });
  }
}

  /**
 * Submit assignment
 */
async submitAssignment(req, res) {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const { submissionText, timeSpent, attachments } = req.body;

    console.log(`📤 Submitting assignment ${id} for user ${userId}`);
    console.log('📤 Request body:', { submissionText: submissionText?.substring(0, 50), timeSpent, attachments });

    // Find the record - try both assignment_id and id
    let existing = null;
    
    // First try by assignment_id
    const result1 = await supabase
      .from('user_assignments')
      .select('*')
      .eq('assignment_id', id)
      .eq('user_id', userId)
      .maybeSingle();

    if (result1.data) {
      existing = result1.data;
      console.log('✅ Found by assignment_id');
    } else {
      // Then try by id (user_assignment primary key)
      const result2 = await supabase
        .from('user_assignments')
        .select('*')
        .eq('id', id)
        .eq('user_id', userId)
        .maybeSingle();
      
      if (result2.data) {
        existing = result2.data;
        console.log('✅ Found by id');
      }
    }

    if (!existing) {
      console.log(`❌ No user_assignment found for assignment ${id} and user ${userId}`);
      
      // Debug: Check if any records exist for this assignment
      const { data: anyRecords } = await supabase
        .from('user_assignments')
        .select('id, user_id, status')
        .eq('assignment_id', id);
      
      console.log('📊 Records for this assignment:', anyRecords);
      
      return res.status(400).json({
        success: false,
        error: 'Assignment not found. Please start the assignment first.'
      });
    }

    console.log('📊 Found record:', {
      id: existing.id,
      assignment_id: existing.assignment_id,
      status: existing.status,
      user_id: existing.user_id
    });

    if (existing.status === 'submitted') {
      return res.status(400).json({
        success: false,
        error: 'Assignment already submitted'
      });
    }

    if (existing.status === 'graded') {
      return res.status(400).json({
        success: false,
        error: 'Assignment has already been graded'
      });
    }

    if (existing.status !== 'in_progress') {
      return res.status(400).json({
        success: false,
        error: `Cannot submit: Assignment is ${existing.status}. Please start the assignment first.`
      });
    }

    // Validate submission
    if ((!submissionText || !submissionText.trim()) && (!attachments || attachments.length === 0)) {
      return res.status(400).json({
        success: false,
        error: 'Please add a submission or upload files before submitting'
      });
    }

    // Update to submitted
    const now = new Date().toISOString();
    const { data: progress, error: updateError } = await supabase
      .from('user_assignments')
      .update({
        submission_text: submissionText || '',
        time_spent: timeSpent || 0,
        attachments: attachments ? attachments.map(name => ({ name, uploadedAt: now })) : [],
        status: 'submitted',
        submitted_at: now,
        last_edited: now,
        updated_at: now
      })
      .eq('id', existing.id)
      .select()
      .single();

    if (updateError) {
      console.error('❌ Submit error:', updateError);
      throw updateError;
    }

    console.log(`✅ Assignment submitted successfully for user ${userId}`);

    return res.status(200).json({
      success: true,
      data: progress,
      message: 'Assignment submitted successfully'
    });

  } catch (error) {
    console.error('❌ Submit assignment error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to submit assignment'
    });
  }
}

  /**
   * Get all assignments for a course
   */
  async getCourseAssignments(req, res) {
    try {
      const { courseId } = req.params;
      const userId = req.user.id;

      const { data: assignments, error } = await supabase
        .from('user_assignments')
        .select('*')
        .eq('course_id', courseId)
        .eq('user_id', userId)
        .order('due_date', { ascending: true });

      if (error) {
        throw error;
      }

      // Format assignments
      const formattedAssignments = assignments.map(assignment => ({
        id: assignment.assignment_id,
        userAssignmentId: assignment.id,
        title: assignment.title || `Assignment ${assignment.assignment_id.substring(0, 8)}`,
        description: assignment.description,
        dueDate: assignment.due_date,
        totalPoints: assignment.max_grade || 100,
        status: assignment.status,
        submittedAt: assignment.submitted_at,
        grade: assignment.grade,
        hasSubmission: !!(assignment.submission_text || assignment.attachments?.length)
      }));

      return res.status(200).json({
        success: true,
        data: formattedAssignments
      });

    } catch (error) {
      console.error('❌ Get course assignments error:', error);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
}

module.exports = new AssignmentController();



// const { supabase } = require('../config/supabaseClient');

// class AssignmentController {
//   /**
//    * Get assignment details
//    */
//   async getAssignment(req, res) {
//     try {
//       const { id } = req.params;
//       const userId = req.user.id;

//       console.log(`📚 Fetching assignment ${id} for user ${userId}`);

//       // Get assignment with course details
//       const { data: assignment, error } = await supabase
//         .from('user_assignments')
//         .select(`
//           *,
//           courses:course_id (
//             id,
//             title,
//             name
//           )
//         `)
//         .eq('id', id)
//         .single();

//       if (error) {
//         console.error('❌ Assignment fetch error:', error);
//         return res.status(404).json({
//           success: false,
//           error: 'Assignment not found'
//         });
//       }

//       if (!assignment) {
//         return res.status(404).json({
//           success: false,
//           error: 'Assignment not found'
//         });
//       }

//       // Format response
//       const formattedAssignment = {
//         id: assignment.id,
//         title: assignment.title,
//         description: assignment.description || '',
//         instructions: assignment.instructions || '',
//         courseId: assignment.course_id,
//         courseName: assignment.courses?.title || assignment.courses?.name || 'Unknown Course',
//         dueDate: assignment.due_date,
//         totalPoints: assignment.max_grade || 100,
//         resources: assignment.resources || [],
//         requirements: assignment.requirements || [],
//         rubric: assignment.rubric || [],
//         createdAt: assignment.created_at,
//         updatedAt: assignment.updated_at
//       };

//       return res.status(200).json({
//         success: true,
//         data: formattedAssignment
//       });

//     } catch (error) {
//       console.error('❌ Get assignment error:', error);
//       return res.status(500).json({
//         success: false,
//         error: error.message || 'Failed to fetch assignment'
//       });
//     }
//   }

//   /**
//    * Get user's progress on assignment
//    */
//   async getUserProgress(req, res) {
//     try {
//       const { id } = req.params;
//       const userId = req.user.id;

//       console.log(`📊 Fetching progress for assignment ${id}, user ${userId}`);

//       const { data: progress, error } = await supabase
//         .from('user_assignments')
//         .select('*')
//         .eq('assignment_id', id)
//         .eq('user_id', userId)
//         .maybeSingle();

//       if (error) {
//         console.error('❌ Progress fetch error:', error);
//         throw error;
//       }

//       // If no progress record exists, return null
//       return res.status(200).json({
//         success: true,
//         data: progress || null
//       });

//     } catch (error) {
//       console.error('❌ Get progress error:', error);
//       return res.status(500).json({
//         success: false,
//         error: error.message || 'Failed to fetch progress'
//       });
//     }
//   }

//   /**
//    * Start working on assignment
//    */
//   async startAssignment(req, res) {
//     try {
//       const { id } = req.params;
//       const userId = req.user.id;
//       const { courseId } = req.body;

//       console.log(`🚀 Starting assignment ${id} for user ${userId}`);

//       // Check if assignment exists
//       const { data: assignment, error: assignmentError } = await supabase
//         .from('assignments')
//         .select('id, course_id, due_date')
//         .eq('id', id)
//         .single();

//       if (assignmentError || !assignment) {
//         return res.status(404).json({
//           success: false,
//           error: 'Assignment not found'
//         });
//       }

//       // Check if user already has progress
//       const { data: existing, error: existingError } = await supabase
//         .from('user_assignments')
//         .select('*')
//         .eq('assignment_id', id)
//         .eq('user_id', userId)
//         .maybeSingle();

//       if (existingError) {
//         console.error('❌ Check existing error:', existingError);
//         throw existingError;
//       }

//       if (existing) {
//         // If already exists, return the existing record
//         return res.status(200).json({
//           success: true,
//           data: existing,
//           message: 'Assignment already started'
//         });
//       }

//       // Create new progress record
//       const now = new Date().toISOString();
//       const { data: progress, error: insertError } = await supabase
//         .from('user_assignments')
//         .insert({
//           assignment_id: id,
//           user_id: userId,
//           course_id: assignment.course_id,
//           status: 'in-progress',
//           due_date: assignment.due_date,
//           started_at: now,
//           last_edited: now,
//           created_at: now,
//           updated_at: now,
//           time_spent: 0,
//           attachments: [],
//           submission_text: '',
//           grade: null,
//           feedback: null
//         })
//         .select()
//         .single();

//       if (insertError) {
//         console.error('❌ Insert error:', insertError);
//         throw insertError;
//       }

//       console.log(`✅ Assignment started successfully for user ${userId}`);

//       return res.status(200).json({
//         success: true,
//         data: progress,
//         message: 'Assignment started successfully'
//       });

//     } catch (error) {
//       console.error('❌ Start assignment error:', error);
//       return res.status(500).json({
//         success: false,
//         error: error.message || 'Failed to start assignment'
//       });
//     }
//   }

//   /**
//    * Save progress on assignment
//    */
//   async saveProgress(req, res) {
//     try {
//       const { id } = req.params;
//       const userId = req.user.id;
//       const { submissionText, timeSpent, attachments } = req.body;

//       console.log(`💾 Saving progress for assignment ${id}, user ${userId}`);

//       // Check if progress record exists
//       const { data: existing, error: checkError } = await supabase
//         .from('user_assignments')
//         .select('id')
//         .eq('assignment_id', id)
//         .eq('user_id', userId)
//         .maybeSingle();

//       if (checkError) {
//         throw checkError;
//       }

//       if (!existing) {
//         // If no progress record, start assignment first
//         const assignment = await supabase
//           .from('assignments')
//           .select('course_id, due_date')
//           .eq('id', id)
//           .single();

//         const now = new Date().toISOString();
//         const { data: newProgress, error: insertError } = await supabase
//           .from('user_assignments')
//           .insert({
//             assignment_id: id,
//             user_id: userId,
//             course_id: assignment.data?.course_id,
//             status: 'in-progress',
//             due_date: assignment.data?.due_date,
//             submission_text: submissionText || '',
//             time_spent: timeSpent || 0,
//             attachments: attachments || [],
//             started_at: now,
//             last_edited: now,
//             created_at: now,
//             updated_at: now
//           })
//           .select()
//           .single();

//         if (insertError) throw insertError;

//         return res.status(200).json({
//           success: true,
//           data: newProgress,
//           message: 'Progress saved successfully'
//         });
//       }

//       // Update existing progress
//       const now = new Date().toISOString();
//       const { data: progress, error: updateError } = await supabase
//         .from('user_assignments')
//         .update({
//           submission_text: submissionText || '',
//           time_spent: timeSpent || 0,
//           attachments: attachments || [],
//           last_edited: now,
//           updated_at: now,
//           status: 'in-progress'
//         })
//         .eq('assignment_id', id)
//         .eq('user_id', userId)
//         .select()
//         .single();

//       if (updateError) {
//         console.error('❌ Update error:', updateError);
//         throw updateError;
//       }

//       console.log(`✅ Progress saved for user ${userId}`);

//       return res.status(200).json({
//         success: true,
//         data: progress,
//         message: 'Progress saved successfully'
//       });

//     } catch (error) {
//       console.error('❌ Save progress error:', error);
//       return res.status(500).json({
//         success: false,
//         error: error.message || 'Failed to save progress'
//       });
//     }
//   }

//   /**
//    * Submit assignment
//    */
//   async submitAssignment(req, res) {
//     try {
//       const { id } = req.params;
//       const userId = req.user.id;
//       const { submissionText, timeSpent, attachments } = req.body;

//       console.log(`📤 Submitting assignment ${id} for user ${userId}`);

//       // Check if already submitted
//       const { data: existing, error: checkError } = await supabase
//         .from('user_assignments')
//         .select('status')
//         .eq('assignment_id', id)
//         .eq('user_id', userId)
//         .maybeSingle();

//       if (checkError) {
//         throw checkError;
//       }

//       if (!existing) {
//         return res.status(400).json({
//           success: false,
//           error: 'Please start the assignment first'
//         });
//       }

//       if (existing.status === 'submitted') {
//         return res.status(400).json({
//           success: false,
//           error: 'Assignment already submitted'
//         });
//       }

//       if (existing.status === 'graded') {
//         return res.status(400).json({
//           success: false,
//           error: 'Assignment has already been graded'
//         });
//       }

//       // Validate submission
//       if ((!submissionText || !submissionText.trim()) && (!attachments || attachments.length === 0)) {
//         return res.status(400).json({
//           success: false,
//           error: 'Please add a submission or upload files before submitting'
//         });
//       }

//       // Update to submitted
//       const now = new Date().toISOString();
//       const { data: progress, error: updateError } = await supabase
//         .from('user_assignments')
//         .update({
//           submission_text: submissionText || '',
//           time_spent: timeSpent || 0,
//           attachments: attachments || [],
//           status: 'submitted',
//           submitted_at: now,
//           last_edited: now,
//           updated_at: now
//         })
//         .eq('assignment_id', id)
//         .eq('user_id', userId)
//         .select()
//         .single();

//       if (updateError) {
//         console.error('❌ Submit error:', updateError);
//         throw updateError;
//       }

//       console.log(`✅ Assignment submitted successfully for user ${userId}`);

//       return res.status(200).json({
//         success: true,
//         data: progress,
//         message: 'Assignment submitted successfully'
//       });

//     } catch (error) {
//       console.error('❌ Submit assignment error:', error);
//       return res.status(500).json({
//         success: false,
//         error: error.message || 'Failed to submit assignment'
//       });
//     }
//   }

//   /**
//    * Get all assignments for a course
//    */
//   async getCourseAssignments(req, res) {
//     try {
//       const { courseId } = req.params;
//       const userId = req.user.id;

//       const { data: assignments, error } = await supabase
//         .from('assignments')
//         .select(`
//           *,
//           user_assignments!left (
//             status,
//             submitted_at,
//             grade,
//             id
//           )
//         `)
//         .eq('course_id', courseId)
//         .eq('user_assignments.user_id', userId)
//         .order('due_date', { ascending: true });

//       if (error) {
//         throw error;
//       }

//       // Format assignments with user progress
//       const formattedAssignments = assignments.map(assignment => ({
//         id: assignment.id,
//         title: assignment.title,
//         description: assignment.description,
//         dueDate: assignment.due_date,
//         totalPoints: assignment.max_grade,
//         status: assignment.user_assignments?.[0]?.status || 'not-started',
//         submittedAt: assignment.user_assignments?.[0]?.submitted_at,
//         grade: assignment.user_assignments?.[0]?.grade,
//         userAssignmentId: assignment.user_assignments?.[0]?.id
//       }));

//       return res.status(200).json({
//         success: true,
//         data: formattedAssignments
//       });

//     } catch (error) {
//       console.error('❌ Get course assignments error:', error);
//       return res.status(500).json({
//         success: false,
//         error: error.message
//       });
//     }
//   }
// }

// module.exports = new AssignmentController();