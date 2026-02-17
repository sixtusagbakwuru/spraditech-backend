const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL || "https://uyeevhfdfzqupnwrtjqk.supabase.co",
  process.env.SUPABASE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV5ZWV2aGZkZnpxdXBud3J0anFrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzgyODQzNjIsImV4cCI6MjA1Mzg2MDM2Mn0.4htFgWEprmsKTO40bgLsNZ1dkZCyShmgDguMu1CXjdE"
);

exports.logEmail = async (payload) => {
  try {
    console.log('📝 Attempting to log email with payload:', payload);
    
    // SELECT SPECIFIC COLUMNS, NOT *
    const { data, error } = await supabase
      .from('email_logs')
      .insert([{
        ...payload,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }])
      .select('id, enquiry_id, to_email, subject, status, provider, provider_id, attempts, error, sent_at, created_at, updated_at')
      .single();

    if (error) {
      console.error('❌ Email log insert error:', error);
      throw error;
    }

    console.log('✅ Email logged successfully:', data.id);
    return data;
  } catch (error) {
    console.error('❌ Email log service error:', error);
    return null;
  }
};

exports.updateEmail = async (id, data) => {
  try {
    const { error } = await supabase
      .from('email_logs')
      .update({
        ...data,
        updated_at: new Date().toISOString()
      })
      .eq('id', id);

    if (error) {
      console.error('❌ Email log update error:', error);
      throw error;
    }
    
    console.log(`✅ Email log ${id} updated successfully`);
    return { success: true };
  } catch (error) {
    console.error('❌ Email update service error:', error);
    return { success: false, error: error.message };
  }
};

// Optional: Get email log by ID
exports.getEmailById = async (id) => {
  try {
    // SELECT SPECIFIC COLUMNS, NOT *
    const { data, error } = await supabase
      .from('email_logs')
      .select('id, enquiry_id, to_email, subject, status, provider, provider_id, attempts, error, sent_at, created_at, updated_at')
      .eq('id', id)
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('❌ Get email by ID error:', error);
    return null;
  }
};


// Add these methods to your existing emailLogger.js

// Get email by provider ID (Resend email ID)
exports.getEmailByProviderId = async (providerId) => {
  try {
    const { data, error } = await supabase
      .from('email_logs')
      .select('*')
      .eq('provider_id', providerId)
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('❌ Get email by provider ID error:', error);
    return null;
  }
};

// Update email by provider ID
exports.updateEmailByProviderId = async (providerId, data) => {
  try {
    const { error } = await supabase
      .from('email_logs')
      .update({
        ...data,
        updated_at: new Date().toISOString()
      })
      .eq('provider_id', providerId);

    if (error) {
      console.error('❌ Update email by provider ID error:', error);
      throw error;
    }
    
    console.log(`✅ Email with provider ID ${providerId} updated successfully`);
    return { success: true };
  } catch (error) {
    console.error('❌ Update by provider ID service error:', error);
    return { success: false, error: error.message };
  }
};

// Get email analytics
exports.getAnalytics = async (period = '30d') => {
  try {
    let dateFilter = new Date();
    
    switch (period) {
      case '7d':
        dateFilter.setDate(dateFilter.getDate() - 7);
        break;
      case '30d':
        dateFilter.setDate(dateFilter.getDate() - 30);
        break;
      case '90d':
        dateFilter.setDate(dateFilter.getDate() - 90);
        break;
      default:
        dateFilter.setDate(dateFilter.getDate() - 30);
    }

    // Get overall stats
    const { data: stats, error: statsError } = await supabase
      .from('email_logs')
      .select('status, created_at')
      .gte('created_at', dateFilter.toISOString());

    if (statsError) throw statsError;

    // Get daily analytics
    const { data: dailyAnalytics, error: dailyError } = await supabase
      .rpc('get_email_analytics', { start_date: dateFilter.toISOString() });

    if (dailyError) {
      console.warn('RPC function not available, calculating manually');
      // Fallback to manual calculation
      return await calculateAnalyticsManually(dateFilter);
    }

    // Calculate metrics
    const total = stats.length;
    const sent = stats.filter(s => s.status === 'SENT').length;
    const delivered = stats.filter(s => s.status === 'DELIVERED').length;
    const opened = stats.filter(s => s.status === 'OPENED' || s.opened_at).length;
    const clicked = stats.filter(s => s.status === 'CLICKED' || s.clicked_at).length;
    const failed = stats.filter(s => s.status === 'FAILED').length;
    const bounced = stats.filter(s => s.status === 'BOUNCED').length;
    const complained = stats.filter(s => s.status === 'COMPLAINED').length;

    const openRate = sent > 0 ? (opened / sent) * 100 : 0;
    const clickRate = sent > 0 ? (clicked / sent) * 100 : 0;
    const deliveryRate = sent > 0 ? (delivered / sent) * 100 : 0;

    return {
      success: true,
      period,
      summary: {
        total,
        sent,
        delivered,
        opened,
        clicked,
        failed,
        bounced,
        complained,
        openRate: Math.round(openRate * 100) / 100,
        clickRate: Math.round(clickRate * 100) / 100,
        deliveryRate: Math.round(deliveryRate * 100) / 100
      },
      daily: dailyAnalytics || []
    };
  } catch (error) {
    console.error('❌ Get analytics error:', error);
    return { success: false, error: error.message };
  }
};

