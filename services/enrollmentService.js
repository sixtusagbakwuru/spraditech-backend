const crypto = require('crypto');
const bcrypt = require('bcryptjs');

class EnrollmentService {
  /**
   * Generate a secure temporary password
   */
  generateTemporaryPassword() {
    // Generate a secure random password: 12 chars with uppercase, lowercase, numbers, special chars
    const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const lowercase = 'abcdefghijklmnopqrstuvwxyz';
    const numbers = '0123456789';
    const special = '!@#$%&*';
    
    const allChars = uppercase + lowercase + numbers + special;
    let password = '';
    
    // Ensure at least one of each type
    password += uppercase[Math.floor(Math.random() * uppercase.length)];
    password += lowercase[Math.floor(Math.random() * lowercase.length)];
    password += numbers[Math.floor(Math.random() * numbers.length)];
    password += special[Math.floor(Math.random() * special.length)];
    
    // Add 8 more random characters
    for (let i = 0; i < 8; i++) {
      password += allChars[Math.floor(Math.random() * allChars.length)];
    }
    
    // Shuffle the password
    return password.split('').sort(() => Math.random() - 0.5).join('');
  }

  /**
   * Hash a password using bcrypt
   */
  async hashPassword(password) {
    const saltRounds = 10;
    return await bcrypt.hash(password, saltRounds);
  }

  /**
   * Verify password (useful for login)
   */
  async verifyPassword(plainPassword, hashedPassword) {
    return await bcrypt.compare(plainPassword, hashedPassword);
  }

  /**
   * Generate payment reference
   */
  generatePaymentReference(isFree = false) {
    const timestamp = Date.now();
    const random = crypto.randomBytes(4).toString('hex').toUpperCase();
    return isFree 
      ? `FREE-${timestamp}-${random}` 
      : `SPR-${timestamp}-${random}`;
  }

  /**
   * Check if course is free
   */
  isCourseFree(courseFee) {
    return courseFee === 0 || courseFee === '0' || courseFee === 0.0;
  }

  /**
   * Validate enrollment data
   */
  validateEnrollmentData(data) {
    const errors = [];
    
    if (!data.email) errors.push('Email is required');
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
      errors.push('Invalid email format');
    }
    
    if (!data.firstName) errors.push('First name is required');
    if (!data.lastName) errors.push('Last name is required');
    if (!data.course) errors.push('Course is required');
    if (!data.learningFormat) errors.push('Learning format is required');
    
