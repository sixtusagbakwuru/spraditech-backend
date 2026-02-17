const { Worker } = require('bullmq');
const connection = require('../config/redis');
const emailService = require('../services/emailService');
const emailLogger = require('../services/emailLogger');

console.log('🔧 Initializing email worker...');
console.log(`🔗 Redis connection: ${connection.host}:${connection.port}`);

const worker = new Worker('email-queue', async (job) => {
  const { logId, email } = job.data;
  const attempt = job.attemptsMade + 1;
  
  console.log(`🔄 Processing email job for logId: ${logId} (Attempt: ${attempt})`);
  console.log(`📧 Job type: ${job.name}`);
  console.log(`📧 Email details:`, {
    to: email?.to || email?.email,
    subject: email?.subject
  });

  try {
    // Update status to SENDING
    console.log(`⏳ Updating email log ${logId} status to SENDING...`);
    await emailLogger.updateEmail(logId, {
      status: 'SENDING',
      attempts: attempt,
      last_attempt_at: new Date().toISOString()
    });

    let result;

    // Handle different email types
    switch (job.name) {
      case 'send-password-reset':
        console.log(`📤 Sending password reset email for logId: ${logId}...`);
        result = await emailService.sendPasswordResetEmail({
          to: email.to,
          firstName: email.firstName,
          resetLink: email.resetLink
        });
        break;

      case 'send-password-reset-confirmation':
        console.log(`📤 Sending password reset confirmation email for logId: ${logId}...`);
        result = await emailService.sendPasswordResetConfirmationEmail({
          to: email.to,
          firstName: email.firstName
        });
        break;

      case 'send-welcome-email':
        console.log(`📤 Sending welcome email for logId: ${logId}...`);
        result = await emailService.sendWelcomeEmail({
          to: email.to,
          firstName: email.firstName,
          email: email.email,
          password: email.password
        });
        break;

      case 'send-enrollment-confirmation':
        console.log(`📤 Sending enrollment confirmation email for logId: ${logId}...`);
        result = await emailService.sendEnrollmentConfirmationEmail({
          to: email.to,
          firstName: email.firstName,
          courseName: email.courseName,
          learningFormat: email.learningFormat
        });
        break;

      case 'send-payment-confirmation':
        console.log(`📤 Sending payment confirmation email for logId: ${logId}...`);
        result = await emailService.sendPaymentConfirmationEmail({
          to: email.to,
          firstName: email.firstName,
          courseName: email.courseName,
          amount: email.amount,
          reference: email.reference
        });
        break;

      case 'send-enrollment-activation':
        console.log(`📤 Sending enrollment activation email for logId: ${logId}...`);
        result = await emailService.sendEnrollmentActivationEmail({
          to: email.to,
          firstName: email.firstName,
          courseName: email.courseName,
          courseId: email.courseId
        });
        break;

      case 'send-admin-notification':
        console.log(`📤 Sending admin notification email for logId: ${logId}...`);
        result = await emailService.sendAdminNotificationEmail({
          to: email.to,
          studentName: email.studentName,
          studentEmail: email.studentEmail,
          courseName: email.courseName,
          enrollmentType: email.enrollmentType,
          userType: email.userType,
          enrollmentId: email.enrollmentId
        });
        break;

      case 'send-email':
      default:
        console.log(`📤 Sending standard email for logId: ${logId}...`);
        result = await emailService.send({
          to: email.to,
          subject: email.subject,
          html: email.html,
          text: email.text
        });
        break;
    }
    
    // Update status to SENT with provider details
    console.log(`✅ Email sent successfully. Updating log ${logId} status to SENT...`);
    await emailLogger.updateEmail(logId, {
      status: 'SENT',
      provider: 'resend',
      provider_id: result.providerId,
      sent_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });

    console.log(`🎉 Email processing completed for logId: ${logId}`);
    return {
      success: true,
      logId: logId,
      providerId: result.providerId,
      jobId: job.id,
      jobName: job.name
    };
  } catch (error) {
    console.error(`❌ Email failed for logId: ${logId}:`, error.message);
    console.error(error.stack);
    
    // Update status to FAILED
    await emailLogger.updateEmail(logId, {
      status: 'FAILED',
      error: error.message.substring(0, 255), // Truncate to fit column limits
      last_error_at: new Date().toISOString(),
      attempts: attempt
    });
    
    // Throw error to trigger retries
    throw new Error(`Email sending failed: ${error.message}`);
  }
}, {
  connection: {
    host: process.env.REDIS_HOST || "redis" || '127.0.0.1',
    port: process.env.REDIS_PORT || 6379,
    ...(process.env.REDIS_PASSWORD && { password: process.env.REDIS_PASSWORD }),
    ...(process.env.REDIS_TLS === 'true' && { tls: {} })
  },
  limiter: {
    max: 10, // Max 10 emails per second
    duration: 1000
  },
  concurrency: 5, // Process 5 emails concurrently
  removeOnComplete: {
    count: 100, // Keep last 100 completed jobs
    age: 3600 // 1 hour
  },
  removeOnFail: {
    count: 1000 // Keep last 1000 failed jobs
  }
});

// Worker event listeners
worker.on('ready', () => {
  console.log('✅ Email worker is ready and waiting for jobs');
});

worker.on('active', (job) => {
  console.log(`🟢 Job ${job.id} (${job.name}) is now active - processing email`);
});

worker.on('completed', (job, result) => {
  console.log(`✅ Job ${job.id} (${job.name}) completed successfully`);
  console.log(`📊 Result:`, result);
});

worker.on('failed', (job, err) => {
  console.error(`🔴 Job ${job.id} (${job?.name}) failed with error:`, err.message);
  if (job) {
    console.log(`📋 Failed job data:`, {
      id: job.id,
      name: job.name,
      attempts: job.attemptsMade,
      data: job.data
    });
  }
});

