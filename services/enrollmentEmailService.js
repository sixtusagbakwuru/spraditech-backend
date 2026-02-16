const emailQueue = require('../queues/emailQueue');
const emailLogger = require('./emailLogger');

class EnrollmentEmailService {
  /**
   * Queue enrollment emails using your existing BullMQ queue
   */
  async queueEnrollmentEmails(enrollmentData, options) {
    const { isNewUser, isFree, userId, enrollmentId, password } = options;
    const queuedJobs = [];

    try {
      // Queue welcome email for new users
      if (isNewUser) {
        const welcomeEmail = await this.queueWelcomeEmail(enrollmentData, password, enrollmentId);
        queuedJobs.push(welcomeEmail);
      }

      // Queue enrollment confirmation email for free courses
      if (isFree) {
        const confirmationEmail = await this.queueFreeCourseEmail(enrollmentData, enrollmentId);
        queuedJobs.push(confirmationEmail);
      } else if (enrollmentData.paymentMethod === 'paystack') {
        console.log('💰 Paystack payment - email will be queued after payment verification');
      }

      // Queue admin notification email
      const adminEmail = await this.queueAdminNotificationEmail(enrollmentData, {
        isNewUser,
        isFree,
        userId,
        enrollmentId
      });
      queuedJobs.push(adminEmail);

      console.log(`✅ Queued ${queuedJobs.length} email jobs for enrollment ${enrollmentId}`);
      return { success: true, queuedJobs };
    } catch (error) {
      console.error('❌ Error queueing enrollment emails:', error);
      // Don't throw - we don't want to fail the enrollment if email fails
      return { success: false, error: error.message };
    }
  }

  /**
   * Queue welcome email for new users
   */
  async queueWelcomeEmail(enrollmentData, password, enrollmentId) {
    const emailContent = this.generateWelcomeEmailContent(enrollmentData, password);
    
    // Store metadata in events_history JSONB column
    const eventsHistory = [{
      type: 'welcome_email_queued',
      userId: enrollmentData.userId,
      firstName: enrollmentData.firstName,
      lastName: enrollmentData.lastName,
      email: enrollmentData.email,
      enrollmentId: enrollmentId,
      timestamp: new Date().toISOString()
    }];

    // Create email log entry - using NULL for enquiry_id since this is an enrollment, not an enquiry
    const logEntry = await emailLogger.logEmail({
      enquiry_id: null,
      to_email: enrollmentData.email,
      subject: emailContent.subject,
      status: 'PENDING',
      provider: 'resend',
      attempts: 0,
      events_history: JSON.stringify(eventsHistory)
    });

    if (!logEntry || !logEntry.id) {
      console.error('❌ Failed to create email log entry - logEntry:', logEntry);
      throw new Error('Failed to create email log entry');
    }

    // Add job to queue
    const job = await emailQueue.add('send-email', {
      logId: logEntry.id,
      email: {
        to: enrollmentData.email,
        subject: emailContent.subject,
        html: emailContent.html,
        text: emailContent.text
      }
    });

    console.log(`📧 Welcome email queued for ${enrollmentData.email} - Job ID: ${job.id}, Log ID: ${logEntry.id}`);
    return { jobId: job.id, logId: logEntry.id };
  }

  /**
   * Queue free course enrollment confirmation email
   */
  async queueFreeCourseEmail(enrollmentData, enrollmentId) {
    const emailContent = this.generateFreeCourseEmailContent(enrollmentData);
    
    const eventsHistory = [{
      type: 'free_course_confirmation_queued',
      courseName: enrollmentData.course,
      learningFormat: enrollmentData.learningFormat,
      firstName: enrollmentData.firstName,
      lastName: enrollmentData.lastName,
      email: enrollmentData.email,
      enrollmentId: enrollmentId,
      timestamp: new Date().toISOString()
    }];

    const logEntry = await emailLogger.logEmail({
      enquiry_id: null,
      to_email: enrollmentData.email,
      subject: emailContent.subject,
      status: 'PENDING',
      provider: 'resend',
      attempts: 0,
      events_history: JSON.stringify(eventsHistory)
    });

    if (!logEntry || !logEntry.id) {
      console.error('❌ Failed to create email log entry - logEntry:', logEntry);
      throw new Error('Failed to create email log entry');
    }

    const job = await emailQueue.add('send-email', {
      logId: logEntry.id,
      email: {
        to: enrollmentData.email,
        subject: emailContent.subject,
        html: emailContent.html,
        text: emailContent.text
      }
    });

    console.log(`📧 Free course confirmation email queued for ${enrollmentData.email} - Job ID: ${job.id}`);
    return { jobId: job.id, logId: logEntry.id };
  }

  /**
   * Queue admin notification email
   */
  async queueAdminNotificationEmail(enrollmentData, metadata) {
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@spraditech.ng';
    const emailContent = this.generateAdminNotificationEmail(enrollmentData, metadata);
    
    const eventsHistory = [{
      type: 'admin_notification_queued',
      ...metadata,
      studentName: `${enrollmentData.firstName} ${enrollmentData.lastName}`,
      studentEmail: enrollmentData.email,
      course: enrollmentData.course,
      learningFormat: enrollmentData.learningFormat,
      timestamp: new Date().toISOString()
    }];

    const logEntry = await emailLogger.logEmail({
      enquiry_id: null,
      to_email: adminEmail,
      subject: emailContent.subject,
      status: 'PENDING',
      provider: 'resend',
      attempts: 0,
      events_history: JSON.stringify(eventsHistory)
    });

    if (!logEntry || !logEntry.id) {
      console.error('❌ Failed to create admin email log entry - logEntry:', logEntry);
      throw new Error('Failed to create admin email log entry');
    }

    const job = await emailQueue.add('send-email', {
      logId: logEntry.id,
      email: {
        to: adminEmail,
        subject: emailContent.subject,
        html: emailContent.html,
        text: emailContent.text
      }
    });

    console.log(`📧 Admin notification email queued - Job ID: ${job.id}`);
    return { jobId: job.id, logId: logEntry.id };
  }

  /**
   * Queue payment confirmation email (called after Paystack verification)
   */
  async queuePaymentConfirmationEmail(enrollmentData, paymentData, enrollmentId) {
    const emailContent = this.generatePaymentConfirmationEmail(enrollmentData, paymentData);
    
    const eventsHistory = [{
      type: 'payment_confirmation_queued',
      amount: paymentData.amount,
      reference: paymentData.reference,
      courseName: enrollmentData.course,
      firstName: enrollmentData.firstName,
      lastName: enrollmentData.lastName,
      email: enrollmentData.email,
      enrollmentId: enrollmentId,
      timestamp: new Date().toISOString()
    }];

    const logEntry = await emailLogger.logEmail({
      enquiry_id: null,
      to_email: enrollmentData.email,
      subject: emailContent.subject,
      status: 'PENDING',
      provider: 'resend',
      attempts: 0,
      events_history: JSON.stringify(eventsHistory)
    });

    if (!logEntry || !logEntry.id) {
      console.error('❌ Failed to create payment email log entry - logEntry:', logEntry);
      throw new Error('Failed to create payment email log entry');
    }

    const job = await emailQueue.add('send-email', {
      logId: logEntry.id,
      email: {
        to: enrollmentData.email,
        subject: emailContent.subject,
        html: emailContent.html,
        text: emailContent.text
      }
    });

    console.log(`📧 Payment confirmation email queued - Job ID: ${job.id}`);
    return { jobId: job.id, logId: logEntry.id };
  }

  /**
   * Queue enrollment activation email
   */
  async queueEnrollmentActivationEmail(userData, enrollmentData, enrollmentId) {
    const emailContent = this.generateEnrollmentActivationEmail(userData, enrollmentData);
    
    const eventsHistory = [{
      type: 'enrollment_activation_queued',
      courseName: enrollmentData.course_name,
      courseId: enrollmentData.course_id,
      firstName: userData.firstName,
      email: userData.email,
      enrollmentId: enrollmentId,
      timestamp: new Date().toISOString()
    }];

    const logEntry = await emailLogger.logEmail({
      enquiry_id: null,
      to_email: userData.email,
      subject: emailContent.subject,
      status: 'PENDING',
      provider: 'resend',
      attempts: 0,
      events_history: JSON.stringify(eventsHistory)
    });

    if (!logEntry || !logEntry.id) {
      console.error('❌ Failed to create activation email log entry - logEntry:', logEntry);
      throw new Error('Failed to create activation email log entry');
    }

    const job = await emailQueue.add('send-email', {
      logId: logEntry.id,
      email: {
        to: userData.email,
        subject: emailContent.subject,
        html: emailContent.html,
        text: emailContent.text
      }
    });

    console.log(`📧 Enrollment activation email queued for ${userData.email} - Job ID: ${job.id}`);
    return { jobId: job.id, logId: logEntry.id };
  }

  /**
   * Generate welcome email content
   */
  generateWelcomeEmailContent(data, password) {
    return {
      subject: 'Welcome to Spraditech - Your Account Has Been Created',
      html: this.generateWelcomeEmailHTML(data, password),
      text: `Welcome to Spraditech! Your account has been created successfully.\n\nEmail: ${data.email}\nPassword: ${password}\n\nLogin here: ${process.env.APP_URL}/login`
    };
  }

  /**
   * Generate free course enrollment email content
   */
  generateFreeCourseEmailContent(data) {
    return {
      subject: 'Free Course Enrollment Confirmed - Welcome to Spraditech!',
      html: this.generateFreeCourseEmailHTML(data),
      text: `Your enrollment in ${data.course} has been confirmed!\n\nYour course is now active and you can access it immediately from your dashboard.\n\nDashboard: ${process.env.APP_URL}/dashboard/my-courses`
    };
  }

  /**
   * Generate admin notification email content
   */
  generateAdminNotificationEmail(data, metadata) {
    const enrollmentType = metadata.isFree ? 'FREE COURSE' : 'PAID COURSE';
    const userType = metadata.isNewUser ? 'NEW USER' : 'EXISTING USER';
    
    return {
      subject: `New Enrollment: ${data.course} - ${data.firstName} ${data.lastName} (${enrollmentType})`,
      html: this.generateAdminNotificationHTML(data, metadata),
      text: `
        New Enrollment Received!
        
        Course: ${data.course}
        Student: ${data.firstName} ${data.lastName}
        Email: ${data.email}
        Phone: ${data.phone || 'Not provided'}
        Type: ${enrollmentType}
        User Type: ${userType}
        Enrollment ID: ${metadata.enrollmentId}
        
        View details: ${process.env.APP_URL}/admin/enrollments/${metadata.enrollmentId}
      `
    };
  }

  /**
   * Generate payment confirmation email content
   */
  generatePaymentConfirmationEmail(data, paymentData) {
    return {
      subject: `Payment Confirmed for ${data.course} - Spraditech`,
      html: this.generatePaymentConfirmationHTML(data, paymentData),
      text: `
        Payment Confirmed!
        
        Course: ${data.course}
        Amount: ₦${paymentData.amount}
        Reference: ${paymentData.reference}
        
        Your enrollment will be activated within 24 hours.
      `
    };
  }

  /**
   * Generate enrollment activation email content
   */
  generateEnrollmentActivationEmail(userData, enrollmentData) {
    return {
      subject: `Your ${enrollmentData.course_name} Course is Now Active!`,
      html: this.generateEnrollmentActivationHTML(userData, enrollmentData),
      text: `
        Great news! Your enrollment in ${enrollmentData.course_name} has been activated.
        
        You now have full access to all course materials.
        
        Start learning: ${process.env.APP_URL}/dashboard/courses/${enrollmentData.course_id}
      `
    };
  }

