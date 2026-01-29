const IORedis = require('ioredis');

// Use environment variables or defaults
const redisHost = process.env.REDIS_HOST || 'redis';
const redisPort = process.env.REDIS_PORT || 6379;

console.log(`🔗 Connecting to Redis at ${redisHost}:${redisPort}`);

const redis = new IORedis({
  host: redisHost,
  port: parseInt(redisPort),
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  retryStrategy: (times) => {
    const delay = Math.min(times * 50, 2000);
    console.log(`🔁 Redis connection attempt ${times}, retrying in ${delay}ms`);
    return delay;
  },
  // Add connection timeout for Docker networking
  connectTimeout: 10000,
  // Disable auto-pipelining for better Docker compatibility
  enableAutoPipelining: false,
});

// Redis event listeners
redis.on('connect', () => {
  console.log('✅ Redis connected successfully');
});

redis.on('ready', () => {
  console.log('✅ Redis client ready');
});

redis.on('error', (error) => {
  console.error('❌ Redis connection error:', error.message);
  console.error('Error details:', {
    code: error.code,
    host: redisHost,
    port: redisPort
  });
});

redis.on('close', () => {
  console.log('🔌 Redis connection closed');
});

redis.on('reconnecting', () => {
  console.log('🔄 Redis reconnecting...');
});

// Test the connection with a delay
setTimeout(async () => {
  try {
    const result = await redis.ping();
    console.log('✅ Redis ping successful:', result);
    
    // Also test if we can set/get a value
    await redis.set('test-key', 'test-value');
    const testValue = await redis.get('test-key');
    console.log('✅ Redis set/get test successful:', testValue);
    
  } catch (error) {
    console.error('❌ Redis test failed:', error.message);
  }
}, 3000); // Wait 3 seconds for Redis to be fully ready

module.exports = redis;


// const IORedis = require('ioredis');

// console.log(`🔗 Connecting to Redis at ${process.env.REDIS_HOST || '127.0.0.1'}:${process.env.REDIS_PORT || 6379}`);

// const redis = new IORedis({
//   host: process.env.REDIS_HOST || '127.0.0.1',
//   port: process.env.REDIS_PORT || 6379,
//   maxRetriesPerRequest: null,
//   enableReadyCheck: false,
//   retryStrategy: (times) => {
//     const delay = Math.min(times * 50, 2000);
//     console.log(`🔁 Redis connection attempt ${times}, retrying in ${delay}ms`);
//     return delay;
//   }
// });

// // Redis event listeners
// redis.on('connect', () => {
//   console.log('✅ Redis connected successfully');
// });

// redis.on('ready', () => {
//   console.log('✅ Redis client ready');
// });

// redis.on('error', (error) => {
//   console.error('❌ Redis connection error:', error);
// });

// redis.on('close', () => {
//   console.log('🔌 Redis connection closed');
// });

// redis.on('reconnecting', () => {
//   console.log('🔄 Redis reconnecting...');
// });

// // Test the connection
// async function testConnection() {
//   try {
//     await redis.ping();
//     console.log('✅ Redis ping successful');
//   } catch (error) {
//     console.error('❌ Redis ping failed:', error);
//   }
// }

// testConnection();

// module.exports = redis;
