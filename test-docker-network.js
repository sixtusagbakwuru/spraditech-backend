const dns = require('dns');
const net = require('net');

async function testNetwork() {
  console.log('🔍 Testing Docker Network Connectivity...\n');
  
  // Test 1: DNS resolution
  console.log('1. Testing DNS resolution for "redis":');
  try {
    const addresses = await dns.promises.lookup('redis');
    console.log(`✅ DNS resolved: ${addresses.address}:${addresses.port || 'N/A'}`);
  } catch (error) {
    console.error(`❌ DNS resolution failed: ${error.message}`);
    console.log('💡 This is expected if running outside Docker');
  }
  
  // Test 2: Network connectivity
  console.log('\n2. Testing network connectivity:');
  const testConnection = (host, port) => {
    return new Promise((resolve) => {
      const socket = new net.Socket();
      socket.setTimeout(2000);
      
      socket.on('connect', () => {
        socket.destroy();
        resolve(true);
      });
      
      socket.on('timeout', () => {
        socket.destroy();
        resolve(false);
      });
      
      socket.on('error', () => {
        socket.destroy();
        resolve(false);
      });
      
      socket.connect(port, host);
    });
  };
  
  const hostsToTest = [
    { name: 'redis (container name)', host: 'redis', port: 6379 },
    { name: 'localhost', host: 'localhost', port: 6380 },
  ];
  
  for (const test of hostsToTest) {
    const isConnected = await testConnection(test.host, test.port);
    console.log(`${isConnected ? '✅' : '❌'} ${test.name}: ${test.host}:${test.port}`);
  }
}

testNetwork();