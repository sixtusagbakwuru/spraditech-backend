const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL || "https://uyeevhfdfzqupnwrtjqk.supabase.co";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV5ZWV2aGZkZnpxdXBud3J0anFrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTczODI4NDM2MiwiZXhwIjoyMDUzODYwMzYyfQ.vwsQjwJyCDoPvRerDS7ESh5rf3nHOmfWzMXnN5Si-_o";

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase environment variables');
  console.error('   Required: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

console.log('✅ Supabase admin client initialized');

module.exports = { supabase };