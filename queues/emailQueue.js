const { Queue } = require('bullmq');

// Create connection object
const connection = {
  host: process.env.REDIS_HOST || "redis" || '127.0.0.1',
  port: process.env.REDIS_PORT || 6379
};

console.log(`🔗 Creating email queue with Redis connection: ${connection.host}:${connection.port}`);

// Create the queue instance
const emailQueue = new Queue('email-queue', { 
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000
    },
    removeOnComplete: 100, // Keep last 100 completed jobs
    removeOnFail: 1000 // Keep last 1000 failed jobs
  }
});

// Event listeners for the queue
emailQueue.on('error', (error) => {
  console.error('❌ Queue error:', error);
});

emailQueue.on('waiting', (jobId) => {
  console.log(`⏳ Job ${jobId} is waiting`);
});

emailQueue.on('active', (job) => {
  console.log(`🟢 Job ${job.id} is now active`);
});

console.log('✅ Email queue created successfully');

module.exports = emailQueue;