    // Validate phone if provided
    if (data.phone && !/^[\d\s\+\-\(\)]{10,15}$/.test(data.phone)) {
      errors.push('Invalid phone number format');
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Format enrollment data for database
   */
  formatEnrollmentData(data, userId, isFree, paymentReference) {
    const now = new Date().toISOString();
    
    return {
      user_id: userId,
      course_name: data.course,
      course_id: data.courseId || null,
      learning_format: data.learningFormat,
      preferred_schedule: data.preferredSchedule || (data.learningFormat === 'self-paced' ? 'self-paced' : null),
      learning_goals: data.learningGoals || null,
      
      // Payment information
      course_fee: isFree ? 0 : (parseFloat(data.courseFee) || 0),
      amount_paid: isFree ? 0 : (parseFloat(data.amountPaid) || 0),
      remaining_balance: isFree ? 0 : (parseFloat(data.remainingBalance) || parseFloat(data.courseFee) || 0),
      next_payment_date: data.nextPaymentDate || null,
      payment_schedule: data.paymentSchedule || null,
      course_duration: data.courseDuration || null,
      
      // Payment method and plan
      payment_method: isFree ? 'free' : (data.paymentMethod || 'bank_transfer'),
      payment_plan: isFree ? 'free' : (data.paymentPlan || 'full'),
      
      // Status management
      payment_status: isFree 
        ? 'free' 
        : data.paymentMethod === 'paystack' 
          ? 'pending' 
          : 'awaiting_payment',
      enrollment_status: isFree ? 'active' : 'pending',
      payment_reference: isFree ? 'free' : paymentReference,
      
      // Timestamps
      created_at: now,
      updated_at: now
    };
  }

  /**
   * Format user profile data with hashed password
   */
  async formatUserProfile(data, userId, plainPassword) {
    const now = new Date().toISOString();
    const hashedPassword = await this.hashPassword(plainPassword);
    
    return {
      id: userId,
      email: data.email,
      password: hashedPassword, // Store hashed password
      role: 'student',
      first_name: data.firstName,
      last_name: data.lastName,
      phone: data.phone || null,
      address: data.address || null,
      city: data.city || null,
      state: data.state || null,
      country: data.country || null,
      date_of_birth: data.dateOfBirth || null,
      created_at: now,
      updated_at: now
    };
  }

  /**
   * Format student profile data
   */
  formatStudentProfile(data, userId) {
    const now = new Date().toISOString();
    
    return {
      user_id: userId,
      highest_education: data.highestEducation || null,
      institution: data.institution || null,
      graduation_year: data.graduationYear ? parseInt(data.graduationYear) : null,
      field_of_study: data.fieldOfStudy || null,
      employment_status: data.employmentStatus || null,
      current_job: data.currentJob || null,
      company: data.company || null,
      experience: data.experience || null,
      tech_background: data.techBackground || null,
      how_did_you_hear: data.howDidYouHear || null,
      additional_info: data.additionalInfo || null,
      created_at: now,
      updated_at: now
    };
  }
}

module.exports = new EnrollmentService();



// const crypto = require('crypto');

// class EnrollmentService {
//   /**
//    * Generate a secure temporary password
//    */
//   generateTemporaryPassword() {
//     // Generate a secure random password: 12 chars with uppercase, lowercase, numbers, special chars
//     const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
//     const lowercase = 'abcdefghijklmnopqrstuvwxyz';
//     const numbers = '0123456789';
//     const special = '!@#$%&*';
    
//     const allChars = uppercase + lowercase + numbers + special;
//     let password = '';
    
//     // Ensure at least one of each type
//     password += uppercase[Math.floor(Math.random() * uppercase.length)];
//     password += lowercase[Math.floor(Math.random() * lowercase.length)];
//     password += numbers[Math.floor(Math.random() * numbers.length)];
//     password += special[Math.floor(Math.random() * special.length)];
    
//     // Add 8 more random characters
//     for (let i = 0; i < 8; i++) {
//       password += allChars[Math.floor(Math.random() * allChars.length)];
//     }
    
//     // Shuffle the password
//     return password.split('').sort(() => Math.random() - 0.5).join('');
//   }

//   /**
//    * Generate payment reference
//    */
//   generatePaymentReference(isFree = false) {
//     const timestamp = Date.now();
//     const random = crypto.randomBytes(4).toString('hex').toUpperCase();
//     return isFree 
//       ? `FREE-${timestamp}-${random}` 
//       : `SPR-${timestamp}-${random}`;
//   }

//   /**
//    * Check if course is free
//    */
//   isCourseFree(courseFee) {
//     return courseFee === 0 || courseFee === '0' || courseFee === 0.0;
//   }

//   /**
//    * Validate enrollment data
//    */
//   validateEnrollmentData(data) {
//     const errors = [];
    
//     if (!data.email) errors.push('Email is required');
//     else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
//       errors.push('Invalid email format');
//     }
    
//     if (!data.firstName) errors.push('First name is required');
//     if (!data.lastName) errors.push('Last name is required');
//     if (!data.course) errors.push('Course is required');
//     if (!data.learningFormat) errors.push('Learning format is required');
    
//     // Validate phone if provided
//     if (data.phone && !/^[\d\s\+\-\(\)]{10,15}$/.test(data.phone)) {
//       errors.push('Invalid phone number format');
//     }
    
//     return {
//       isValid: errors.length === 0,
//       errors
//     };
//   }

//   /**
//    * Format enrollment data for database
//    */
//   formatEnrollmentData(data, userId, isFree, paymentReference) {
//     const now = new Date().toISOString();
    
//     return {
//       user_id: userId,
//       course_name: data.course,
//       course_id: data.courseId || null,
//       learning_format: data.learningFormat,
//       preferred_schedule: data.preferredSchedule || (data.learningFormat === 'self-paced' ? 'self-paced' : null),
//       learning_goals: data.learningGoals || null,
      
//       // Payment information
//       course_fee: isFree ? 0 : (parseFloat(data.courseFee) || 0),
//       amount_paid: isFree ? 0 : (parseFloat(data.amountPaid) || 0),
//       remaining_balance: isFree ? 0 : (parseFloat(data.remainingBalance) || parseFloat(data.courseFee) || 0),
//       next_payment_date: data.nextPaymentDate || null,
//       payment_schedule: data.paymentSchedule || null,
//       course_duration: data.courseDuration || null,
      
//       // Payment method and plan
//       payment_method: isFree ? 'free' : (data.paymentMethod || 'bank_transfer'),
//       payment_plan: isFree ? 'free' : (data.paymentPlan || 'full'),
      
//       // Status management
//       payment_status: isFree 
//         ? 'free' 
//         : data.paymentMethod === 'paystack' 
//           ? 'pending' 
//           : 'awaiting_payment',
//       enrollment_status: isFree ? 'active' : 'pending',
//       payment_reference: isFree ? 'free' : paymentReference,
      
//       // Timestamps
//       created_at: now,
//       updated_at: now
//     };
//   }

//   /**
//    * Format user profile data
//    */
//   formatUserProfile(data, userId) {
//     const now = new Date().toISOString();
    
//     return {
//       id: userId,
//       email: data.email,
//       role: 'student',
//       first_name: data.firstName,
//       last_name: data.lastName,
//       phone: data.phone || null,
//       address: data.address || null,
//       city: data.city || null,
//       state: data.state || null,
//       country: data.country || null,
//       date_of_birth: data.dateOfBirth || null,
//       created_at: now,
//       updated_at: now
//     };
//   }

//   /**
//    * Format student profile data
//    */
//   formatStudentProfile(data, userId) {
//     const now = new Date().toISOString();
    
//     return {
//       user_id: userId,
//       highest_education: data.highestEducation || null,
//       institution: data.institution || null,
//       graduation_year: data.graduationYear ? parseInt(data.graduationYear) : null,
//       field_of_study: data.fieldOfStudy || null,
//       employment_status: data.employmentStatus || null,
//       current_job: data.currentJob || null,
//       company: data.company || null,
//       experience: data.experience || null,
//       tech_background: data.techBackground || null,
//       how_did_you_hear: data.howDidYouHear || null,
//       additional_info: data.additionalInfo || null,
//       created_at: now,
//       updated_at: now
//     };
//   }
// }

// module.exports = new EnrollmentService();