worker.on('error', (err) => {
  console.error('🔥 Worker error:', err);
});

worker.on('stalled', (jobId) => {
  console.warn(`⚠️ Job ${jobId} has stalled`);
});

worker.on('progress', (job, progress) => {
  console.log(`📊 Job ${job.id} progress: ${progress}%`);
});

worker.on('paused', () => {
  console.log('⏸️ Worker paused');
});

worker.on('resumed', () => {
  console.log('▶️ Worker resumed');
});

worker.on('closed', () => {
  console.log('🔒 Worker connection closed');
});

// Handle graceful shutdown
process.on('SIGTERM', async () => {
  console.log('🛑 SIGTERM received, closing worker...');
  await worker.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('🛑 SIGINT received, closing worker...');
  await worker.close();
  process.exit(0);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('💥 Uncaught Exception:', error);
  // Gracefully close worker before exiting
  worker.close().then(() => {
    process.exit(1);
  }).catch(() => {
    process.exit(1);
  });
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
});

console.log('📧 Email worker started and ready to process jobs');
console.log('📋 Supported job types:');
console.log('  - send-email (standard email)');
console.log('  - send-password-reset');
console.log('  - send-password-reset-confirmation');
console.log('  - send-welcome-email');
console.log('  - send-enrollment-confirmation');
console.log('  - send-payment-confirmation');
console.log('  - send-enrollment-activation');
console.log('  - send-admin-notification');

module.exports = worker;




// const { Worker } = require('bullmq');
// const connection = require('../config/redis');
// const emailService = require('../services/emailService');
// const emailLogger = require('../services/emailLogger');

// console.log('🔧 Initializing email worker...');

// const worker = new Worker('email-queue', async (job) => {
//   const { logId, email } = job.data;
//   const attempt = job.attemptsMade + 1;
  
//   console.log(`🔄 Processing email job for logId: ${logId} (Attempt: ${attempt})`);
//   console.log(`📧 Email details:`, {
//     to: email.to,
//     subject: email.subject
//   });

//   try {
//     // Update status to SENDING
//     console.log(`⏳ Updating email log ${logId} status to SENDING...`);
//     await emailLogger.updateEmail(logId, {
//       status: 'SENDING',
//       attempts: attempt,
//       last_attempt_at: new Date().toISOString()
//     });

//     // Send the email
//     console.log(`📤 Sending email for logId: ${logId}...`);
//     const result = await emailService.send(email);
    
//     // Update status to SENT with provider details
//     console.log(`✅ Email sent successfully. Updating log ${logId} status to SENT...`);
//     await emailLogger.updateEmail(logId, {
//       status: 'SENT',
//       provider: 'resend',
//       provider_id: result.providerId,
//       sent_at: new Date().toISOString(),
//       updated_at: new Date().toISOString()
//     });

//     console.log(`🎉 Email processing completed for logId: ${logId}`);
//     return {
//       success: true,
//       logId: logId,
//       providerId: result.providerId,
//       jobId: job.id
//     };
//   } catch (error) {
//     console.error(`❌ Email failed for logId: ${logId}:`, error.message);
    
//     // Update status to FAILED
//     await emailLogger.updateEmail(logId, {
//       status: 'FAILED',
//       error: error.message.substring(0, 255), // Truncate to fit column limits
//       last_error_at: new Date().toISOString(),
//       attempts: attempt
//     });
    
//     // Throw error to trigger retries
//     throw new Error(`Email sending failed: ${error.message}`);
//   }
// }, {
//   connection: {
//     host: process.env.REDIS_HOST || '127.0.0.1',
//     port: process.env.REDIS_PORT || 6379
//   },
//   limiter: {
//     max: 10, // Max 10 emails per second
//     duration: 1000
//   },
//   concurrency: 5, // Process 5 emails concurrently
//   removeOnComplete: {
//     count: 100, // Keep last 100 completed jobs
//     age: 3600 // 1 hour
//   },
//   removeOnFail: {
//     count: 1000 // Keep last 1000 failed jobs
//   }
// });

// // Worker event listeners
// worker.on('ready', () => {
//   console.log('✅ Email worker is ready and waiting for jobs');
// });

// worker.on('active', (job) => {
//   console.log(`🟢 Job ${job.id} is now active - processing email`);
// });

// worker.on('completed', (job, result) => {
//   console.log(`✅ Job ${job.id} completed successfully`);
//   console.log(`📊 Result:`, result);
// });

// worker.on('failed', (job, err) => {
//   console.error(`🔴 Job ${job.id} failed with error:`, err.message);
//   if (job) {
//     console.log(`📋 Failed job data:`, job.data);
//   }
// });

// worker.on('error', (err) => {
//   console.error('🔥 Worker error:', err);
// });

// worker.on('stalled', (jobId) => {
//   console.warn(`⚠️ Job ${jobId} has stalled`);
// });

// // Handle graceful shutdown
// process.on('SIGTERM', async () => {
//   console.log('🛑 SIGTERM received, closing worker...');
//   await worker.close();
// });

// process.on('SIGINT', async () => {
//   console.log('🛑 SIGINT received, closing worker...');
//   await worker.close();
// });

// module.exports = worker;







// new Worker(
//   'email-queue',
//   async job => {
//     const { logId, email } = job.data;

//     try {
//       const result = await resend.send(email);

//       await logger.updateEmail(logId, {
//         status: 'SENT',
//         provider: 'resend',
//         provider_message_id: result.id
//       });

//     } catch (err) {
//       // fallback
//       await smtp.send(email);

//       await logger.updateEmail(logId, {
//         status: 'SENT',
//         provider: 'smtp-fallback'
//       });
//     }
//   },
//   { connection }
// );
