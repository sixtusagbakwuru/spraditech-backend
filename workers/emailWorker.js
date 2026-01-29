const { Worker } = require('bullmq');
const connection = require('../config/redis');
const emailService = require('../services/emailService');
const emailLogger = require('../services/emailLogger');

console.log('🔧 Initializing email worker...');

const worker = new Worker('email-queue', async (job) => {
  const { logId, email } = job.data;
  const attempt = job.attemptsMade + 1;
  
  console.log(`🔄 Processing email job for logId: ${logId} (Attempt: ${attempt})`);
  console.log(`📧 Email details:`, {
    to: email.to,
    subject: email.subject
  });

  try {
    // Update status to SENDING
    console.log(`⏳ Updating email log ${logId} status to SENDING...`);
    await emailLogger.updateEmail(logId, {
      status: 'SENDING',
      attempts: attempt,
      last_attempt_at: new Date().toISOString()
    });

    // Send the email
    console.log(`📤 Sending email for logId: ${logId}...`);
    const result = await emailService.send(email);
    
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
      jobId: job.id
    };
  } catch (error) {
    console.error(`❌ Email failed for logId: ${logId}:`, error.message);
    
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
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: process.env.REDIS_PORT || 6379
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
  console.log(`🟢 Job ${job.id} is now active - processing email`);
});

worker.on('completed', (job, result) => {
  console.log(`✅ Job ${job.id} completed successfully`);
  console.log(`📊 Result:`, result);
});

worker.on('failed', (job, err) => {
  console.error(`🔴 Job ${job.id} failed with error:`, err.message);
  if (job) {
    console.log(`📋 Failed job data:`, job.data);
  }
});

worker.on('error', (err) => {
  console.error('🔥 Worker error:', err);
});

worker.on('stalled', (jobId) => {
  console.warn(`⚠️ Job ${jobId} has stalled`);
});

// Handle graceful shutdown
process.on('SIGTERM', async () => {
  console.log('🛑 SIGTERM received, closing worker...');
  await worker.close();
});

process.on('SIGINT', async () => {
  console.log('🛑 SIGINT received, closing worker...');
  await worker.close();
});

module.exports = worker;

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
