const { supabase } = require('../config/supabaseClient');
const enrollmentService = require('../services/enrollmentService');
const enrollmentEmailService = require('../services/enrollmentEmailService');

class EnrollmentController {
  /**
   * Create a new enrollment
   */
  async createEnrollment(req, res) {
    try {
      const { enrollmentData, password } = req.body;

      console.log('📝 Enrollment request received for:', enrollmentData?.email);

      // Validate required fields
      const validation = enrollmentService.validateEnrollmentData(enrollmentData);
      if (!validation.isValid) {
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          errors: validation.errors
        });
      }

      let userId;
      let isNewUser = false;
      let generatedPassword = null;
      const isFree = enrollmentService.isCourseFree(enrollmentData.courseFee);

      // Handle existing users
      if (enrollmentData.userType === 'existing' && enrollmentData.existingUserId) {
        userId = enrollmentData.existingUserId;
        console.log('👤 Using existing user ID:', userId);

        // Verify user exists
        const { data: existingUser, error: userError } = await supabase
          .from('users')
          .select('id, email, first_name, last_name')
          .eq('id', userId)
          .single();

        if (userError || !existingUser) {
          return res.status(404).json({
            success: false,
            error: 'Existing user not found'
          });
        }
      } else {
        // Handle new users
        isNewUser = true;

        // Check if user already exists
        const { data: existingUser } = await supabase
          .from('users')
          .select('id')
          .eq('email', enrollmentData.email)
          .single();

        if (existingUser) {
          return res.status(400).json({
            success: false,
            error: 'User with this email already exists. Please sign in as existing user.'
          });
        }

        // 1. Create user account in Auth
        console.log('🔐 Creating new user account...');
        generatedPassword = password || enrollmentService.generateTemporaryPassword();
        
        const { data: authData, error: authError } = await supabase.auth.admin.createUser({
          email: enrollmentData.email,
          password: generatedPassword,
          email_confirm: true,
          user_metadata: {
            first_name: enrollmentData.firstName,
            last_name: enrollmentData.lastName,
            role: 'student'
          }
        });

        if (authError) {
          console.error('❌ Auth error:', authError);
          return res.status(400).json({
            success: false,
            error: `Account creation failed: ${authError.message}`
          });
        }

        if (!authData.user) {
          return res.status(500).json({
            success: false,
            error: 'Failed to create user account'
          });
        }

        userId = authData.user.id;
        console.log('✅ User account created:', userId);

        // 2. Create user profile with hashed password
        const userProfile = await enrollmentService.formatUserProfile(enrollmentData, userId, generatedPassword);
        const { error: userError } = await supabase
          .from('users')
          .insert(userProfile);

        if (userError) {
          console.error('❌ User profile error:', userError);
          return res.status(500).json({
            success: false,
            error: `User profile creation failed: ${userError.message}`
          });
        }

        console.log('✅ User profile created with hashed password');

        // 3. Create student profile
        const studentProfile = enrollmentService.formatStudentProfile(enrollmentData, userId);
        const { error: profileError } = await supabase
          .from('student_profiles')
          .insert(studentProfile);

        if (profileError) {
          console.error('❌ Student profile error:', profileError);
          return res.status(500).json({
            success: false,
            error: `Student profile creation failed: ${profileError.message}`
          });
        }

        console.log('✅ Student profile created');
      }

      // 4. Generate payment reference
      const paymentReference = enrollmentService.generatePaymentReference(isFree);

      // 5. Create enrollment record
      const enrollmentDataToInsert = enrollmentService.formatEnrollmentData(
        enrollmentData, 
        userId, 
        isFree, 
        paymentReference
      );

      const { data: enrollmentRecord, error: enrollmentError } = await supabase
        .from('enrollments')
        .insert(enrollmentDataToInsert)
        .select(`
          *,
          users (first_name, last_name, email)
        `)
        .single();

      if (enrollmentError) {
        console.error('❌ Enrollment error:', enrollmentError);
        return res.status(500).json({
          success: false,
          error: `Enrollment creation failed: ${enrollmentError.message}`
        });
      }

      console.log('✅ Enrollment created successfully:', enrollmentRecord.id);

      // 6. Prepare enrollment data for emails with userId included
      const emailEnrollmentData = {
        ...enrollmentData,
        userId: userId // Make sure userId is included for metadata
      };