  /**
   * HTML Template: Welcome Email
   */
  generateWelcomeEmailHTML(data, password) {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #1a202c; margin: 0; padding: 0; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 40px 30px; text-align: center; border-radius: 12px 12px 0 0; }
          .header h1 { margin: 0; font-size: 28px; font-weight: 600; }
          .content { padding: 40px 30px; background: #ffffff; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 12px 12px; }
          .credentials { background: #f7fafc; padding: 24px; border-radius: 8px; margin: 24px 0; border-left: 4px solid #667eea; }
          .credentials h3 { margin-top: 0; color: #2d3748; }
          .password-box { background: #edf2f7; padding: 12px; border-radius: 6px; font-family: monospace; font-size: 16px; word-break: break-all; }
          .button { background: #667eea; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; display: inline-block; margin-top: 20px; font-weight: 500; }
          .button:hover { background: #5a67d8; }
          .footer { padding: 30px; text-align: center; font-size: 14px; color: #718096; background: #f7fafc; border-radius: 12px; margin-top: 20px; }
          .footer a { color: #667eea; text-decoration: none; }
          .warning { color: #e53e3e; font-size: 14px; margin-top: 16px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🎓 Welcome to Spraditech!</h1>
            <p style="font-size: 18px; margin-top: 10px; opacity: 0.95;">Your learning journey begins here</p>
          </div>
          <div class="content">
            <h2 style="margin-top: 0; color: #2d3748;">Hello ${data.firstName},</h2>
            <p style="font-size: 16px;">Your Spraditech account has been created successfully! We're excited to have you on board.</p>
            
            <div class="credentials">
              <h3 style="margin-top: 0;">🔐 Your Login Credentials</h3>
              <p style="margin-bottom: 8px;"><strong>Email:</strong> ${data.email}</p>
              <p style="margin-bottom: 8px;"><strong>Password:</strong></p>
              <div class="password-box">${password}</div>
              <p class="warning">⚠️ Please change your password after first login for security.</p>
            </div>
            
            <p style="font-size: 16px;">You can now access your student dashboard and track your enrollment progress.</p>
            
            <div style="text-align: center;">
              <a href="${process.env.APP_URL}/login" class="button">🚀 Login to Dashboard</a>
            </div>
            
            <div style="margin-top: 32px; padding-top: 24px; border-top: 1px solid #e2e8f0;">
              <p style="margin: 0; color: #4a5568;"><strong>Need help?</strong> Contact our support team at <a href="mailto:support@spraditech.ng" style="color: #667eea;">support@spraditech.ng</a></p>
            </div>
          </div>
          <div class="footer">
            <p style="margin: 0 0 8px 0;">&copy; ${new Date().getFullYear()} Spraditech Digital Solutions. All rights reserved.</p>
            <p style="margin: 0;">Spraditech.ng | Empowering Digital Excellence</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  /**
   * HTML Template: Free Course Enrollment Confirmation
   */
  generateFreeCourseEmailHTML(data) {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #1a202c; margin: 0; padding: 0; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #38a169 0%, #2f855a 100%); color: white; padding: 40px 30px; text-align: center; border-radius: 12px 12px 0 0; }
          .header h1 { margin: 0; font-size: 28px; }
          .content { padding: 40px 30px; background: #ffffff; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 12px 12px; }
          .course-details { background: #f7fafc; padding: 24px; border-radius: 8px; margin: 24px 0; border-left: 4px solid #38a169; }
          .badge { background: #c6f6d5; color: #22543d; padding: 8px 16px; border-radius: 20px; font-size: 14px; font-weight: 600; display: inline-block; }
          .button { background: #38a169; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; display: inline-block; margin-top: 20px; font-weight: 500; }
          .button:hover { background: #2f855a; }
          .footer { padding: 30px; text-align: center; font-size: 14px; color: #718096; background: #f7fafc; border-radius: 12px; margin-top: 20px; }
          .step-list { margin: 24px 0; padding: 0; list-style: none; }
          .step-list li { margin-bottom: 12px; padding-left: 28px; position: relative; }
          .step-list li:before { content: "✓"; position: absolute; left: 0; color: #38a169; font-weight: bold; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🎉 Enrollment Confirmed!</h1>
            <p style="font-size: 18px; margin-top: 10px; opacity: 0.95;">Your free course is ready to start</p>
          </div>
          <div class="content">
            <h2 style="margin-top: 0; color: #2d3748;">Hello ${data.firstName},</h2>
            <p style="font-size: 16px;">Great news! Your enrollment in <strong style="color: #38a169;">${data.course}</strong> has been confirmed and is now active.</p>
            
            <div class="course-details">
              <span class="badge">✅ ACTIVE</span>
              <h3 style="margin: 16px 0 8px 0; color: #2d3748;">Course Information</h3>
              <p style="margin: 8px 0;"><strong>Course:</strong> ${data.course}</p>
              <p style="margin: 8px 0;"><strong>Learning Format:</strong> ${data.learningFormat || 'Self-paced'}</p>
              <p style="margin: 8px 0;"><strong>Access:</strong> Immediate</p>
            </div>
            
            <p style="font-size: 16px;">You can immediately access your course materials from your student dashboard.</p>
            
            <h3 style="color: #2d3748;">📋 What's next?</h3>
            <ul class="step-list">
              <li>Log in to your student dashboard</li>
              <li>Navigate to "My Courses" section</li>
              <li>Click on "${data.course}" to start learning</li>
              <li>Track your progress and earn your certificate</li>
            </ul>
            
            <div style="text-align: center;">
              <a href="${process.env.APP_URL}/dashboard/my-courses" class="button">📚 Access Your Course →</a>
            </div>
            
            <div style="margin-top: 32px; padding-top: 24px; border-top: 1px solid #e2e8f0;">
              <p style="margin: 0; color: #4a5568;"><strong>Questions?</strong> Contact us at <a href="mailto:support@spraditech.ng" style="color: #38a169;">support@spraditech.ng</a></p>
            </div>
          </div>
          <div class="footer">
            <p style="margin: 0 0 8px 0;">&copy; ${new Date().getFullYear()} Spraditech Digital Solutions. All rights reserved.</p>
            <p style="margin: 0;">Spraditech.ng | Empowering Digital Excellence</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  /**
   * HTML Template: Admin Notification
   */
  generateAdminNotificationHTML(data, metadata) {
    const enrollmentType = metadata.isFree ? 'FREE' : 'PAID';
    const userType = metadata.isNewUser ? 'NEW' : 'EXISTING';
    
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #1a202c; margin: 0; padding: 0; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #1a202c; color: white; padding: 40px 30px; text-align: center; border-radius: 12px 12px 0 0; }
          .header h1 { margin: 0; font-size: 28px; }
          .content { padding: 40px 30px; background: #ffffff; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 12px 12px; }
          .info-box { background: #f7fafc; padding: 24px; border-radius: 8px; margin: 24px 0; border-left: 4px solid #4299e1; }
          .badge { display: inline-block; padding: 8px 16px; border-radius: 20px; font-size: 14px; font-weight: 600; margin-right: 8px; }
          .badge-free { background: #c6f6d5; color: #22543d; }
          .badge-paid { background: #feebc8; color: #744210; }
          .badge-new { background: #bee3f8; color: #2c5282; }
          .badge-existing { background: #e9d8fd; color: #553c9a; }
          .button { background: #4299e1; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; display: inline-block; margin-top: 20px; font-weight: 500; }
          .footer { padding: 30px; text-align: center; font-size: 14px; color: #718096; background: #f7fafc; border-radius: 12px; margin-top: 20px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>📋 New Enrollment Submission</h1>
            <p style="font-size: 18px; margin-top: 10px; opacity: 0.95;">Action Required</p>
          </div>
          <div class="content">
            <div style="margin-bottom: 24px;">
              <span class="badge ${metadata.isFree ? 'badge-free' : 'badge-paid'}">${enrollmentType} COURSE</span>
              <span class="badge ${metadata.isNewUser ? 'badge-new' : 'badge-existing'}">${userType} USER</span>
            </div>
            
            <div class="info-box">
              <h3 style="margin-top: 0; color: #2d3748;">👤 Student Information</h3>
              <table style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="padding: 8px 0;"><strong>Name:</strong></td>
                  <td style="padding: 8px 0;">${data.firstName} ${data.lastName}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0;"><strong>Email:</strong></td>
                  <td style="padding: 8px 0;"><a href="mailto:${data.email}" style="color: #4299e1;">${data.email}</a></td>
                </tr>
                <tr>
                  <td style="padding: 8px 0;"><strong>Phone:</strong></td>
                  <td style="padding: 8px 0;">${data.phone || 'Not provided'}</td>
                </tr>
              </table>
            </div>
            
            <div class="info-box">
              <h3 style="margin-top: 0; color: #2d3748;">📚 Course Information</h3>
              <table style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="padding: 8px 0;"><strong>Course:</strong></td>
                  <td style="padding: 8px 0;">${data.course}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0;"><strong>Format:</strong></td>
                  <td style="padding: 8px 0;">${data.learningFormat}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0;"><strong>Duration:</strong></td>
                  <td style="padding: 8px 0;">${data.courseDuration || 'Not specified'}</td>
                </tr>
                ${!metadata.isFree ? `
                <tr>
                  <td style="padding: 8px 0;"><strong>Course Fee:</strong></td>
                  <td style="padding: 8px 0;">₦${data.courseFee}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0;"><strong>Payment Method:</strong></td>
                  <td style="padding: 8px 0;">${data.paymentMethod || 'Not specified'}</td>
                </tr>
                ` : ''}
              </table>
            </div>
            
            <div class="info-box">
              <h3 style="margin-top: 0; color: #2d3748;">📋 Enrollment Details</h3>
              <table style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="padding: 8px 0;"><strong>Enrollment ID:</strong></td>
                  <td style="padding: 8px 0; font-family: monospace;">${metadata.enrollmentId}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0;"><strong>User ID:</strong></td>
                  <td style="padding: 8px 0; font-family: monospace;">${metadata.userId}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0;"><strong>Date:</strong></td>
                  <td style="padding: 8px 0;">${new Date().toLocaleString()}</td>
                </tr>
              </table>
            </div>
            
            <div style="text-align: center;">
              <a href="${process.env.APP_URL}/admin/enrollments/${metadata.enrollmentId}" class="button">🔍 View in Admin Dashboard</a>
            </div>
          </div>
          <div class="footer">
            <p style="margin: 0;">This is an automated notification from Spraditech Enrollment System</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  /**
   * HTML Template: Payment Confirmation
   */
  generatePaymentConfirmationHTML(data, paymentData) {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #1a202c; margin: 0; padding: 0; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 40px 30px; text-align: center; border-radius: 12px 12px 0 0; }
          .header h1 { margin: 0; font-size: 28px; }
          .content { padding: 40px 30px; background: #ffffff; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 12px 12px; }
          .payment-details { background: #f7fafc; padding: 24px; border-radius: 8px; margin: 24px 0; border-left: 4px solid #667eea; }
          .status-badge { background: #c6f6d5; color: #22543d; padding: 8px 16px; border-radius: 20px; font-size: 14px; font-weight: 600; display: inline-block; }
          .button { background: #667eea; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; display: inline-block; margin-top: 20px; font-weight: 500; }
          .footer { padding: 30px; text-align: center; font-size: 14px; color: #718096; background: #f7fafc; border-radius: 12px; margin-top: 20px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>💰 Payment Confirmed!</h1>
            <p style="font-size: 18px; margin-top: 10px; opacity: 0.95;">Thank you for your payment</p>
          </div>
          <div class="content">
            <h2 style="margin-top: 0; color: #2d3748;">Hello ${data.firstName},</h2>
            <p style="font-size: 16px;">Thank you for your payment! Your enrollment in <strong>${data.course}</strong> is now being processed.</p>
            
            <div class="payment-details">
              <span class="status-badge">✓ CONFIRMED</span>
              <h3 style="margin: 16px 0 8px 0; color: #2d3748;">Payment Details</h3>
              <table style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="padding: 8px 0;"><strong>Amount:</strong></td>
                  <td style="padding: 8px 0; font-size: 20px; font-weight: bold; color: #667eea;">₦${paymentData.amount}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0;"><strong>Reference:</strong></td>
                  <td style="padding: 8px 0; font-family: monospace;">${paymentData.reference}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0;"><strong>Date:</strong></td>
                  <td style="padding: 8px 0;">${new Date().toLocaleDateString()}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0;"><strong>Status:</strong></td>
                  <td style="padding: 8px 0;"><span style="background: #c6f6d5; color: #22543d; padding: 4px 12px; border-radius: 20px; font-size: 14px;">COMPLETED</span></td>
                </tr>
              </table>
            </div>
            
            <p style="font-size: 16px;">Your enrollment will be activated within 24 hours. You'll receive another email once your course is ready.</p>
            
            <div style="margin-top: 32px; padding-top: 24px; border-top: 1px solid #e2e8f0;">
              <p style="margin: 0; color: #4a5568;"><strong>Questions about your payment?</strong> Contact our support team at <a href="mailto:support@spraditech.ng" style="color: #667eea;">support@spraditech.ng</a></p>
            </div>
          </div>
          <div class="footer">
            <p style="margin: 0;">&copy; ${new Date().getFullYear()} Spraditech Digital Solutions. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  /**
   * HTML Template: Enrollment Activation
   */
  generateEnrollmentActivationHTML(userData, enrollmentData) {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #1a202c; margin: 0; padding: 0; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 40px 30px; text-align: center; border-radius: 12px 12px 0 0; }
          .header h1 { margin: 0; font-size: 28px; }
          .content { padding: 40px 30px; background: #ffffff; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 12px 12px; }
          .course-info { background: #f7fafc; padding: 24px; border-radius: 8px; margin: 24px 0; border-left: 4px solid #667eea; }
          .feature-list { margin: 24px 0; padding: 0; list-style: none; }
          .feature-list li { margin-bottom: 12px; padding-left: 28px; position: relative; }
          .feature-list li:before { content: "✓"; position: absolute; left: 0; color: #667eea; font-weight: bold; }
          .button { background: #667eea; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; display: inline-block; margin-top: 20px; font-weight: 500; }
          .footer { padding: 30px; text-align: center; font-size: 14px; color: #718096; background: #f7fafc; border-radius: 12px; margin-top: 20px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🚀 Your Course is Ready!</h1>
            <p style="font-size: 18px; margin-top: 10px; opacity: 0.95;">Start learning today</p>
          </div>
          <div class="content">
            <h2 style="margin-top: 0; color: #2d3748;">Hello ${userData.firstName},</h2>
            <p style="font-size: 16px;">Great news! Your enrollment in <strong style="color: #667eea;">${enrollmentData.course_name}</strong> has been activated.</p>
            
            <div class="course-info">
              <h3 style="margin-top: 0; color: #2d3748;">Course Access</h3>
              <p><strong>Course:</strong> ${enrollmentData.course_name}</p>
              <p><strong>Status:</strong> <span style="background: #c6f6d5; color: #22543d; padding: 4px 12px; border-radius: 20px;">ACTIVE</span></p>
              <p><strong>Access Period:</strong> Unlimited</p>
            </div>
            
            <h3 style="color: #2d3748;">📚 What you'll get:</h3>
            <ul class="feature-list">
              <li>Full access to all video lectures</li>
              <li>Practice exercises and projects</li>
              <li>Downloadable resources and materials</li>
              <li>Community discussion forums</li>
              <li>Certificate of completion</li>
            </ul>
            
            <div style="text-align: center;">
              <a href="${process.env.APP_URL}/dashboard/courses/${enrollmentData.course_id}" class="button">🎯 Start Learning Now →</a>
            </div>
            
            <div style="margin-top: 32px; padding-top: 24px; border-top: 1px solid #e2e8f0;">
              <p style="margin: 0; color: #4a5568;">Happy learning! If you have any questions, our support team is here to help.</p>
            </div>
          </div>
          <div class="footer">
            <p style="margin: 0;">&copy; ${new Date().getFullYear()} Spraditech Digital Solutions. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }
}

module.exports = new EnrollmentEmailService();


// const emailQueue = require('../queues/emailQueue');
// const emailLogger = require('./emailLogger');

// class EnrollmentEmailService {
//   /**
//    * Queue enrollment emails using your existing BullMQ queue
//    */
//   async queueEnrollmentEmails(enrollmentData, options) {
//     const { isNewUser, isFree, userId, enrollmentId, password } = options;
//     const queuedJobs = [];

//     try {
//       // Queue welcome email for new users
//       if (isNewUser) {
//         const welcomeEmail = await this.queueWelcomeEmail(enrollmentData, password, enrollmentId);
//         queuedJobs.push(welcomeEmail);
//       }

//       // Queue enrollment confirmation email for free courses
//       if (isFree) {
//         const confirmationEmail = await this.queueFreeCourseEmail(enrollmentData, enrollmentId);
//         queuedJobs.push(confirmationEmail);
//       } else if (enrollmentData.paymentMethod === 'paystack') {
//         console.log('💰 Paystack payment - email will be queued after payment verification');
//       }

//       // Queue admin notification email
//       const adminEmail = await this.queueAdminNotificationEmail(enrollmentData, {
//         isNewUser,
//         isFree,
//         userId,
//         enrollmentId
//       });
//       queuedJobs.push(adminEmail);

//       console.log(`✅ Queued ${queuedJobs.length} email jobs for enrollment ${enrollmentId}`);
//       return { success: true, queuedJobs };
//     } catch (error) {
//       console.error('❌ Error queueing enrollment emails:', error);
//       // Don't throw - we don't want to fail the enrollment if email fails
//       return { success: false, error: error.message };
//     }
//   }

//   /**
//    * Queue welcome email for new users
//    */
//   async queueWelcomeEmail(enrollmentData, password, enrollmentId) {
//     const emailContent = this.generateWelcomeEmailContent(enrollmentData, password);
    
//     // Store metadata in events_history JSONB column
//     const eventsHistory = [{
//       type: 'welcome_email_queued',
//       userId: enrollmentData.userId,
//       firstName: enrollmentData.firstName,
//       lastName: enrollmentData.lastName,
//       email: enrollmentData.email,
//       enrollmentId: enrollmentId,
//       timestamp: new Date().toISOString()
//     }];

//     // Create email log entry - using NULL for enquiry_id since this is an enrollment, not an enquiry
//     const logEntry = await emailLogger.logEmail({
//       enquiry_id: null,
//       to_email: enrollmentData.email,
//       subject: emailContent.subject,
//       status: 'PENDING',
//       provider: 'resend',
//       attempts: 0,
//       events_history: JSON.stringify(eventsHistory)
//     });

//     if (!logEntry || !logEntry.id) {
//       console.error('❌ Failed to create email log entry - logEntry:', logEntry);
//       throw new Error('Failed to create email log entry');
//     }

//     // Add job to queue
//     const job = await emailQueue.add('send-email', {
//       logId: logEntry.id,
//       email: {
//         to: enrollmentData.email,
//         subject: emailContent.subject,
//         html: emailContent.html,
//         text: emailContent.text
//       }
//     });

//     console.log(`📧 Welcome email queued for ${enrollmentData.email} - Job ID: ${job.id}, Log ID: ${logEntry.id}`);
//     return { jobId: job.id, logId: logEntry.id };
//   }

//   /**
//    * Queue free course enrollment confirmation email
//    */
//   async queueFreeCourseEmail(enrollmentData, enrollmentId) {
//     const emailContent = this.generateFreeCourseEmailContent(enrollmentData);
    
//     const eventsHistory = [{
//       type: 'free_course_confirmation_queued',
//       courseName: enrollmentData.course,
//       learningFormat: enrollmentData.learningFormat,
//       firstName: enrollmentData.firstName,
//       lastName: enrollmentData.lastName,
//       email: enrollmentData.email,
//       enrollmentId: enrollmentId,
//       timestamp: new Date().toISOString()
//     }];

//     const logEntry = await emailLogger.logEmail({
//       enquiry_id: null,
//       to_email: enrollmentData.email,
//       subject: emailContent.subject,
//       status: 'PENDING',
//       provider: 'resend',
//       attempts: 0,
//       events_history: JSON.stringify(eventsHistory)
//     });

//     if (!logEntry || !logEntry.id) {
//       console.error('❌ Failed to create email log entry - logEntry:', logEntry);
//       throw new Error('Failed to create email log entry');
//     }

//     const job = await emailQueue.add('send-email', {
//       logId: logEntry.id,
//       email: {
//         to: enrollmentData.email,
//         subject: emailContent.subject,
//         html: emailContent.html,
//         text: emailContent.text
//       }
//     });

//     console.log(`📧 Free course confirmation email queued for ${enrollmentData.email} - Job ID: ${job.id}`);
//     return { jobId: job.id, logId: logEntry.id };
//   }

//   /**
//    * Queue admin notification email
//    */
//   async queueAdminNotificationEmail(enrollmentData, metadata) {
//     const adminEmail = process.env.ADMIN_EMAIL || 'admin@spraditech.ng';
//     const emailContent = this.generateAdminNotificationEmail(enrollmentData, metadata);
    
//     const eventsHistory = [{
//       type: 'admin_notification_queued',
//       ...metadata,
//       studentName: `${enrollmentData.firstName} ${enrollmentData.lastName}`,
//       studentEmail: enrollmentData.email,
//       course: enrollmentData.course,
//       learningFormat: enrollmentData.learningFormat,
//       timestamp: new Date().toISOString()
//     }];

//     const logEntry = await emailLogger.logEmail({
//       enquiry_id: null,
//       to_email: adminEmail,
//       subject: emailContent.subject,
//       status: 'PENDING',
//       provider: 'resend',
//       attempts: 0,
//       events_history: JSON.stringify(eventsHistory)
//     });

//     if (!logEntry || !logEntry.id) {
//       console.error('❌ Failed to create admin email log entry - logEntry:', logEntry);
//       throw new Error('Failed to create admin email log entry');
//     }

//     const job = await emailQueue.add('send-email', {
//       logId: logEntry.id,
//       email: {
//         to: adminEmail,
//         subject: emailContent.subject,
//         html: emailContent.html,
//         text: emailContent.text
//       }
//     });

//     console.log(`📧 Admin notification email queued - Job ID: ${job.id}`);
//     return { jobId: job.id, logId: logEntry.id };
//   }

//   /**
//    * Queue payment confirmation email (called after Paystack verification)
//    */
//   async queuePaymentConfirmationEmail(enrollmentData, paymentData, enrollmentId) {
//     const emailContent = this.generatePaymentConfirmationEmail(enrollmentData, paymentData);
    
//     const eventsHistory = [{
//       type: 'payment_confirmation_queued',
//       amount: paymentData.amount,
//       reference: paymentData.reference,
//       courseName: enrollmentData.course,
//       firstName: enrollmentData.firstName,
//       lastName: enrollmentData.lastName,
//       email: enrollmentData.email,
//       enrollmentId: enrollmentId,
//       timestamp: new Date().toISOString()
//     }];

//     const logEntry = await emailLogger.logEmail({
//       enquiry_id: null,
//       to_email: enrollmentData.email,
//       subject: emailContent.subject,
//       status: 'PENDING',
//       provider: 'resend',
//       attempts: 0,
//       events_history: JSON.stringify(eventsHistory)
//     });

//     if (!logEntry || !logEntry.id) {
//       console.error('❌ Failed to create payment email log entry - logEntry:', logEntry);
//       throw new Error('Failed to create payment email log entry');
//     }

//     const job = await emailQueue.add('send-email', {
//       logId: logEntry.id,
//       email: {
//         to: enrollmentData.email,
//         subject: emailContent.subject,
//         html: emailContent.html,
//         text: emailContent.text
//       }
//     });

//     console.log(`📧 Payment confirmation email queued - Job ID: ${job.id}`);
//     return { jobId: job.id, logId: logEntry.id };
//   }

//   /**
//    * Queue enrollment activation email
//    */
//   async queueEnrollmentActivationEmail(userData, enrollmentData, enrollmentId) {
//     const emailContent = this.generateEnrollmentActivationEmail(userData, enrollmentData);
    
//     const eventsHistory = [{
//       type: 'enrollment_activation_queued',
//       courseName: enrollmentData.course_name,
//       courseId: enrollmentData.course_id,
//       firstName: userData.firstName,
//       email: userData.email,
//       enrollmentId: enrollmentId,
//       timestamp: new Date().toISOString()
//     }];

//     const logEntry = await emailLogger.logEmail({
//       enquiry_id: null,
//       to_email: userData.email,
//       subject: emailContent.subject,
//       status: 'PENDING',
//       provider: 'resend',
//       attempts: 0,
//       events_history: JSON.stringify(eventsHistory)
//     });

//     if (!logEntry || !logEntry.id) {
//       console.error('❌ Failed to create activation email log entry - logEntry:', logEntry);
//       throw new Error('Failed to create activation email log entry');
//     }

//     const job = await emailQueue.add('send-email', {
//       logId: logEntry.id,
//       email: {
//         to: userData.email,
//         subject: emailContent.subject,
//         html: emailContent.html,
//         text: emailContent.text
//       }
//     });

//     console.log(`📧 Enrollment activation email queued for ${userData.email} - Job ID: ${job.id}`);
//     return { jobId: job.id, logId: logEntry.id };
//   }

//   /**
//    * Generate welcome email content
//    */
//   generateWelcomeEmailContent(data, password) {
//     return {
//       subject: 'Welcome to Spraditech - Your Account Has Been Created',
//       html: this.generateWelcomeEmailHTML(data, password),
//       text: `Welcome to Spraditech! Your account has been created successfully.\n\nEmail: ${data.email}\nPassword: ${password}\n\nLogin here: ${process.env.APP_URL}/login`
//     };
//   }

//   /**
//    * Generate free course enrollment email content
//    */
//   generateFreeCourseEmailContent(data) {
//     return {
//       subject: 'Free Course Enrollment Confirmed - Welcome to Spraditech!',
//       html: this.generateFreeCourseEmailHTML(data),
//       text: `Your enrollment in ${data.course} has been confirmed!\n\nYour course is now active and you can access it immediately from your dashboard.\n\nDashboard: ${process.env.APP_URL}/dashboard/my-courses`
//     };
//   }

//   /**
//    * Generate admin notification email content
//    */
//   generateAdminNotificationEmail(data, metadata) {
//     const enrollmentType = metadata.isFree ? 'FREE COURSE' : 'PAID COURSE';
//     const userType = metadata.isNewUser ? 'NEW USER' : 'EXISTING USER';
    
//     return {
//       subject: `New Enrollment: ${data.course} - ${data.firstName} ${data.lastName} (${enrollmentType})`,
//       html: this.generateAdminNotificationHTML(data, metadata),
//       text: `
//         New Enrollment Received!
        
//         Course: ${data.course}
//         Student: ${data.firstName} ${data.lastName}
//         Email: ${data.email}
//         Phone: ${data.phone || 'Not provided'}
//         Type: ${enrollmentType}
//         User Type: ${userType}
//         Enrollment ID: ${metadata.enrollmentId}
        
//         View details: ${process.env.APP_URL}/admin/enrollments/${metadata.enrollmentId}
//       `
//     };
//   }

//   /**
//    * Generate payment confirmation email content
//    */
//   generatePaymentConfirmationEmail(data, paymentData) {
//     return {
//       subject: `Payment Confirmed for ${data.course} - Spraditech`,
//       html: this.generatePaymentConfirmationHTML(data, paymentData),
//       text: `
//         Payment Confirmed!
        
//         Course: ${data.course}
//         Amount: ₦${paymentData.amount}
//         Reference: ${paymentData.reference}
        
//         Your enrollment will be activated within 24 hours.
//       `
//     };
//   }

//   /**
//    * Generate enrollment activation email content
//    */
//   generateEnrollmentActivationEmail(userData, enrollmentData) {
//     return {
//       subject: `Your ${enrollmentData.course_name} Course is Now Active!`,
//       html: this.generateEnrollmentActivationHTML(userData, enrollmentData),
//       text: `
//         Great news! Your enrollment in ${enrollmentData.course_name} has been activated.
        
//         You now have full access to all course materials.
        
//         Start learning: ${process.env.APP_URL}/dashboard/courses/${enrollmentData.course_id}
//       `
//     };
//   }

//   /**
//    * HTML Template: Welcome Email
//    */
//   generateWelcomeEmailHTML(data, password) {
//     return `
//       <!DOCTYPE html>
//       <html>
//       <head>
//         <meta charset="UTF-8">
//         <meta name="viewport" content="width=device-width, initial-scale=1.0">
//         <style>
//           body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #1a202c; margin: 0; padding: 0; }
//           .container { max-width: 600px; margin: 0 auto; padding: 20px; }
//           .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 40px 30px; text-align: center; border-radius: 12px 12px 0 0; }
//           .header h1 { margin: 0; font-size: 28px; font-weight: 600; }
//           .content { padding: 40px 30px; background: #ffffff; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 12px 12px; }
//           .credentials { background: #f7fafc; padding: 24px; border-radius: 8px; margin: 24px 0; border-left: 4px solid #667eea; }
//           .credentials h3 { margin-top: 0; color: #2d3748; }
//           .password-box { background: #edf2f7; padding: 12px; border-radius: 6px; font-family: monospace; font-size: 16px; word-break: break-all; }
//           .button { background: #667eea; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; display: inline-block; margin-top: 20px; font-weight: 500; }
//           .button:hover { background: #5a67d8; }
//           .footer { padding: 30px; text-align: center; font-size: 14px; color: #718096; background: #f7fafc; border-radius: 12px; margin-top: 20px; }
//           .footer a { color: #667eea; text-decoration: none; }
//           .warning { color: #e53e3e; font-size: 14px; margin-top: 16px; }
//         </style>
//       </head>
//       <body>
//         <div class="container">
//           <div class="header">
//             <h1>🎓 Welcome to Spraditech!</h1>
//             <p style="font-size: 18px; margin-top: 10px; opacity: 0.95;">Your learning journey begins here</p>
//           </div>
//           <div class="content">
//             <h2 style="margin-top: 0; color: #2d3748;">Hello ${data.firstName},</h2>
//             <p style="font-size: 16px;">Your Spraditech account has been created successfully! We're excited to have you on board.</p>
            
//             <div class="credentials">
//               <h3 style="margin-top: 0;">🔐 Your Login Credentials</h3>
//               <p style="margin-bottom: 8px;"><strong>Email:</strong> ${data.email}</p>
//               <p style="margin-bottom: 8px;"><strong>Password:</strong></p>
//               <div class="password-box">${password}</div>
//               <p class="warning">⚠️ Please change your password after first login for security.</p>
//             </div>
            
//             <p style="font-size: 16px;">You can now access your student dashboard and track your enrollment progress.</p>
            
//             <div style="text-align: center;">
//               <a href="${process.env.APP_URL}/login" class="button">🚀 Login to Dashboard</a>
//             </div>
            
//             <div style="margin-top: 32px; padding-top: 24px; border-top: 1px solid #e2e8f0;">
//               <p style="margin: 0; color: #4a5568;"><strong>Need help?</strong> Contact our support team at <a href="mailto:support@spraditech.ng" style="color: #667eea;">support@spraditech.ng</a></p>
//             </div>
//           </div>
//           <div class="footer">
//             <p style="margin: 0 0 8px 0;">&copy; ${new Date().getFullYear()} Spraditech Digital Solutions. All rights reserved.</p>
//             <p style="margin: 0;">Spraditech.ng | Empowering Digital Excellence</p>
//           </div>
//         </div>
//       </body>
//       </html>
//     `;
//   }

//   /**
//    * HTML Template: Free Course Enrollment Confirmation
//    */
//   generateFreeCourseEmailHTML(data) {
//     return `
//       <!DOCTYPE html>
//       <html>
//       <head>
//         <meta charset="UTF-8">
//         <meta name="viewport" content="width=device-width, initial-scale=1.0">
//         <style>
//           body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #1a202c; margin: 0; padding: 0; }
//           .container { max-width: 600px; margin: 0 auto; padding: 20px; }
//           .header { background: linear-gradient(135deg, #38a169 0%, #2f855a 100%); color: white; padding: 40px 30px; text-align: center; border-radius: 12px 12px 0 0; }
//           .header h1 { margin: 0; font-size: 28px; }
//           .content { padding: 40px 30px; background: #ffffff; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 12px 12px; }
//           .course-details { background: #f7fafc; padding: 24px; border-radius: 8px; margin: 24px 0; border-left: 4px solid #38a169; }
//           .badge { background: #c6f6d5; color: #22543d; padding: 8px 16px; border-radius: 20px; font-size: 14px; font-weight: 600; display: inline-block; }
//           .button { background: #38a169; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; display: inline-block; margin-top: 20px; font-weight: 500; }
//           .button:hover { background: #2f855a; }
//           .footer { padding: 30px; text-align: center; font-size: 14px; color: #718096; background: #f7fafc; border-radius: 12px; margin-top: 20px; }
//           .step-list { margin: 24px 0; padding: 0; list-style: none; }
//           .step-list li { margin-bottom: 12px; padding-left: 28px; position: relative; }
//           .step-list li:before { content: "✓"; position: absolute; left: 0; color: #38a169; font-weight: bold; }
//         </style>
//       </head>
//       <body>
//         <div class="container">
//           <div class="header">
//             <h1>🎉 Enrollment Confirmed!</h1>
//             <p style="font-size: 18px; margin-top: 10px; opacity: 0.95;">Your free course is ready to start</p>
//           </div>
//           <div class="content">
//             <h2 style="margin-top: 0; color: #2d3748;">Hello ${data.firstName},</h2>
//             <p style="font-size: 16px;">Great news! Your enrollment in <strong style="color: #38a169;">${data.course}</strong> has been confirmed and is now active.</p>
            
//             <div class="course-details">
//               <span class="badge">✅ ACTIVE</span>
//               <h3 style="margin: 16px 0 8px 0; color: #2d3748;">Course Information</h3>
//               <p style="margin: 8px 0;"><strong>Course:</strong> ${data.course}</p>
//               <p style="margin: 8px 0;"><strong>Learning Format:</strong> ${data.learningFormat || 'Self-paced'}</p>
//               <p style="margin: 8px 0;"><strong>Access:</strong> Immediate</p>
//             </div>
            
//             <p style="font-size: 16px;">You can immediately access your course materials from your student dashboard.</p>
            
//             <h3 style="color: #2d3748;">📋 What's next?</h3>
//             <ul class="step-list">
//               <li>Log in to your student dashboard</li>
//               <li>Navigate to "My Courses" section</li>
//               <li>Click on "${data.course}" to start learning</li>
//               <li>Track your progress and earn your certificate</li>
//             </ul>
            
//             <div style="text-align: center;">
//               <a href="${process.env.APP_URL}/dashboard/my-courses" class="button">📚 Access Your Course →</a>
//             </div>
            
//             <div style="margin-top: 32px; padding-top: 24px; border-top: 1px solid #e2e8f0;">
//               <p style="margin: 0; color: #4a5568;"><strong>Questions?</strong> Contact us at <a href="mailto:support@spraditech.ng" style="color: #38a169;">support@spraditech.ng</a></p>
//             </div>
//           </div>
//           <div class="footer">
//             <p style="margin: 0 0 8px 0;">&copy; ${new Date().getFullYear()} Spraditech Digital Solutions. All rights reserved.</p>
//             <p style="margin: 0;">Spraditech.ng | Empowering Digital Excellence</p>
//           </div>
//         </div>
//       </body>
//       </html>
//     `;
//   }

//   /**
//    * HTML Template: Admin Notification
//    */
//   generateAdminNotificationHTML(data, metadata) {
//     const enrollmentType = metadata.isFree ? 'FREE' : 'PAID';
//     const userType = metadata.isNewUser ? 'NEW' : 'EXISTING';
    
//     return `
//       <!DOCTYPE html>
//       <html>
//       <head>
//         <meta charset="UTF-8">
//         <meta name="viewport" content="width=device-width, initial-scale=1.0">
//         <style>
//           body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #1a202c; margin: 0; padding: 0; }
//           .container { max-width: 600px; margin: 0 auto; padding: 20px; }
//           .header { background: #1a202c; color: white; padding: 40px 30px; text-align: center; border-radius: 12px 12px 0 0; }
//           .header h1 { margin: 0; font-size: 28px; }
//           .content { padding: 40px 30px; background: #ffffff; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 12px 12px; }
//           .info-box { background: #f7fafc; padding: 24px; border-radius: 8px; margin: 24px 0; border-left: 4px solid #4299e1; }
//           .badge { display: inline-block; padding: 8px 16px; border-radius: 20px; font-size: 14px; font-weight: 600; margin-right: 8px; }
//           .badge-free { background: #c6f6d5; color: #22543d; }
//           .badge-paid { background: #feebc8; color: #744210; }
//           .badge-new { background: #bee3f8; color: #2c5282; }
//           .badge-existing { background: #e9d8fd; color: #553c9a; }
//           .button { background: #4299e1; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; display: inline-block; margin-top: 20px; font-weight: 500; }
//           .footer { padding: 30px; text-align: center; font-size: 14px; color: #718096; background: #f7fafc; border-radius: 12px; margin-top: 20px; }
//         </style>
//       </head>
//       <body>
//         <div class="container">
//           <div class="header">
//             <h1>📋 New Enrollment Submission</h1>
//             <p style="font-size: 18px; margin-top: 10px; opacity: 0.95;">Action Required</p>
//           </div>
//           <div class="content">
//             <div style="margin-bottom: 24px;">
//               <span class="badge ${metadata.isFree ? 'badge-free' : 'badge-paid'}">${enrollmentType} COURSE</span>
//               <span class="badge ${metadata.isNewUser ? 'badge-new' : 'badge-existing'}">${userType} USER</span>
//             </div>
            
//             <div class="info-box">
//               <h3 style="margin-top: 0; color: #2d3748;">👤 Student Information</h3>
//               <table style="width: 100%; border-collapse: collapse;">
//                 <tr>
//                   <td style="padding: 8px 0;"><strong>Name:</strong></td>
//                   <td style="padding: 8px 0;">${data.firstName} ${data.lastName}</td>
//                 </tr>
//                 <tr>
//                   <td style="padding: 8px 0;"><strong>Email:</strong></td>
//                   <td style="padding: 8px 0;"><a href="mailto:${data.email}" style="color: #4299e1;">${data.email}</a></td>
//                 </tr>
//                 <tr>
//                   <td style="padding: 8px 0;"><strong>Phone:</strong></td>
//                   <td style="padding: 8px 0;">${data.phone || 'Not provided'}</td>
//                 </tr>
//               </table>
//             </div>
            
//             <div class="info-box">
//               <h3 style="margin-top: 0; color: #2d3748;">📚 Course Information</h3>
//               <table style="width: 100%; border-collapse: collapse;">
//                 <tr>
//                   <td style="padding: 8px 0;"><strong>Course:</strong></td>
//                   <td style="padding: 8px 0;">${data.course}</td>
//                 </tr>
//                 <tr>
//                   <td style="padding: 8px 0;"><strong>Format:</strong></td>
//                   <td style="padding: 8px 0;">${data.learningFormat}</td>
//                 </tr>
//                 <tr>
//                   <td style="padding: 8px 0;"><strong>Duration:</strong></td>
//                   <td style="padding: 8px 0;">${data.courseDuration || 'Not specified'}</td>
//                 </tr>
//                 ${!metadata.isFree ? `
//                 <tr>
//                   <td style="padding: 8px 0;"><strong>Course Fee:</strong></td>
//                   <td style="padding: 8px 0;">₦${data.courseFee}</td>
//                 </tr>
//                 <tr>
//                   <td style="padding: 8px 0;"><strong>Payment Method:</strong></td>
//                   <td style="padding: 8px 0;">${data.paymentMethod || 'Not specified'}</td>
//                 </tr>
//                 ` : ''}
//               </table>
//             </div>
            
//             <div class="info-box">
//               <h3 style="margin-top: 0; color: #2d3748;">📋 Enrollment Details</h3>
//               <table style="width: 100%; border-collapse: collapse;">
//                 <tr>
//                   <td style="padding: 8px 0;"><strong>Enrollment ID:</strong></td>
//                   <td style="padding: 8px 0; font-family: monospace;">${metadata.enrollmentId}</td>
//                 </tr>
//                 <tr>
//                   <td style="padding: 8px 0;"><strong>User ID:</strong></td>
//                   <td style="padding: 8px 0; font-family: monospace;">${metadata.userId}</td>
//                 </tr>
//                 <tr>
//                   <td style="padding: 8px 0;"><strong>Date:</strong></td>
//                   <td style="padding: 8px 0;">${new Date().toLocaleString()}</td>
//                 </tr>
//               </table>
//             </div>
            
//             <div style="text-align: center;">
//               <a href="${process.env.APP_URL}/admin/enrollments/${metadata.enrollmentId}" class="button">🔍 View in Admin Dashboard</a>
//             </div>
//           </div>
//           <div class="footer">
//             <p style="margin: 0;">This is an automated notification from Spraditech Enrollment System</p>
//           </div>
//         </div>
//       </body>
//       </html>
//     `;
//   }

//   /**
//    * HTML Template: Payment Confirmation
//    */
//   generatePaymentConfirmationHTML(data, paymentData) {
//     return `
//       <!DOCTYPE html>
//       <html>
//       <head>
//         <meta charset="UTF-8">
//         <meta name="viewport" content="width=device-width, initial-scale=1.0">
//         <style>
//           body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #1a202c; margin: 0; padding: 0; }
//           .container { max-width: 600px; margin: 0 auto; padding: 20px; }
//           .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 40px 30px; text-align: center; border-radius: 12px 12px 0 0; }
//           .header h1 { margin: 0; font-size: 28px; }
//           .content { padding: 40px 30px; background: #ffffff; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 12px 12px; }
//           .payment-details { background: #f7fafc; padding: 24px; border-radius: 8px; margin: 24px 0; border-left: 4px solid #667eea; }
//           .status-badge { background: #c6f6d5; color: #22543d; padding: 8px 16px; border-radius: 20px; font-size: 14px; font-weight: 600; display: inline-block; }
//           .button { background: #667eea; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; display: inline-block; margin-top: 20px; font-weight: 500; }
//           .footer { padding: 30px; text-align: center; font-size: 14px; color: #718096; background: #f7fafc; border-radius: 12px; margin-top: 20px; }
//         </style>
//       </head>
//       <body>
//         <div class="container">
//           <div class="header">
//             <h1>💰 Payment Confirmed!</h1>
//             <p style="font-size: 18px; margin-top: 10px; opacity: 0.95;">Thank you for your payment</p>
//           </div>
//           <div class="content">
//             <h2 style="margin-top: 0; color: #2d3748;">Hello ${data.firstName},</h2>
//             <p style="font-size: 16px;">Thank you for your payment! Your enrollment in <strong>${data.course}</strong> is now being processed.</p>
            
//             <div class="payment-details">
//               <span class="status-badge">✓ CONFIRMED</span>
//               <h3 style="margin: 16px 0 8px 0; color: #2d3748;">Payment Details</h3>
//               <table style="width: 100%; border-collapse: collapse;">
//                 <tr>
//                   <td style="padding: 8px 0;"><strong>Amount:</strong></td>
//                   <td style="padding: 8px 0; font-size: 20px; font-weight: bold; color: #667eea;">₦${paymentData.amount}</td>
//                 </tr>
//                 <tr>
//                   <td style="padding: 8px 0;"><strong>Reference:</strong></td>
//                   <td style="padding: 8px 0; font-family: monospace;">${paymentData.reference}</td>
//                 </tr>
//                 <tr>
//                   <td style="padding: 8px 0;"><strong>Date:</strong></td>
//                   <td style="padding: 8px 0;">${new Date().toLocaleDateString()}</td>
//                 </tr>
//                 <tr>
//                   <td style="padding: 8px 0;"><strong>Status:</strong></td>
//                   <td style="padding: 8px 0;"><span style="background: #c6f6d5; color: #22543d; padding: 4px 12px; border-radius: 20px; font-size: 14px;">COMPLETED</span></td>
//                 </tr>
//               </table>
//             </div>
            
//             <p style="font-size: 16px;">Your enrollment will be activated within 24 hours. You'll receive another email once your course is ready.</p>
            
//             <div style="margin-top: 32px; padding-top: 24px; border-top: 1px solid #e2e8f0;">
//               <p style="margin: 0; color: #4a5568;"><strong>Questions about your payment?</strong> Contact our support team at <a href="mailto:support@spraditech.ng" style="color: #667eea;">support@spraditech.ng</a></p>
//             </div>
//           </div>
//           <div class="footer">
//             <p style="margin: 0;">&copy; ${new Date().getFullYear()} Spraditech Digital Solutions. All rights reserved.</p>
//           </div>
//         </div>
//       </body>
//       </html>
//     `;
//   }

//   /**
//    * HTML Template: Enrollment Activation
//    */
//   generateEnrollmentActivationHTML(userData, enrollmentData) {
//     return `
//       <!DOCTYPE html>
//       <html>
//       <head>
//         <meta charset="UTF-8">
//         <meta name="viewport" content="width=device-width, initial-scale=1.0">
//         <style>
//           body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #1a202c; margin: 0; padding: 0; }
//           .container { max-width: 600px; margin: 0 auto; padding: 20px; }
//           .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 40px 30px; text-align: center; border-radius: 12px 12px 0 0; }
//           .header h1 { margin: 0; font-size: 28px; }
//           .content { padding: 40px 30px; background: #ffffff; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 12px 12px; }
//           .course-info { background: #f7fafc; padding: 24px; border-radius: 8px; margin: 24px 0; border-left: 4px solid #667eea; }
//           .feature-list { margin: 24px 0; padding: 0; list-style: none; }
//           .feature-list li { margin-bottom: 12px; padding-left: 28px; position: relative; }
//           .feature-list li:before { content: "✓"; position: absolute; left: 0; color: #667eea; font-weight: bold; }
//           .button { background: #667eea; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; display: inline-block; margin-top: 20px; font-weight: 500; }
//           .footer { padding: 30px; text-align: center; font-size: 14px; color: #718096; background: #f7fafc; border-radius: 12px; margin-top: 20px; }
//         </style>
//       </head>
//       <body>
//         <div class="container">
//           <div class="header">
//             <h1>🚀 Your Course is Ready!</h1>
//             <p style="font-size: 18px; margin-top: 10px; opacity: 0.95;">Start learning today</p>
//           </div>
//           <div class="content">
//             <h2 style="margin-top: 0; color: #2d3748;">Hello ${userData.firstName},</h2>
//             <p style="font-size: 16px;">Great news! Your enrollment in <strong style="color: #667eea;">${enrollmentData.course_name}</strong> has been activated.</p>
            
//             <div class="course-info">
//               <h3 style="margin-top: 0; color: #2d3748;">Course Access</h3>
//               <p><strong>Course:</strong> ${enrollmentData.course_name}</p>
//               <p><strong>Status:</strong> <span style="background: #c6f6d5; color: #22543d; padding: 4px 12px; border-radius: 20px;">ACTIVE</span></p>
//               <p><strong>Access Period:</strong> Unlimited</p>
//             </div>
            
//             <h3 style="color: #2d3748;">📚 What you'll get:</h3>
//             <ul class="feature-list">
//               <li>Full access to all video lectures</li>
//               <li>Practice exercises and projects</li>
//               <li>Downloadable resources and materials</li>
//               <li>Community discussion forums</li>
//               <li>Certificate of completion</li>
//             </ul>
            
//             <div style="text-align: center;">
//               <a href="${process.env.APP_URL}/dashboard/courses/${enrollmentData.course_id}" class="button">🎯 Start Learning Now →</a>
//             </div>
            
//             <div style="margin-top: 32px; padding-top: 24px; border-top: 1px solid #e2e8f0;">
//               <p style="margin: 0; color: #4a5568;">Happy learning! If you have any questions, our support team is here to help.</p>
//             </div>
//           </div>
//           <div class="footer">
//             <p style="margin: 0;">&copy; ${new Date().getFullYear()} Spraditech Digital Solutions. All rights reserved.</p>
//           </div>
//         </div>
//       </body>
//       </html>
//     `;
//   }
// }

// module.exports = new EnrollmentEmailService();

// const emailQueue = require('../queues/emailQueue');
// const emailLogger = require('./emailLogger');

// class EnrollmentEmailService {
//   /**
//    * Queue enrollment emails using your existing BullMQ queue
//    */
//   async queueEnrollmentEmails(enrollmentData, options) {
//     const { isNewUser, isFree, userId, enrollmentId, password } = options;
//     const queuedJobs = [];

//     try {
//       // Queue welcome email for new users
//       if (isNewUser) {
//         const welcomeEmail = await this.queueWelcomeEmail(enrollmentData, password, enrollmentId);
//         queuedJobs.push(welcomeEmail);
//       }

//       // Queue enrollment confirmation email
//       if (isFree) {
//         const confirmationEmail = await this.queueFreeCourseEmail(enrollmentData, enrollmentId);
//         queuedJobs.push(confirmationEmail);
//       } else if (enrollmentData.paymentMethod === 'paystack') {
//         console.log('💰 Paystack payment - email will be queued after payment verification');
//       }

//       // Queue admin notification email
//       const adminEmail = await this.queueAdminNotificationEmail(enrollmentData, {
//         isNewUser,
//         isFree,
//         userId,
//         enrollmentId
//       });
//       queuedJobs.push(adminEmail);

//       console.log(`✅ Queued ${queuedJobs.length} email jobs for enrollment ${enrollmentId}`);
//       return { success: true, queuedJobs };
//     } catch (error) {
//       console.error('❌ Error queueing enrollment emails:', error);
//       throw error;
//     }
//   }

//   /**
//    * Queue welcome email for new users
//    */
//   async queueWelcomeEmail(enrollmentData, password, enrollmentId) {
//     const emailContent = this.generateWelcomeEmailContent(enrollmentData, password);
    
//     // Create email log entry
//     const logEntry = await emailLogger.logEmail({
//       enquiry_id: enrollmentId, // Using enrollmentId as enquiry_id
//       to_email: enrollmentData.email,
//       subject: emailContent.subject,
//       status: 'PENDING',
//       provider: 'resend',
//       attempts: 0,
//       metadata: {
//         type: 'welcome',
//         userId: enrollmentData.userId,
//         firstName: enrollmentData.firstName,
//         enrollmentId: enrollmentId
//       }
//     });

//     if (!logEntry) {
//       throw new Error('Failed to create email log entry');
//     }

//     // Add job to queue
//     const job = await emailQueue.add('send-email', {
//       logId: logEntry.id,
//       email: {
//         to: enrollmentData.email,
//         subject: emailContent.subject,
//         html: emailContent.html,
//         text: emailContent.text
//       }
//     });

//     console.log(`📧 Welcome email queued for ${enrollmentData.email} - Job ID: ${job.id}, Log ID: ${logEntry.id}`);
//     return { jobId: job.id, logId: logEntry.id };
//   }

//   /**
//    * Queue free course enrollment confirmation email
//    */
//   async queueFreeCourseEmail(enrollmentData, enrollmentId) {
//     const emailContent = this.generateFreeCourseEmailContent(enrollmentData);
    
//     const logEntry = await emailLogger.logEmail({
//       enquiry_id: enrollmentId,
//       to_email: enrollmentData.email,
//       subject: emailContent.subject,
//       status: 'PENDING',
//       provider: 'resend',
//       attempts: 0,
//       metadata: {
//         type: 'free_course_confirmation',
//         courseName: enrollmentData.course,
//         learningFormat: enrollmentData.learningFormat,
//         enrollmentId: enrollmentId
//       }
//     });

//     if (!logEntry) {
//       throw new Error('Failed to create email log entry');
//     }

//     const job = await emailQueue.add('send-email', {
//       logId: logEntry.id,
//       email: {
//         to: enrollmentData.email,
//         subject: emailContent.subject,
//         html: emailContent.html,
//         text: emailContent.text
//       }
//     });

//     console.log(`📧 Free course confirmation email queued for ${enrollmentData.email} - Job ID: ${job.id}`);
//     return { jobId: job.id, logId: logEntry.id };
//   }

//   /**
//    * Queue admin notification email
//    */
//   async queueAdminNotificationEmail(enrollmentData, metadata) {
//     const adminEmail = process.env.ADMIN_EMAIL || 'admin@spraditech.ng';
//     const emailContent = this.generateAdminNotificationEmail(enrollmentData, metadata);
    
//     const logEntry = await emailLogger.logEmail({
//       enquiry_id: metadata.enrollmentId,
//       to_email: adminEmail,
//       subject: emailContent.subject,
//       status: 'PENDING',
//       provider: 'resend',
//       attempts: 0,
//       metadata: {
//         type: 'admin_notification',
//         ...metadata
//       }
//     });

//     if (!logEntry) {
//       throw new Error('Failed to create admin email log entry');
//     }

//     const job = await emailQueue.add('send-email', {
//       logId: logEntry.id,
//       email: {
//         to: adminEmail,
//         subject: emailContent.subject,
//         html: emailContent.html,
//         text: emailContent.text
//       }
//     });

//     console.log(`📧 Admin notification email queued - Job ID: ${job.id}`);
//     return { jobId: job.id, logId: logEntry.id };
//   }

//   /**
//    * Queue payment confirmation email (called after Paystack verification)
//    */
//   async queuePaymentConfirmationEmail(enrollmentData, paymentData, enrollmentId) {
//     const emailContent = this.generatePaymentConfirmationEmail(enrollmentData, paymentData);
    
//     const logEntry = await emailLogger.logEmail({
//       enquiry_id: enrollmentId,
//       to_email: enrollmentData.email,
//       subject: emailContent.subject,
//       status: 'PENDING',
//       provider: 'resend',
//       attempts: 0,
//       metadata: {
//         type: 'payment_confirmation',
//         amount: paymentData.amount,
//         reference: paymentData.reference,
//         courseName: enrollmentData.course
//       }
//     });

//     if (!logEntry) {
//       throw new Error('Failed to create payment email log entry');
//     }

//     const job = await emailQueue.add('send-email', {
//       logId: logEntry.id,
//       email: {
//         to: enrollmentData.email,
//         subject: emailContent.subject,
//         html: emailContent.html,
//         text: emailContent.text
//       }
//     });

//     console.log(`📧 Payment confirmation email queued - Job ID: ${job.id}`);
//     return { jobId: job.id, logId: logEntry.id };
//   }

//   /**
//    * Queue enrollment activation email
//    */
//   async queueEnrollmentActivationEmail(userData, enrollmentData, enrollmentId) {
//     const emailContent = this.generateEnrollmentActivationEmail(userData, enrollmentData);
    
//     const logEntry = await emailLogger.logEmail({
//       enquiry_id: enrollmentId,
//       to_email: userData.email,
//       subject: emailContent.subject,
//       status: 'PENDING',
//       provider: 'resend',
//       attempts: 0,
//       metadata: {
//         type: 'enrollment_activation',
//         courseName: enrollmentData.course_name,
//         courseId: enrollmentData.course_id,
//         enrollmentId: enrollmentId
//       }
//     });

//     if (!logEntry) {
//       throw new Error('Failed to create activation email log entry');
//     }

//     const job = await emailQueue.add('send-email', {
//       logId: logEntry.id,
//       email: {
//         to: userData.email,
//         subject: emailContent.subject,
//         html: emailContent.html,
//         text: emailContent.text
//       }
//     });

//     console.log(`📧 Enrollment activation email queued for ${userData.email} - Job ID: ${job.id}`);
//     return { jobId: job.id, logId: logEntry.id };
//   }

//   /**
//    * Generate welcome email content
//    */
//   generateWelcomeEmailContent(data, password) {
//     return {
//       subject: 'Welcome to Spraditech - Your Account Has Been Created',
//       html: this.generateWelcomeEmailHTML(data, password),
//       text: `Welcome to Spraditech! Your account has been created successfully.\n\nEmail: ${data.email}\nPassword: ${password}\n\nLogin here: ${process.env.APP_URL}/login`
//     };
//   }

//   /**
//    * Generate free course enrollment email content
//    */
//   generateFreeCourseEmailContent(data) {
//     return {
//       subject: 'Free Course Enrollment Confirmed - Welcome to Spraditech!',
//       html: this.generateFreeCourseEmailHTML(data),
//       text: `Your enrollment in ${data.course} has been confirmed!\n\nYour course is now active and you can access it immediately from your dashboard.\n\nDashboard: ${process.env.APP_URL}/dashboard/my-courses`
//     };
//   }

//   /**
//    * Generate admin notification email content
//    */
//   generateAdminNotificationEmail(data, metadata) {
//     const enrollmentType = metadata.isFree ? 'FREE COURSE' : 'PAID COURSE';
//     const userType = metadata.isNewUser ? 'NEW USER' : 'EXISTING USER';
    
//     return {
//       subject: `New Enrollment: ${data.course} - ${data.firstName} ${data.lastName} (${enrollmentType})`,
//       html: this.generateAdminNotificationHTML(data, metadata),
//       text: `
//         New Enrollment Received!
        
//         Course: ${data.course}
//         Student: ${data.firstName} ${data.lastName}
//         Email: ${data.email}
//         Phone: ${data.phone || 'Not provided'}
//         Type: ${enrollmentType}
//         User Type: ${userType}
//         Enrollment ID: ${metadata.enrollmentId}
        
//         View details: ${process.env.APP_URL}/admin/enrollments/${metadata.enrollmentId}
//       `
//     };
//   }

//   /**
//    * Generate payment confirmation email content
//    */
//   generatePaymentConfirmationEmail(data, paymentData) {
//     return {
//       subject: `Payment Confirmed for ${data.course} - Spraditech`,
//       html: this.generatePaymentConfirmationHTML(data, paymentData),
//       text: `
//         Payment Confirmed!
        
//         Course: ${data.course}
//         Amount: ₦${paymentData.amount}
//         Reference: ${paymentData.reference}
        
//         Your enrollment will be activated within 24 hours.
//       `
//     };
//   }

//   /**
//    * Generate enrollment activation email content
//    */
//   generateEnrollmentActivationEmail(userData, enrollmentData) {
//     return {
//       subject: `Your ${enrollmentData.course_name} Course is Now Active!`,
//       html: this.generateEnrollmentActivationHTML(userData, enrollmentData),
//       text: `
//         Great news! Your enrollment in ${enrollmentData.course_name} has been activated.
        
//         You now have full access to all course materials.
        
//         Start learning: ${process.env.APP_URL}/dashboard/courses/${enrollmentData.course_id}
//       `
//     };
//   }

//   /**
//    * HTML Template: Welcome Email
//    */
//   generateWelcomeEmailHTML(data, password) {
//     return `
//       <!DOCTYPE html>
//       <html>
//       <head>
//         <meta charset="UTF-8">
//         <meta name="viewport" content="width=device-width, initial-scale=1.0">
//         <style>
//           body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #1a202c; margin: 0; padding: 0; }
//           .container { max-width: 600px; margin: 0 auto; padding: 20px; }
//           .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 40px 30px; text-align: center; border-radius: 12px 12px 0 0; }
//           .header h1 { margin: 0; font-size: 28px; font-weight: 600; }
//           .content { padding: 40px 30px; background: #ffffff; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 12px 12px; }
//           .credentials { background: #f7fafc; padding: 24px; border-radius: 8px; margin: 24px 0; border-left: 4px solid #667eea; }
//           .credentials h3 { margin-top: 0; color: #2d3748; }
//           .password-box { background: #edf2f7; padding: 12px; border-radius: 6px; font-family: monospace; font-size: 16px; word-break: break-all; }
//           .button { background: #667eea; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; display: inline-block; margin-top: 20px; font-weight: 500; }
//           .button:hover { background: #5a67d8; }
//           .footer { padding: 30px; text-align: center; font-size: 14px; color: #718096; background: #f7fafc; border-radius: 12px; margin-top: 20px; }
//           .footer a { color: #667eea; text-decoration: none; }
//           .warning { color: #e53e3e; font-size: 14px; margin-top: 16px; }
//         </style>
//       </head>
//       <body>
//         <div class="container">
//           <div class="header">
//             <h1>🎓 Welcome to Spraditech!</h1>
//             <p style="font-size: 18px; margin-top: 10px; opacity: 0.95;">Your learning journey begins here</p>
//           </div>
//           <div class="content">
//             <h2 style="margin-top: 0; color: #2d3748;">Hello ${data.firstName},</h2>
//             <p style="font-size: 16px;">Your Spraditech account has been created successfully! We're excited to have you on board.</p>
            
//             <div class="credentials">
//               <h3 style="margin-top: 0;">🔐 Your Login Credentials</h3>
//               <p style="margin-bottom: 8px;"><strong>Email:</strong> ${data.email}</p>
//               <p style="margin-bottom: 8px;"><strong>Password:</strong></p>
//               <div class="password-box">${password}</div>
//               <p class="warning">⚠️ Please change your password after first login for security.</p>
//             </div>
            
//             <p style="font-size: 16px;">You can now access your student dashboard and track your enrollment progress.</p>
            
//             <div style="text-align: center;">
//               <a href="${process.env.APP_URL}/login" class="button">🚀 Login to Dashboard</a>
//             </div>
            
//             <div style="margin-top: 32px; padding-top: 24px; border-top: 1px solid #e2e8f0;">
//               <p style="margin: 0; color: #4a5568;"><strong>Need help?</strong> Contact our support team at <a href="mailto:support@spraditech.ng" style="color: #667eea;">support@spraditech.ng</a></p>
//             </div>
//           </div>
//           <div class="footer">
//             <p style="margin: 0 0 8px 0;">&copy; ${new Date().getFullYear()} Spraditech Digital Solutions. All rights reserved.</p>
//             <p style="margin: 0;">Spraditech.ng | Empowering Digital Excellence</p>
//           </div>
//         </div>
//       </body>
//       </html>
//     `;
//   }

//   /**
//    * HTML Template: Free Course Enrollment Confirmation
//    */
//   generateFreeCourseEmailHTML(data) {
//     return `
//       <!DOCTYPE html>
//       <html>
//       <head>
//         <meta charset="UTF-8">
//         <meta name="viewport" content="width=device-width, initial-scale=1.0">
//         <style>
//           body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #1a202c; margin: 0; padding: 0; }
//           .container { max-width: 600px; margin: 0 auto; padding: 20px; }
//           .header { background: linear-gradient(135deg, #38a169 0%, #2f855a 100%); color: white; padding: 40px 30px; text-align: center; border-radius: 12px 12px 0 0; }
//           .header h1 { margin: 0; font-size: 28px; }
//           .content { padding: 40px 30px; background: #ffffff; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 12px 12px; }
//           .course-details { background: #f7fafc; padding: 24px; border-radius: 8px; margin: 24px 0; border-left: 4px solid #38a169; }
//           .badge { background: #c6f6d5; color: #22543d; padding: 8px 16px; border-radius: 20px; font-size: 14px; font-weight: 600; display: inline-block; }
//           .button { background: #38a169; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; display: inline-block; margin-top: 20px; font-weight: 500; }
//           .button:hover { background: #2f855a; }
//           .footer { padding: 30px; text-align: center; font-size: 14px; color: #718096; background: #f7fafc; border-radius: 12px; margin-top: 20px; }
//           .step-list { margin: 24px 0; padding: 0; list-style: none; }
//           .step-list li { margin-bottom: 12px; padding-left: 28px; position: relative; }
//           .step-list li:before { content: "✓"; position: absolute; left: 0; color: #38a169; font-weight: bold; }
//         </style>
//       </head>
//       <body>
//         <div class="container">
//           <div class="header">
//             <h1>🎉 Enrollment Confirmed!</h1>
//             <p style="font-size: 18px; margin-top: 10px; opacity: 0.95;">Your free course is ready to start</p>
//           </div>
//           <div class="content">
//             <h2 style="margin-top: 0; color: #2d3748;">Hello ${data.firstName},</h2>
//             <p style="font-size: 16px;">Great news! Your enrollment in <strong style="color: #38a169;">${data.course}</strong> has been confirmed and is now active.</p>
            
//             <div class="course-details">
//               <span class="badge">✅ ACTIVE</span>
//               <h3 style="margin: 16px 0 8px 0; color: #2d3748;">Course Information</h3>
//               <p style="margin: 8px 0;"><strong>Course:</strong> ${data.course}</p>
//               <p style="margin: 8px 0;"><strong>Learning Format:</strong> ${data.learningFormat || 'Self-paced'}</p>
//               <p style="margin: 8px 0;"><strong>Access:</strong> Immediate</p>
//             </div>
            
//             <p style="font-size: 16px;">You can immediately access your course materials from your student dashboard.</p>
            
//             <h3 style="color: #2d3748;">📋 What's next?</h3>
//             <ul class="step-list">
//               <li>Log in to your student dashboard</li>
//               <li>Navigate to "My Courses" section</li>
//               <li>Click on "${data.course}" to start learning</li>
//               <li>Track your progress and earn your certificate</li>
//             </ul>
            
//             <div style="text-align: center;">
//               <a href="${process.env.APP_URL}/dashboard/my-courses" class="button">📚 Access Your Course →</a>
//             </div>
            
//             <div style="margin-top: 32px; padding-top: 24px; border-top: 1px solid #e2e8f0;">
//               <p style="margin: 0; color: #4a5568;"><strong>Questions?</strong> Contact us at <a href="mailto:support@spraditech.ng" style="color: #38a169;">support@spraditech.ng</a></p>
//             </div>
//           </div>
//           <div class="footer">
//             <p style="margin: 0 0 8px 0;">&copy; ${new Date().getFullYear()} Spraditech Digital Solutions. All rights reserved.</p>
//             <p style="margin: 0;">Spraditech.ng | Empowering Digital Excellence</p>
//           </div>
//         </div>
//       </body>
//       </html>
//     `;
//   }

//   /**
//    * HTML Template: Admin Notification
//    */
//   generateAdminNotificationHTML(data, metadata) {
//     const enrollmentType = metadata.isFree ? 'FREE' : 'PAID';
//     const userType = metadata.isNewUser ? 'NEW' : 'EXISTING';
//     const enrollmentTypeColor = metadata.isFree ? '#38a169' : '#ed8936';
//     const userTypeColor = metadata.isNewUser ? '#4299e1' : '#9f7aea';
    
//     return `
//       <!DOCTYPE html>
//       <html>
//       <head>
//         <meta charset="UTF-8">
//         <meta name="viewport" content="width=device-width, initial-scale=1.0">
//         <style>
//           body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #1a202c; margin: 0; padding: 0; }
//           .container { max-width: 600px; margin: 0 auto; padding: 20px; }
//           .header { background: #1a202c; color: white; padding: 40px 30px; text-align: center; border-radius: 12px 12px 0 0; }
//           .header h1 { margin: 0; font-size: 28px; }
//           .content { padding: 40px 30px; background: #ffffff; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 12px 12px; }
//           .info-box { background: #f7fafc; padding: 24px; border-radius: 8px; margin: 24px 0; border-left: 4px solid #4299e1; }
//           .badge { display: inline-block; padding: 8px 16px; border-radius: 20px; font-size: 14px; font-weight: 600; margin-right: 8px; }
//           .badge-free { background: #c6f6d5; color: #22543d; }
//           .badge-paid { background: #feebc8; color: #744210; }
//           .badge-new { background: #bee3f8; color: #2c5282; }
//           .badge-existing { background: #e9d8fd; color: #553c9a; }
//           .button { background: #4299e1; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; display: inline-block; margin-top: 20px; font-weight: 500; }
//           .footer { padding: 30px; text-align: center; font-size: 14px; color: #718096; background: #f7fafc; border-radius: 12px; margin-top: 20px; }
//         </style>
//       </head>
//       <body>
//         <div class="container">
//           <div class="header">
//             <h1>📋 New Enrollment Submission</h1>
//             <p style="font-size: 18px; margin-top: 10px; opacity: 0.95;">Action Required</p>
//           </div>
//           <div class="content">
//             <div style="margin-bottom: 24px;">
//               <span class="badge ${metadata.isFree ? 'badge-free' : 'badge-paid'}" style="background: ${enrollmentTypeColor}20; color: ${enrollmentTypeColor};">${enrollmentType} COURSE</span>
//               <span class="badge ${metadata.isNewUser ? 'badge-new' : 'badge-existing'}" style="background: ${userTypeColor}20; color: ${userTypeColor};">${userType} USER</span>
//             </div>
            
//             <div class="info-box">
//               <h3 style="margin-top: 0; color: #2d3748;">👤 Student Information</h3>
//               <table style="width: 100%; border-collapse: collapse;">
//                 <tr>
//                   <td style="padding: 8px 0;"><strong>Name:</strong></td>
//                   <td style="padding: 8px 0;">${data.firstName} ${data.lastName}</td>
//                 </tr>
//                 <tr>
//                   <td style="padding: 8px 0;"><strong>Email:</strong></td>
//                   <td style="padding: 8px 0;"><a href="mailto:${data.email}" style="color: #4299e1;">${data.email}</a></td>
//                 </tr>
//                 <tr>
//                   <td style="padding: 8px 0;"><strong>Phone:</strong></td>
//                   <td style="padding: 8px 0;">${data.phone || 'Not provided'}</td>
//                 </tr>
//               </table>
//             </div>
            
//             <div class="info-box">
//               <h3 style="margin-top: 0; color: #2d3748;">📚 Course Information</h3>
//               <table style="width: 100%; border-collapse: collapse;">
//                 <tr>
//                   <td style="padding: 8px 0;"><strong>Course:</strong></td>
//                   <td style="padding: 8px 0;">${data.course}</td>
//                 </tr>
//                 <tr>
//                   <td style="padding: 8px 0;"><strong>Format:</strong></td>
//                   <td style="padding: 8px 0;">${data.learningFormat}</td>
//                 </tr>
//                 <tr>
//                   <td style="padding: 8px 0;"><strong>Duration:</strong></td>
//                   <td style="padding: 8px 0;">${data.courseDuration || 'Not specified'}</td>
//                 </tr>
//                 ${!metadata.isFree ? `
//                 <tr>
//                   <td style="padding: 8px 0;"><strong>Course Fee:</strong></td>
//                   <td style="padding: 8px 0;">₦${data.courseFee}</td>
//                 </tr>
//                 <tr>
//                   <td style="padding: 8px 0;"><strong>Payment Method:</strong></td>
//                   <td style="padding: 8px 0;">${data.paymentMethod || 'Not specified'}</td>
//                 </tr>
//                 ` : ''}
//               </table>
//             </div>
            
//             <div class="info-box">
//               <h3 style="margin-top: 0; color: #2d3748;">📋 Enrollment Details</h3>
//               <table style="width: 100%; border-collapse: collapse;">
//                 <tr>
//                   <td style="padding: 8px 0;"><strong>Enrollment ID:</strong></td>
//                   <td style="padding: 8px 0; font-family: monospace;">${metadata.enrollmentId}</td>
//                 </tr>
//                 <tr>
//                   <td style="padding: 8px 0;"><strong>User ID:</strong></td>
//                   <td style="padding: 8px 0; font-family: monospace;">${metadata.userId}</td>
//                 </tr>
//                 <tr>
//                   <td style="padding: 8px 0;"><strong>Date:</strong></td>
//                   <td style="padding: 8px 0;">${new Date().toLocaleString()}</td>
//                 </tr>
//               </table>
//             </div>
            
//             <div style="text-align: center;">
//               <a href="${process.env.APP_URL}/admin/enrollments/${metadata.enrollmentId}" class="button">🔍 View in Admin Dashboard</a>
//             </div>
//           </div>
//           <div class="footer">
//             <p style="margin: 0;">This is an automated notification from Spraditech Enrollment System</p>
//           </div>
//         </div>
//       </body>
//       </html>
//     `;
//   }

//   /**
//    * HTML Template: Payment Confirmation
//    */
//   generatePaymentConfirmationHTML(data, paymentData) {
//     return `
//       <!DOCTYPE html>
//       <html>
//       <head>
//         <meta charset="UTF-8">
//         <meta name="viewport" content="width=device-width, initial-scale=1.0">
//         <style>
//           body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #1a202c; margin: 0; padding: 0; }
//           .container { max-width: 600px; margin: 0 auto; padding: 20px; }
//           .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 40px 30px; text-align: center; border-radius: 12px 12px 0 0; }
//           .header h1 { margin: 0; font-size: 28px; }
//           .content { padding: 40px 30px; background: #ffffff; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 12px 12px; }
//           .payment-details { background: #f7fafc; padding: 24px; border-radius: 8px; margin: 24px 0; border-left: 4px solid #667eea; }
//           .status-badge { background: #c6f6d5; color: #22543d; padding: 8px 16px; border-radius: 20px; font-size: 14px; font-weight: 600; display: inline-block; }
//           .button { background: #667eea; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; display: inline-block; margin-top: 20px; font-weight: 500; }
//           .footer { padding: 30px; text-align: center; font-size: 14px; color: #718096; background: #f7fafc; border-radius: 12px; margin-top: 20px; }
//         </style>
//       </head>
//       <body>
//         <div class="container">
//           <div class="header">
//             <h1>💰 Payment Confirmed!</h1>
//             <p style="font-size: 18px; margin-top: 10px; opacity: 0.95;">Thank you for your payment</p>
//           </div>
//           <div class="content">
//             <h2 style="margin-top: 0; color: #2d3748;">Hello ${data.firstName},</h2>
//             <p style="font-size: 16px;">Thank you for your payment! Your enrollment in <strong>${data.course}</strong> is now being processed.</p>
            
//             <div class="payment-details">
//               <span class="status-badge">✓ CONFIRMED</span>
//               <h3 style="margin: 16px 0 8px 0; color: #2d3748;">Payment Details</h3>
//               <table style="width: 100%; border-collapse: collapse;">
//                 <tr>
//                   <td style="padding: 8px 0;"><strong>Amount:</strong></td>
//                   <td style="padding: 8px 0; font-size: 20px; font-weight: bold; color: #667eea;">₦${paymentData.amount}</td>
//                 </tr>
//                 <tr>
//                   <td style="padding: 8px 0;"><strong>Reference:</strong></td>
//                   <td style="padding: 8px 0; font-family: monospace;">${paymentData.reference}</td>
//                 </tr>
//                 <tr>
//                   <td style="padding: 8px 0;"><strong>Date:</strong></td>
//                   <td style="padding: 8px 0;">${new Date().toLocaleDateString()}</td>
//                 </tr>
//                 <tr>
//                   <td style="padding: 8px 0;"><strong>Status:</strong></td>
//                   <td style="padding: 8px 0;"><span style="background: #c6f6d5; color: #22543d; padding: 4px 12px; border-radius: 20px; font-size: 14px;">COMPLETED</span></td>
//                 </tr>
//               </table>
//             </div>
            
//             <p style="font-size: 16px;">Your enrollment will be activated within 24 hours. You'll receive another email once your course is ready.</p>
            
//             <div style="margin-top: 32px; padding-top: 24px; border-top: 1px solid #e2e8f0;">
//               <p style="margin: 0; color: #4a5568;"><strong>Questions about your payment?</strong> Contact our support team at <a href="mailto:support@spraditech.ng" style="color: #667eea;">support@spraditech.ng</a></p>
//             </div>
//           </div>
//           <div class="footer">
//             <p style="margin: 0;">&copy; ${new Date().getFullYear()} Spraditech Digital Solutions. All rights reserved.</p>
//           </div>
//         </div>
//       </body>
//       </html>
//     `;
//   }

//   /**
//    * HTML Template: Enrollment Activation
//    */
//   generateEnrollmentActivationHTML(userData, enrollmentData) {
//     return `
//       <!DOCTYPE html>
//       <html>
//       <head>
//         <meta charset="UTF-8">
//         <meta name="viewport" content="width=device-width, initial-scale=1.0">
//         <style>
//           body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #1a202c; margin: 0; padding: 0; }
//           .container { max-width: 600px; margin: 0 auto; padding: 20px; }
//           .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 40px 30px; text-align: center; border-radius: 12px 12px 0 0; }
//           .header h1 { margin: 0; font-size: 28px; }
//           .content { padding: 40px 30px; background: #ffffff; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 12px 12px; }
//           .course-info { background: #f7fafc; padding: 24px; border-radius: 8px; margin: 24px 0; border-left: 4px solid #667eea; }
//           .feature-list { margin: 24px 0; padding: 0; list-style: none; }
//           .feature-list li { margin-bottom: 12px; padding-left: 28px; position: relative; }
//           .feature-list li:before { content: "✓"; position: absolute; left: 0; color: #667eea; font-weight: bold; }
//           .button { background: #667eea; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; display: inline-block; margin-top: 20px; font-weight: 500; }
//           .footer { padding: 30px; text-align: center; font-size: 14px; color: #718096; background: #f7fafc; border-radius: 12px; margin-top: 20px; }
//         </style>
//       </head>
//       <body>
//         <div class="container">
//           <div class="header">
//             <h1>🚀 Your Course is Ready!</h1>
//             <p style="font-size: 18px; margin-top: 10px; opacity: 0.95;">Start learning today</p>
//           </div>
//           <div class="content">
//             <h2 style="margin-top: 0; color: #2d3748;">Hello ${userData.firstName},</h2>
//             <p style="font-size: 16px;">Great news! Your enrollment in <strong style="color: #667eea;">${enrollmentData.course_name}</strong> has been activated.</p>
            
//             <div class="course-info">
//               <h3 style="margin-top: 0; color: #2d3748;">Course Access</h3>
//               <p><strong>Course:</strong> ${enrollmentData.course_name}</p>
//               <p><strong>Status:</strong> <span style="background: #c6f6d5; color: #22543d; padding: 4px 12px; border-radius: 20px;">ACTIVE</span></p>
//               <p><strong>Access Period:</strong> Unlimited</p>
//             </div>
            
//             <h3 style="color: #2d3748;">📚 What you'll get:</h3>
//             <ul class="feature-list">
//               <li>Full access to all video lectures</li>
//               <li>Practice exercises and projects</li>
//               <li>Downloadable resources and materials</li>
//               <li>Community discussion forums</li>
//               <li>Certificate of completion</li>
//             </ul>
            
//             <div style="text-align: center;">
//               <a href="${process.env.APP_URL}/dashboard/courses/${enrollmentData.course_id}" class="button">🎯 Start Learning Now →</a>
//             </div>
            
//             <div style="margin-top: 32px; padding-top: 24px; border-top: 1px solid #e2e8f0;">
//               <p style="margin: 0; color: #4a5568;">Happy learning! If you have any questions, our support team is here to help.</p>
//             </div>
//           </div>
//           <div class="footer">
//             <p style="margin: 0;">&copy; ${new Date().getFullYear()} Spraditech Digital Solutions. All rights reserved.</p>
//           </div>
//         </div>
//       </body>
//       </html>
//     `;
//   }
// }

// module.exports = new EnrollmentEmailService();