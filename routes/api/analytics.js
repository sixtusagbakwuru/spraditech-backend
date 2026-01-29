const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const router = express.Router();
const emailLogger = require('../../services/emailLogger');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// Get email analytics
// In your /emails route, replace the query with this:
router.get('/emails', async (req, res) => {
  try {
    const { period = '30d', page = 1, limit = 20 } = req.query;
    
    const analytics = await emailLogger.getAnalytics(period);
    
    if (!analytics.success) {
      return res.status(500).json({
        success: false,
        error: analytics.error
      });
    }

    // Get recent emails for the table - WITHOUT JOIN first
    const offset = (parseInt(page) - 1) * parseInt(limit);
    
    // First get email logs
    const { data: emails, error: emailsError, count } = await supabase
      .from('email_logs')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + parseInt(limit) - 1);

    if (emailsError) {
      console.error('Error fetching emails:', emailsError);
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch emails'
      });
    }

    // Get enquiry data for each email
    const enrichedEmails = await Promise.all(
      emails.map(async (email) => {
        if (email.enquiry_id) {
          const { data: enquiry } = await supabase
            .from('enquiries')
            .select('name, email_address')
            .eq('id', email.enquiry_id)
            .single();
          
          return {
            ...email,
            enquiries: enquiry || null
          };
        }
        return { ...email, enquiries: null };
      })
    );

    res.json({
      success: true,
      analytics: analytics.summary,
      daily: analytics.daily,
      emails: enrichedEmails,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: count,
        totalPages: Math.ceil(count / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Error in analytics route:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// router.get('/emails', async (req, res) => {
//   try {
//     const { period = '30d', page = 1, limit = 20 } = req.query;
    
//     const analytics = await emailLogger.getAnalytics(period);
    
//     if (!analytics.success) {
//       return res.status(500).json({
//         success: false,
//         error: analytics.error
//       });
//     }

//     // Get recent emails for the table
//     const offset = (parseInt(page) - 1) * parseInt(limit);
    
//     const { data: emails, error, count } = await supabase
//       .from('email_logs')
//       .select('*, enquiries(name, email_address)', { count: 'exact' })
//       .order('created_at', { ascending: false })
//       .range(offset, offset + parseInt(limit) - 1);

//     if (error) {
//       console.error('Error fetching emails:', error);
//       return res.status(500).json({
//         success: false,
//         error: 'Failed to fetch emails'
//       });
//     }

//     res.json({
//       success: true,
//       analytics: analytics.summary,
//       daily: analytics.daily,
//       emails: emails || [],
//       pagination: {
//         page: parseInt(page),
//         limit: parseInt(limit),
//         total: count,
//         totalPages: Math.ceil(count / parseInt(limit))
//       }
//     });
//   } catch (error) {
//     console.error('Error in analytics route:', error);
//     res.status(500).json({
//       success: false,
//       error: 'Internal server error'
//     });
//   }
// });

// Get single email details
router.get('/emails/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const { data: email, error } = await supabase
      .from('email_logs')
      .select('*, enquiries(*)')
      .eq('id', id)
      .single();

    if (error) {
      console.error('Error fetching email:', error);
      return res.status(404).json({
        success: false,
        error: 'Email not found'
      });
    }

    res.json({
      success: true,
      email
    });
  } catch (error) {
    console.error('Error in email details route:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Get real-time stats (for dashboard)
router.get('/stats', async (req, res) => {
  try {
    // Today's stats
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const { data: todayStats } = await supabase
      .from('email_logs')
      .select('status')
      .gte('created_at', today.toISOString());

    // Yesterday's stats
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    const { data: yesterdayStats } = await supabase
      .from('email_logs')
      .select('status')
      .gte('created_at', yesterday.toISOString())
      .lt('created_at', today.toISOString());

    // This week stats
    const weekStart = new Date(today);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    
    const { data: weekStats } = await supabase
      .from('email_logs')
      .select('status')
      .gte('created_at', weekStart.toISOString());

    // Calculate
    const calculateStats = (stats) => {
      if (!stats) return { sent: 0, opened: 0, clicked: 0 };
      
      return {
        sent: stats.filter(s => s.status === 'SENT').length,
        opened: stats.filter(s => s.status === 'OPENED').length,
        clicked: stats.filter(s => s.status === 'CLICKED').length
      };
    };

    const todayData = calculateStats(todayStats);
    const yesterdayData = calculateStats(yesterdayStats);
    const weekData = calculateStats(weekStats);

    // Calculate percentage changes
    const sentChange = yesterdayData.sent > 0 
      ? ((todayData.sent - yesterdayData.sent) / yesterdayData.sent) * 100 
      : 0;
    
    const openRateChange = yesterdayData.sent > 0 && todayData.sent > 0
      ? ((todayData.opened/todayData.sent) - (yesterdayData.opened/yesterdayData.sent)) * 100
      : 0;

    res.json({
      success: true,
      stats: {
        today: todayData,
        yesterday: yesterdayData,
        week: weekData,
        changes: {
          sent: Math.round(sentChange * 100) / 100,
          openRate: Math.round(openRateChange * 100) / 100
        }
      }
    });
  } catch (error) {
    console.error('Error in stats route:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Get chart data
router.get('/charts', async (req, res) => {
  try {
    const { days = 30 } = req.query;
    
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));
    
    // Get daily data
    const { data: dailyData, error } = await supabase
      .from('email_logs')
      .select('created_at, status, opened_at, clicked_at')
      .gte('created_at', startDate.toISOString())
      .order('created_at', { ascending: true });

    if (error) throw error;

    // Process for charts
    const dailyMap = {};
    const statusCounts = { SENT: 0, DELIVERED: 0, OPENED: 0, CLICKED: 0, FAILED: 0, BOUNCED: 0, COMPLAINED: 0 };
    
    dailyData.forEach(email => {
      const date = email.created_at.split('T')[0];
      
      if (!dailyMap[date]) {
        dailyMap[date] = {
          date,
          sent: 0,
          opened: 0,
          clicked: 0
        };
      }
      
      dailyMap[date].sent++;
      if (email.status === 'OPENED' || email.opened_at) dailyMap[date].opened++;
      if (email.status === 'CLICKED' || email.clicked_at) dailyMap[date].clicked++;
      
      // Count statuses
      if (statusCounts[email.status] !== undefined) {
        statusCounts[email.status]++;
      }
    });

    const chartData = Object.values(dailyMap);
    const statusData = Object.entries(statusCounts).map(([name, value]) => ({ name, value }));

    res.json({
      success: true,
      daily: chartData,
      status: statusData,
      performance: {
        total: dailyData.length,
        openRate: dailyData.length > 0 
          ? (dailyData.filter(e => e.status === 'OPENED' || e.opened_at).length / dailyData.length) * 100 
          : 0,
        clickRate: dailyData.length > 0
          ? (dailyData.filter(e => e.status === 'CLICKED' || e.clicked_at).length / dailyData.length) * 100
          : 0
      }
    });
  } catch (error) {
    console.error('Error in charts route:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

module.exports = router;