// Manual calculation fallback
// Replace the calculateAnalyticsManually function with this:
async function calculateAnalyticsManually(dateFilter) {
  // Get email logs
  const { data: emails, error } = await supabase
    .from('email_logs')
    .select('*')
    .gte('created_at', dateFilter.toISOString())
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching emails for manual calculation:', error);
    return {
      success: true,
      summary: getEmptySummary(),
      daily: []
    };
  }

  // Group by date
  const dailyMap = {};
  emails.forEach(email => {
    const date = email.created_at.split('T')[0];
    if (!dailyMap[date]) {
      dailyMap[date] = {
        date,
        total: 0,
        sent: 0,
        delivered: 0,
        opened: 0,
        clicked: 0,
        failed: 0,
        bounced: 0,
        complained: 0
      };
    }
    
    dailyMap[date].total++;
    if (email.status === 'SENT') dailyMap[date].sent++;
    if (email.status === 'DELIVERED') dailyMap[date].delivered++;
    if (email.status === 'OPENED' || email.opened_at) dailyMap[date].opened++;
    if (email.status === 'CLICKED' || email.clicked_at) dailyMap[date].clicked++;
    if (email.status === 'FAILED') dailyMap[date].failed++;
    if (email.status === 'BOUNCED') dailyMap[date].bounced++;
    if (email.status === 'COMPLAINED') dailyMap[date].complained++;
  });

  const daily = Object.values(dailyMap).sort((a, b) => b.date.localeCompare(a.date));

  return {
    success: true,
    summary: calculateSummaryFromDaily(daily),
    daily
  };
}

function getEmptySummary() {
  return {
    total: 0,
    sent: 0,
    delivered: 0,
    opened: 0,
    clicked: 0,
    failed: 0,
    bounced: 0,
    complained: 0,
    openRate: 0,
    clickRate: 0,
    deliveryRate: 0
  };
}

function calculateSummaryFromDaily(daily) {
  const summary = {
    total: 0,
    sent: 0,
    delivered: 0,
    opened: 0,
    clicked: 0,
    failed: 0,
    bounced: 0,
    complained: 0
  };

  daily.forEach(day => {
    summary.total += day.total;
    summary.sent += day.sent;
    summary.delivered += day.delivered;
    summary.opened += day.opened;
    summary.clicked += day.clicked;
    summary.failed += day.failed;
    summary.bounced += day.bounced;
    summary.complained += day.complained;
  });

  const openRate = summary.sent > 0 ? (summary.opened / summary.sent) * 100 : 0;
  const clickRate = summary.sent > 0 ? (summary.clicked / summary.sent) * 100 : 0;
  const deliveryRate = summary.sent > 0 ? (summary.delivered / summary.sent) * 100 : 0;

  return {
    ...summary,
    openRate: Math.round(openRate * 100) / 100,
    clickRate: Math.round(clickRate * 100) / 100,
    deliveryRate: Math.round(deliveryRate * 100) / 100
  };
}



// const { createClient } = require('@supabase/supabase-js');

// const supabase = createClient(
//   process.env.SUPABASE_URL,
//   process.env.SUPABASE_KEY
// );

// exports.logEmail = async payload => {
//   const { data, error } = await supabase
//     .from('email_logs')
//     .insert([payload])
//     .select()
//     .single();

//   if (error) {
//     console.error('❌ Email log insert error:', error);
//   }

//   return data; // ✅ RETURN ONLY DATA
// };


// exports.updateEmail = async (id, data) => {
//   const { error } = await supabase
//     .from('email_logs')
//     .update(data)
//     .eq('id', id);

//   if (error) {
//     console.error('❌ Email log update error:', error);
//   }
// };




// const { createClient } = require('@supabase/supabase-js');

// const supabase = createClient(
//   process.env.SUPABASE_URL,
//   process.env.SUPABASE_KEY
// );

// exports.logEmail = async (payload) => {
//   return supabase.from('email_logs').insert([payload]).select().single();
// };

// exports.updateEmail = async (id, data) => {
//   return supabase.from('email_logs').update(data).eq('id', id);
// };