      // 7. Queue email notifications (non-blocking - don't await)
      // Only send password in email for new users
      if (isNewUser) {
        enrollmentEmailService.queueEnrollmentEmails(emailEnrollmentData, {
          isNewUser,
          isFree,
          userId,
          enrollmentId: enrollmentRecord.id,
          password: generatedPassword // Send plain password in email
        }).catch(error => {
          console.error('❌ Email queueing failed (non-critical):', error);
        });
      } else {
        // For existing users, don't send password
        enrollmentEmailService.queueEnrollmentEmails(emailEnrollmentData, {
          isNewUser,
          isFree,
          userId,
          enrollmentId: enrollmentRecord.id,
          password: null
        }).catch(error => {
          console.error('❌ Email queueing failed (non-critical):', error);
        });
      }

      // 8. Return success response
      return res.status(201).json({
        success: true,
        data: {
          userId,
          enrollment: enrollmentRecord,
          paymentReference,
          isNewUser,
          isFreeCourse: isFree
        },
        message: isFree 
          ? 'Free course enrollment submitted successfully! Check your email for access instructions.'
          : 'Enrollment submitted successfully! Please complete your payment to activate your course.'
      });

    } catch (error) {
      console.error('🔥 Enrollment error:', error);
      return res.status(500).json({
        success: false,
        error: error.message || 'Enrollment failed',
        ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
      });
    }
  }

  /**
   * Get enrollment by ID
   */
  async getEnrollment(req, res) {
    try {
      const { id } = req.params;

      const { data: enrollment, error } = await supabase
        .from('enrollments')
        .select(`
          *,
          users (id, email, first_name, last_name, phone),
          student_profiles (*)
        `)
        .eq('id', id)
        .single();

      if (error) {
        return res.status(404).json({
          success: false,
          error: 'Enrollment not found'
        });
      }

      return res.status(200).json({
        success: true,
        data: enrollment
      });
    } catch (error) {
      console.error('❌ Get enrollment error:', error);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * Get enrollments by user ID
   */
  async getUserEnrollments(req, res) {
    try {
      const { userId } = req.params;

      const { data: enrollments, error } = await supabase
        .from('enrollments')
        .select(`
          *,
          users (first_name, last_name, email)
        `)
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) {
        throw error;
      }

      return res.status(200).json({
        success: true,
        data: enrollments
      });
    } catch (error) {
      console.error('❌ Get user enrollments error:', error);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * Update enrollment status
   */
  async updateEnrollmentStatus(req, res) {
    try {
      const { id } = req.params;
      const { enrollment_status, payment_status } = req.body;

      const updates = {
        updated_at: new Date().toISOString()
      };
      
      if (enrollment_status) updates.enrollment_status = enrollment_status;
      if (payment_status) updates.payment_status = payment_status;

      const { data: enrollment, error } = await supabase
        .from('enrollments')
        .update(updates)
        .eq('id', id)
        .select(`
          *,
          users (id, email, first_name, last_name)
        `)
        .single();

      if (error) {
        return res.status(400).json({
          success: false,
          error: error.message
        });
      }

      // If enrollment is activated, send activation email
      if (enrollment_status === 'active' && enrollment.users) {
        // Queue activation email (non-blocking)
        enrollmentEmailService.queueEnrollmentActivationEmail(
          {
            email: enrollment.users.email,
            firstName: enrollment.users.first_name
          },
          {
            course_name: enrollment.course_name,
            course_id: enrollment.course_id
          },
          enrollment.id
        ).catch(error => {
          console.error('❌ Activation email queueing failed:', error);
        });
      }

      return res.status(200).json({
        success: true,
        data: enrollment,
        message: 'Enrollment status updated successfully'
      });
    } catch (error) {
      console.error('❌ Update enrollment error:', error);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * Handle Paystack payment verification callback
   */
  async handlePaymentVerification(req, res) {
    try {
      const { reference, enrollmentId } = req.body;

      // TODO: Verify payment with Paystack
      // const paystackVerification = await verifyPaystackPayment(reference);
      
      // Update enrollment payment status
      const { data: enrollment, error } = await supabase
        .from('enrollments')
        .update({
          payment_status: 'completed',
          payment_reference: reference,
          updated_at: new Date().toISOString()
        })
        .eq('id', enrollmentId)
        .select(`
          *,
          users (id, email, first_name, last_name)
        `)
        .single();

      if (error) {
        throw error;
      }

      // Queue payment confirmation email
      if (enrollment.users) {
        await enrollmentEmailService.queuePaymentConfirmationEmail(
          {
            email: enrollment.users.email,
            firstName: enrollment.users.first_name,
            course: enrollment.course_name
          },
          {
            amount: enrollment.course_fee,
            reference: reference
          },
          enrollment.id
        );
      }

      return res.status(200).json({
        success: true,
        message: 'Payment verified and enrollment updated',
        data: enrollment
      });
    } catch (error) {
      console.error('❌ Payment verification error:', error);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * Login endpoint to verify password
   */
  async login(req, res) {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({
          success: false,
          error: 'Email and password are required'
        });
      }

      // Get user with hashed password
      const { data: user, error } = await supabase
        .from('users')
        .select('id, email, password, first_name, last_name, role')
        .eq('email', email)
        .single();

      if (error || !user) {
        return res.status(401).json({
          success: false,
          error: 'Invalid email or password'
        });
      }

      // Verify password
      const isValid = await enrollmentService.verifyPassword(password, user.password);

      if (!isValid) {
        return res.status(401).json({
          success: false,
          error: 'Invalid email or password'
        });
      }

      // Remove password from response
      delete user.password;

      return res.status(200).json({
        success: true,
        data: user,
        message: 'Login successful'
      });
    } catch (error) {
      console.error('❌ Login error:', error);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
}

module.exports = new EnrollmentController();


// const { supabase } = require('../config/supabaseClient');
// const enrollmentService = require('../services/enrollmentService');
// const enrollmentEmailService = require('../services/enrollmentEmailService');

// class EnrollmentController {
//   /**
//    * Create a new enrollment
//    */
//   async createEnrollment(req, res) {
//     try {
//       const { enrollmentData, password } = req.body;

//       console.log('📝 Enrollment request received for:', enrollmentData?.email);

//       // Validate required fields
//       const validation = enrollmentService.validateEnrollmentData(enrollmentData);
//       if (!validation.isValid) {
//         return res.status(400).json({
//           success: false,
//           error: 'Validation failed',
//           errors: validation.errors
//         });
//       }

//       let userId;
//       let isNewUser = false;
//       const isFree = enrollmentService.isCourseFree(enrollmentData.courseFee);

//       // Handle existing users
//       if (enrollmentData.userType === 'existing' && enrollmentData.existingUserId) {
//         userId = enrollmentData.existingUserId;
//         console.log('👤 Using existing user ID:', userId);

//         // Verify user exists
//         const { data: existingUser, error: userError } = await supabase
//           .from('users')
//           .select('id, email, first_name, last_name')
//           .eq('id', userId)
//           .single();

//         if (userError || !existingUser) {
//           return res.status(404).json({
//             success: false,
//             error: 'Existing user not found'
//           });
//         }
//       } else {
//         // Handle new users
//         isNewUser = true;

//         // Check if user already exists
//         const { data: existingUser } = await supabase
//           .from('users')
//           .select('id')
//           .eq('email', enrollmentData.email)
//           .single();

//         if (existingUser) {
//           return res.status(400).json({
//             success: false,
//             error: 'User with this email already exists. Please sign in as existing user.'
//           });
//         }

//         // 1. Create user account in Auth
//         console.log('🔐 Creating new user account...');
//         const generatedPassword = password || enrollmentService.generateTemporaryPassword();
        
//         const { data: authData, error: authError } = await supabase.auth.admin.createUser({
//           email: enrollmentData.email,
//           password: generatedPassword,
//           email_confirm: true,
//           user_metadata: {
//             first_name: enrollmentData.firstName,
//             last_name: enrollmentData.lastName,
//             role: 'student'
//           }
//         });

//         if (authError) {
//           console.error('❌ Auth error:', authError);
//           return res.status(400).json({
//             success: false,
//             error: `Account creation failed: ${authError.message}`
//           });
//         }

//         if (!authData.user) {
//           return res.status(500).json({
//             success: false,
//             error: 'Failed to create user account'
//           });
//         }

//         userId = authData.user.id;
//         console.log('✅ User account created:', userId);

//         // 2. Create user profile
//         const userProfile = enrollmentService.formatUserProfile(enrollmentData, userId);
//         const { error: userError } = await supabase
//           .from('users')
//           .insert(userProfile);

//         if (userError) {
//           console.error('❌ User profile error:', userError);
//           return res.status(500).json({
//             success: false,
//             error: `User profile creation failed: ${userError.message}`
//           });
//         }

//         // 3. Create student profile
//         const studentProfile = enrollmentService.formatStudentProfile(enrollmentData, userId);
//         const { error: profileError } = await supabase
//           .from('student_profiles')
//           .insert(studentProfile);

//         if (profileError) {
//           console.error('❌ Student profile error:', profileError);
//           return res.status(500).json({
//             success: false,
//             error: `Student profile creation failed: ${profileError.message}`
//           });
//         }

//         // Store the generated password for email
//         enrollmentData.generatedPassword = generatedPassword;
//       }

//       // 4. Generate payment reference
//       const paymentReference = enrollmentService.generatePaymentReference(isFree);

//       // 5. Create enrollment record
//       const enrollmentDataToInsert = enrollmentService.formatEnrollmentData(
//         enrollmentData, 
//         userId, 
//         isFree, 
//         paymentReference
//       );

//       const { data: enrollmentRecord, error: enrollmentError } = await supabase
//         .from('enrollments')
//         .insert(enrollmentDataToInsert)
//         .select(`
//           *,
//           users (first_name, last_name, email)
//         `)
//         .single();

//       if (enrollmentError) {
//         console.error('❌ Enrollment error:', enrollmentError);
//         return res.status(500).json({
//           success: false,
//           error: `Enrollment creation failed: ${enrollmentError.message}`
//         });
//       }

//       console.log('✅ Enrollment created successfully:', enrollmentRecord.id);

//       // 6. Prepare enrollment data for emails with userId included
//       const emailEnrollmentData = {
//         ...enrollmentData,
//         userId: userId // Make sure userId is included for metadata
//       };

//       // 7. Queue email notifications (non-blocking - don't await)
//       enrollmentEmailService.queueEnrollmentEmails(emailEnrollmentData, {
//         isNewUser,
//         isFree,
//         userId,
//         enrollmentId: enrollmentRecord.id,
//         password: enrollmentData.generatedPassword
//       }).catch(error => {
//         console.error('❌ Email queueing failed (non-critical):', error);
//       });

//       // 8. Return success response
//       return res.status(201).json({
//         success: true,
//         data: {
//           userId,
//           enrollment: enrollmentRecord,
//           paymentReference,
//           isNewUser,
//           isFreeCourse: isFree
//         },
//         message: isFree 
//           ? 'Free course enrollment submitted successfully! Check your email for access instructions.'
//           : 'Enrollment submitted successfully! Please complete your payment to activate your course.'
//       });

//     } catch (error) {
//       console.error('🔥 Enrollment error:', error);
//       return res.status(500).json({
//         success: false,
//         error: error.message || 'Enrollment failed',
//         ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
//       });
//     }
//   }

//   /**
//    * Get enrollment by ID
//    */
//   async getEnrollment(req, res) {
//     try {
//       const { id } = req.params;

//       const { data: enrollment, error } = await supabase
//         .from('enrollments')
//         .select(`
//           *,
//           users (id, email, first_name, last_name, phone),
//           student_profiles (*)
//         `)
//         .eq('id', id)
//         .single();

//       if (error) {
//         return res.status(404).json({
//           success: false,
//           error: 'Enrollment not found'
//         });
//       }

//       return res.status(200).json({
//         success: true,
//         data: enrollment
//       });
//     } catch (error) {
//       console.error('❌ Get enrollment error:', error);
//       return res.status(500).json({
//         success: false,
//         error: error.message
//       });
//     }
//   }

//   /**
//    * Get enrollments by user ID
//    */
//   async getUserEnrollments(req, res) {
//     try {
//       const { userId } = req.params;

//       const { data: enrollments, error } = await supabase
//         .from('enrollments')
//         .select(`
//           *,
//           users (first_name, last_name, email)
//         `)
//         .eq('user_id', userId)
//         .order('created_at', { ascending: false });

//       if (error) {
//         throw error;
//       }

//       return res.status(200).json({
//         success: true,
//         data: enrollments
//       });
//     } catch (error) {
//       console.error('❌ Get user enrollments error:', error);
//       return res.status(500).json({
//         success: false,
//         error: error.message
//       });
//     }
//   }

//   /**
//    * Update enrollment status
//    */
//   async updateEnrollmentStatus(req, res) {
//     try {
//       const { id } = req.params;
//       const { enrollment_status, payment_status } = req.body;

//       const updates = {
//         updated_at: new Date().toISOString()
//       };
      
//       if (enrollment_status) updates.enrollment_status = enrollment_status;
//       if (payment_status) updates.payment_status = payment_status;

//       const { data: enrollment, error } = await supabase
//         .from('enrollments')
//         .update(updates)
//         .eq('id', id)
//         .select(`
//           *,
//           users (id, email, first_name, last_name)
//         `)
//         .single();

//       if (error) {
//         return res.status(400).json({
//           success: false,
//           error: error.message
//         });
//       }

//       // If enrollment is activated, send activation email
//       if (enrollment_status === 'active' && enrollment.users) {
//         // Queue activation email (non-blocking)
//         enrollmentEmailService.queueEnrollmentActivationEmail(
//           {
//             email: enrollment.users.email,
//             firstName: enrollment.users.first_name
//           },
//           {
//             course_name: enrollment.course_name,
//             course_id: enrollment.course_id
//           },
//           enrollment.id
//         ).catch(error => {
//           console.error('❌ Activation email queueing failed:', error);
//         });
//       }

//       return res.status(200).json({
//         success: true,
//         data: enrollment,
//         message: 'Enrollment status updated successfully'
//       });
//     } catch (error) {
//       console.error('❌ Update enrollment error:', error);
//       return res.status(500).json({
//         success: false,
//         error: error.message
//       });
//     }
//   }

//   /**
//    * Handle Paystack payment verification callback
//    */
//   async handlePaymentVerification(req, res) {
//     try {
//       const { reference, enrollmentId } = req.body;

//       // TODO: Verify payment with Paystack
//       // const paystackVerification = await verifyPaystackPayment(reference);
      
//       // Update enrollment payment status
//       const { data: enrollment, error } = await supabase
//         .from('enrollments')
//         .update({
//           payment_status: 'completed',
//           payment_reference: reference,
//           updated_at: new Date().toISOString()
//         })
//         .eq('id', enrollmentId)
//         .select(`
//           *,
//           users (id, email, first_name, last_name)
//         `)
//         .single();

//       if (error) {
//         throw error;
//       }

//       // Queue payment confirmation email
//       if (enrollment.users) {
//         await enrollmentEmailService.queuePaymentConfirmationEmail(
//           {
//             email: enrollment.users.email,
//             firstName: enrollment.users.first_name,
//             course: enrollment.course_name
//           },
//           {
//             amount: enrollment.course_fee,
//             reference: reference
//           },
//           enrollment.id
//         );
//       }

//       return res.status(200).json({
//         success: true,
//         message: 'Payment verified and enrollment updated',
//         data: enrollment
//       });
//     } catch (error) {
//       console.error('❌ Payment verification error:', error);
//       return res.status(500).json({
//         success: false,
//         error: error.message
//       });
//     }
//   }
// }

// module.exports = new EnrollmentController();







// const { supabase } = require('../config/supabaseClient');
// const enrollmentService = require('../services/enrollmentService');
// const enrollmentEmailService = require('../services/enrollmentEmailService');

// class EnrollmentController {
//   /**
//    * Create a new enrollment
//    */
//   async createEnrollment(req, res) {
//     try {
//       const { enrollmentData, password } = req.body;

//       console.log('📝 Enrollment request received for:', enrollmentData?.email);

//       // Validate required fields
//       const validation = enrollmentService.validateEnrollmentData(enrollmentData);
//       if (!validation.isValid) {
//         return res.status(400).json({
//           success: false,
//           error: 'Validation failed',
//           errors: validation.errors
//         });
//       }

//       let userId;
//       let isNewUser = false;
//       const isFree = enrollmentService.isCourseFree(enrollmentData.courseFee);

//       // Handle existing users
//       if (enrollmentData.userType === 'existing' && enrollmentData.existingUserId) {
//         userId = enrollmentData.existingUserId;
//         console.log('👤 Using existing user ID:', userId);

//         // Verify user exists
//         const { data: existingUser, error: userError } = await supabase
//           .from('users')
//           .select('id, email, first_name, last_name')
//           .eq('id', userId)
//           .single();

//         if (userError || !existingUser) {
//           return res.status(404).json({
//             success: false,
//             error: 'Existing user not found'
//           });
//         }
//       } else {
//         // Handle new users
//         isNewUser = true;

//         // Check if user already exists
//         const { data: existingUser } = await supabase
//           .from('users')
//           .select('id')
//           .eq('email', enrollmentData.email)
//           .single();

//         if (existingUser) {
//           return res.status(400).json({
//             success: false,
//             error: 'User with this email already exists. Please sign in as existing user.'
//           });
//         }

//         // 1. Create user account in Auth
//         console.log('🔐 Creating new user account...');
//         const generatedPassword = password || enrollmentService.generateTemporaryPassword();
        
//         const { data: authData, error: authError } = await supabase.auth.admin.createUser({
//           email: enrollmentData.email,
//           password: generatedPassword,
//           email_confirm: true,
//           user_metadata: {
//             first_name: enrollmentData.firstName,
//             last_name: enrollmentData.lastName,
//             role: 'student'
//           }
//         });

//         if (authError) {
//           console.error('❌ Auth error:', authError);
//           return res.status(400).json({
//             success: false,
//             error: `Account creation failed: ${authError.message}`
//           });
//         }

//         if (!authData.user) {
//           return res.status(500).json({
//             success: false,
//             error: 'Failed to create user account'
//           });
//         }

//         userId = authData.user.id;
//         console.log('✅ User account created:', userId);

//         // 2. Create user profile
//         const userProfile = enrollmentService.formatUserProfile(enrollmentData, userId);
//         const { error: userError } = await supabase
//           .from('users')
//           .insert(userProfile);

//         if (userError) {
//           console.error('❌ User profile error:', userError);
//           return res.status(500).json({
//             success: false,
//             error: `User profile creation failed: ${userError.message}`
//           });
//         }

//         // 3. Create student profile
//         const studentProfile = enrollmentService.formatStudentProfile(enrollmentData, userId);
//         const { error: profileError } = await supabase
//           .from('student_profiles')
//           .insert(studentProfile);

//         if (profileError) {
//           console.error('❌ Student profile error:', profileError);
//           return res.status(500).json({
//             success: false,
//             error: `Student profile creation failed: ${profileError.message}`
//           });
//         }

//         // Store the generated password for email
//         enrollmentData.generatedPassword = generatedPassword;
//       }

//       // 4. Generate payment reference
//       const paymentReference = enrollmentService.generatePaymentReference(isFree);

//       // 5. Create enrollment record
//       const enrollmentDataToInsert = enrollmentService.formatEnrollmentData(
//         enrollmentData, 
//         userId, 
//         isFree, 
//         paymentReference
//       );

//       const { data: enrollmentRecord, error: enrollmentError } = await supabase
//         .from('enrollments')
//         .insert(enrollmentDataToInsert)
//         .select(`
//           *,
//           users (first_name, last_name, email)
//         `)
//         .single();

//       if (enrollmentError) {
//         console.error('❌ Enrollment error:', enrollmentError);
//         return res.status(500).json({
//           success: false,
//           error: `Enrollment creation failed: ${enrollmentError.message}`
//         });
//       }

//       console.log('✅ Enrollment created successfully:', enrollmentRecord.id);

//       // 6. Queue email notifications (non-blocking - don't await)
//       enrollmentEmailService.queueEnrollmentEmails(enrollmentData, {
//         isNewUser,
//         isFree,
//         userId,
//         enrollmentId: enrollmentRecord.id,
//         password: enrollmentData.generatedPassword
//       }).catch(error => {
//         console.error('❌ Email queueing failed (non-critical):', error);
//       });

//       // 7. Return success response
//       return res.status(201).json({
//         success: true,
//         data: {
//           userId,
//           enrollment: enrollmentRecord,
//           paymentReference,
//           isNewUser,
//           isFreeCourse: isFree
//         },
//         message: isFree 
//           ? 'Free course enrollment submitted successfully! Check your email for access instructions.'
//           : 'Enrollment submitted successfully! Please complete your payment to activate your course.'
//       });

//     } catch (error) {
//       console.error('🔥 Enrollment error:', error);
//       return res.status(500).json({
//         success: false,
//         error: error.message || 'Enrollment failed',
//         ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
//       });
//     }
//   }

//   /**
//    * Get enrollment by ID
//    */
//   async getEnrollment(req, res) {
//     try {
//       const { id } = req.params;

//       const { data: enrollment, error } = await supabase
//         .from('enrollments')
//         .select(`
//           *,
//           users (id, email, first_name, last_name, phone),
//           student_profiles (*)
//         `)
//         .eq('id', id)
//         .single();

//       if (error) {
//         return res.status(404).json({
//           success: false,
//           error: 'Enrollment not found'
//         });
//       }

//       return res.status(200).json({
//         success: true,
//         data: enrollment
//       });
//     } catch (error) {
//       console.error('❌ Get enrollment error:', error);
//       return res.status(500).json({
//         success: false,
//         error: error.message
//       });
//     }
//   }

//   /**
//    * Update enrollment status
//    */
//   async updateEnrollmentStatus(req, res) {
//     try {
//       const { id } = req.params;
//       const { enrollment_status, payment_status } = req.body;

//       const updates = {
//         updated_at: new Date().toISOString()
//       };
      
//       if (enrollment_status) updates.enrollment_status = enrollment_status;
//       if (payment_status) updates.payment_status = payment_status;

//       const { data: enrollment, error } = await supabase
//         .from('enrollments')
//         .update(updates)
//         .eq('id', id)
//         .select(`
//           *,
//           users (id, email, first_name, last_name)
//         `)
//         .single();

//       if (error) {
//         return res.status(400).json({
//           success: false,
//           error: error.message
//         });
//       }

//       // If enrollment is activated, send activation email
//       if (enrollment_status === 'active' && enrollment.users) {
//         // Queue activation email (non-blocking)
//         enrollmentEmailService.queueEnrollmentActivationEmail(
//           {
//             email: enrollment.users.email,
//             firstName: enrollment.users.first_name
//           },
//           {
//             course_name: enrollment.course_name,
//             course_id: enrollment.course_id
//           },
//           enrollment.id
//         ).catch(error => {
//           console.error('❌ Activation email queueing failed:', error);
//         });
//       }

//       return res.status(200).json({
//         success: true,
//         data: enrollment,
//         message: 'Enrollment status updated successfully'
//       });
//     } catch (error) {
//       console.error('❌ Update enrollment error:', error);
//       return res.status(500).json({
//         success: false,
//         error: error.message
//       });
//     }
//   }

//   /**
//    * Get enrollments by user ID
//    */
//   async getUserEnrollments(req, res) {
//     try {
//       const { userId } = req.params;

//       const { data: enrollments, error } = await supabase
//         .from('enrollments')
//         .select(`
//           *,
//           users (first_name, last_name, email)
//         `)
//         .eq('user_id', userId)
//         .order('created_at', { ascending: false });

//       if (error) {
//         throw error;
//       }

//       return res.status(200).json({
//         success: true,
//         data: enrollments
//       });
//     } catch (error) {
//       console.error('❌ Get user enrollments error:', error);
//       return res.status(500).json({
//         success: false,
//         error: error.message
//       });
//     }
//   }

//   /**
//    * Handle Paystack payment verification callback
//    */
//   async handlePaymentVerification(req, res) {
//     try {
//       const { reference, enrollmentId } = req.body;

//       // TODO: Verify payment with Paystack
//       // const paystackVerification = await verifyPaystackPayment(reference);
      
//       // Update enrollment payment status
//       const { data: enrollment, error } = await supabase
//         .from('enrollments')
//         .update({
//           payment_status: 'completed',
//           payment_reference: reference,
//           updated_at: new Date().toISOString()
//         })
//         .eq('id', enrollmentId)
//         .select(`
//           *,
//           users (id, email, first_name, last_name)
//         `)
//         .single();

//       if (error) {
//         throw error;
//       }

//       // Queue payment confirmation email
//       if (enrollment.users) {
//         await enrollmentEmailService.queuePaymentConfirmationEmail(
//           {
//             email: enrollment.users.email,
//             firstName: enrollment.users.first_name,
//             course: enrollment.course_name
//           },
//           {
//             amount: enrollment.course_fee,
//             reference: reference
//           },
//           enrollment.id
//         );
//       }

//       return res.status(200).json({
//         success: true,
//         message: 'Payment verified and enrollment updated',
//         data: enrollment
//       });
//     } catch (error) {
//       console.error('❌ Payment verification error:', error);
//       return res.status(500).json({
//         success: false,
//         error: error.message
//       });
//     }
//   }
// }

// module.exports = new EnrollmentController();