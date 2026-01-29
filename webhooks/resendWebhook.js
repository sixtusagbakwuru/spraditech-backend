const express = require('express');
const router = express.Router();
const emailLogger = require('../services/emailLogger');

// Middleware to log all webhook requests
router.use((req, res, next) => {
  console.log(`🌐 Webhook Request: ${req.method} ${req.path} - ${new Date().toISOString()}`);
  next();
});

// ====================
// TEST ENDPOINTS
// ====================

// Root endpoint: GET /webhooks
router.get('/', (req, res) => {
  console.log('✅ Webhook root endpoint accessed');
  res.json({
    success: true,
    message: 'Webhook endpoint is operational',
    timestamp: new Date().toISOString(),
    availableEndpoints: {
      'GET /webhooks': 'This endpoint',
      'GET /webhooks/test': 'Simple test endpoint',
      'GET /webhooks/status': 'Webhook configuration status',
      'POST /webhooks/resend': 'Resend webhook receiver'
    }
  });
});

// Test endpoint: GET /webhooks/test
router.get('/test', (req, res) => {
  console.log('✅ Webhook test endpoint accessed');
  res.json({
    success: true,
    message: 'Webhook test endpoint is working!',
    timestamp: new Date().toISOString(),
    environment: {
      node_env: process.env.NODE_ENV,
      webhook_secret_configured: !!process.env.RESEND_WEBHOOK_SIGNING_SECRET
    }
  });
});

// Status endpoint: GET /webhooks/status
router.get('/status', (req, res) => {
  console.log('📊 Webhook status check');
  res.json({
    status: 'active',
    webhookConfigured: !!process.env.RESEND_WEBHOOK_SIGNING_SECRET,
    timestamp: new Date().toISOString(),
    instructions: 'Configure webhook in Resend Dashboard with URL: /webhooks/resend'
  });
});

// ====================
// RESEND WEBHOOK HANDLER
// ====================

// Main Resend webhook handler: POST /webhooks/resend

// Main Resend webhook handler: POST /webhooks/resend
router.post('/resend', async (req, res) => {
  console.log('📩 Resend webhook received');
  
  try {
    // IMPORTANT: Get raw body directly from request
    // We need to handle raw body differently
    const signature = req.headers['svix-signature'] || req.headers['resend-signature'];
    const timestamp = req.headers['svix-timestamp'] || req.headers['resend-timestamp'];
    
    console.log('📦 Headers:', JSON.stringify({
      signature: signature ? 'Present' : 'Missing',
      timestamp: timestamp || 'Missing',
      'content-type': req.headers['content-type']
    }));
    
    // Get the event data
    // Since express.json() might have already parsed it, check both cases
    let event;
    
    // Check if body is already parsed
    if (typeof req.body === 'object' && req.body !== null) {
      event = req.body;
      console.log('📝 Body already parsed as object');
    } else {
      // Try to parse as raw JSON
      try {
        event = JSON.parse(req.body);
        console.log('📝 Body parsed from raw JSON');
      } catch (parseError) {
        console.error('❌ Failed to parse JSON:', parseError.message);
        console.log('Body type:', typeof req.body);
        console.log('Body value (first 500 chars):', 
          typeof req.body === 'string' ? req.body.substring(0, 500) : String(req.body).substring(0, 500));
        return res.status(400).json({ success: false, error: 'Invalid JSON' });
      }
    }
    
    // Log event details
    console.log('🔍 Event details:', {
      type: event.type || event.event,
      emailId: event.data?.email_id || event.email_id || event.data?.id || event.id,
      timestamp: event.created_at || new Date().toISOString()
    });
    
    // Extract provider ID from various possible locations
    const providerId = event.data?.email_id || event.email_id || event.data?.id || event.id;
    
    if (!providerId) {
      console.error('❌ No provider ID found in event');
      console.log('Full event:', JSON.stringify(event, null, 2));
      return res.status(400).json({ 
        success: false, 
        error: 'No provider ID found',
        event: event 
      });
    }
    
    console.log(`✅ Processing event for provider ID: ${providerId}`);
    
    // Process different event types
    const eventType = event.type || event.event;
    const updateData = {
      last_event_type: eventType,
      updated_at: new Date().toISOString()
    };
    
    switch (eventType) {
      case 'email.delivered':
        updateData.status = 'DELIVERED';
        updateData.delivered_at = new Date().toISOString();
        console.log(`📬 Marking email ${providerId} as DELIVERED`);
        break;
        
      case 'email.opened':
        updateData.status = 'OPENED';
        updateData.opened_at = new Date().toISOString();
        
        // Get current count and increment
        try {
          const currentEmail = await emailLogger.getEmailByProviderId(providerId);
          updateData.opened_count = (currentEmail?.opened_count || 0) + 1;
          console.log(`👁️ Marking email ${providerId} as OPENED (count: ${updateData.opened_count})`);
        } catch (error) {
          console.warn('⚠️ Could not get current opened count, setting to 1');
          updateData.opened_count = 1;
        }
        break;
        
      case 'email.sent':
        updateData.status = 'SENT';
        console.log(`📤 Email ${providerId} confirmed as SENT by webhook`);
        break;
        
      case 'email.clicked':
        updateData.status = 'CLICKED';
        updateData.clicked_at = new Date().toISOString();
        console.log(`🖱️ Email ${providerId} was CLICKED`);
        break;
        
      case 'email.bounced':
        updateData.status = 'BOUNCED';
        updateData.bounced_at = new Date().toISOString();
        console.log(`↪️ Email ${providerId} BOUNCED`);
        break;
        
      case 'email.complained':
        updateData.status = 'COMPLAINED';
        updateData.complained_at = new Date().toISOString();
        console.log(`⚠️ Email ${providerId} was marked as SPAM`);
        break;
        
      case 'email.failed':
        updateData.status = 'FAILED';
        updateData.error = event.data?.error || 'Delivery failed';
        console.log(`❌ Email ${providerId} FAILED: ${updateData.error}`);
        break;
        
      default:
        console.log(`ℹ️ Unhandled event type: ${eventType}`);
        updateData.last_event_type = eventType;
    }
    
    // Update the email log
    try {
      const result = await emailLogger.updateEmailByProviderId(providerId, updateData);
      console.log(`✅ Successfully updated email ${providerId}:`, result);
    } catch (updateError) {
      console.error(`❌ Failed to update email ${providerId}:`, updateError.message);
    }
    
    // Send success response
    res.json({
      success: true,
      message: 'Webhook processed',
      event: eventType,
      providerId: providerId,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('🔥 Webhook processing error:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message
    });
  }
});
// router.post('/resend', express.raw({ type: 'application/json' }), async (req, res) => {
//   console.log('📩 Resend webhook received');
  
//   try {
//     // Get raw body for signature verification
//     const rawBody = req.body.toString();
//     const signature = req.headers['svix-signature'] || req.headers['resend-signature'];
//     const timestamp = req.headers['svix-timestamp'] || req.headers['resend-timestamp'];
    
//     console.log('📦 Headers:', JSON.stringify({
//       signature: signature ? 'Present' : 'Missing',
//       timestamp: timestamp || 'Missing',
//       'content-type': req.headers['content-type']
//     }));
    
//     // Parse the event
//     let event;
//     try {
//       event = JSON.parse(rawBody);
//       console.log('📝 Event parsed successfully');
//     } catch (parseError) {
//       console.error('❌ Failed to parse JSON:', parseError.message);
//       console.log('Raw body (first 500 chars):', rawBody.substring(0, 500));
//       return res.status(400).json({ success: false, error: 'Invalid JSON' });
//     }
    
//     // Log event details
//     console.log('🔍 Event details:', {
//       type: event.type || event.event,
//       emailId: event.data?.email_id || event.email_id || event.data?.id || event.id,
//       timestamp: event.created_at || new Date().toISOString()
//     });
    
//     // Extract provider ID from various possible locations
//     const providerId = event.data?.email_id || event.email_id || event.data?.id || event.id;
    
//     if (!providerId) {
//       console.error('❌ No provider ID found in event');
//       console.log('Full event:', JSON.stringify(event, null, 2));
//       return res.status(400).json({ 
//         success: false, 
//         error: 'No provider ID found',
//         event: event 
//       });
//     }
    
//     console.log(`✅ Processing event for provider ID: ${providerId}`);
    
//     // Process different event types
//     const eventType = event.type || event.event;
//     const updateData = {
//       last_event_type: eventType,
//       updated_at: new Date().toISOString()
//     };
    
//     switch (eventType) {
//       case 'email.delivered':
//         updateData.status = 'DELIVERED';
//         updateData.delivered_at = new Date().toISOString();
//         console.log(`📬 Marking email ${providerId} as DELIVERED`);
//         break;
        
//       case 'email.opened':
//         updateData.status = 'OPENED';
//         updateData.opened_at = new Date().toISOString();
        
//         // Get current count and increment
//         try {
//           const currentEmail = await emailLogger.getEmailByProviderId(providerId);
//           updateData.opened_count = (currentEmail?.opened_count || 0) + 1;
//           console.log(`👁️ Marking email ${providerId} as OPENED (count: ${updateData.opened_count})`);
//         } catch (error) {
//           console.warn('⚠️ Could not get current opened count, setting to 1');
//           updateData.opened_count = 1;
//         }
//         break;
        
//       case 'email.sent':
//         updateData.status = 'SENT';
//         console.log(`📤 Email ${providerId} confirmed as SENT by webhook`);
//         break;
        
//       case 'email.clicked':
//         updateData.status = 'CLICKED';
//         updateData.clicked_at = new Date().toISOString();
//         console.log(`🖱️ Email ${providerId} was CLICKED`);
//         break;
        
//       case 'email.bounced':
//         updateData.status = 'BOUNCED';
//         updateData.bounced_at = new Date().toISOString();
//         console.log(`↪️ Email ${providerId} BOUNCED`);
//         break;
        
//       case 'email.complained':
//         updateData.status = 'COMPLAINED';
//         updateData.complained_at = new Date().toISOString();
//         console.log(`⚠️ Email ${providerId} was marked as SPAM`);
//         break;
        
//       case 'email.failed':
//         updateData.status = 'FAILED';
//         updateData.error = event.data?.error || 'Delivery failed';
//         console.log(`❌ Email ${providerId} FAILED: ${updateData.error}`);
//         break;
        
//       default:
//         console.log(`ℹ️ Unhandled event type: ${eventType}`);
//         updateData.last_event_type = eventType;
//     }
    
//     // Update the email log
//     try {
//       const result = await emailLogger.updateEmailByProviderId(providerId, updateData);
//       console.log(`✅ Successfully updated email ${providerId}:`, result);
//     } catch (updateError) {
//       console.error(`❌ Failed to update email ${providerId}:`, updateError.message);
      
//       // Fallback: Try to find by enquiry_id if available
//       if (event.data?.to) {
//         console.log(`🔄 Attempting fallback lookup for: ${event.data.to}`);
//         // You might need additional logic here
//       }
//     }
    
//     // Send success response
//     res.json({
//       success: true,
//       message: 'Webhook processed',
//       event: eventType,
//       providerId: providerId,
//       timestamp: new Date().toISOString()
//     });
    
//   } catch (error) {
//     console.error('🔥 Webhook processing error:', error);
//     console.error('Error stack:', error.stack);
//     res.status(500).json({
//       success: false,
//       error: 'Internal server error',
//       message: error.message
//     });
//   }
// });

// ====================
// MANUAL TEST ENDPOINT
// ====================

// Manual test endpoint: POST /webhooks/test-manual
router.post('/test-manual', async (req, res) => {
  console.log('🧪 Manual webhook test triggered');
  
  try {
    const { providerId, eventType } = req.body;
    
    if (!providerId) {
      return res.status(400).json({
        success: false,
        error: 'providerId is required'
      });
    }
    
    const updateData = {
      status: eventType === 'delivered' ? 'DELIVERED' : 'OPENED',
      last_event_type: eventType === 'delivered' ? 'email.delivered' : 'email.opened',
      updated_at: new Date().toISOString()
    };
    
    if (eventType === 'delivered') {
      updateData.delivered_at = new Date().toISOString();
    } else if (eventType === 'opened') {
      updateData.opened_at = new Date().toISOString();
      
      // Get current count
      try {
        const currentEmail = await emailLogger.getEmailByProviderId(providerId);
        updateData.opened_count = (currentEmail?.opened_count || 0) + 1;
      } catch (error) {
        updateData.opened_count = 1;
      }
    }
    
    const result = await emailLogger.updateEmailByProviderId(providerId, updateData);
    
    console.log(`✅ Manual update for ${providerId}:`, result);
    
    res.json({
      success: true,
      message: `Manually updated ${providerId} to ${updateData.status}`,
      data: updateData,
      result: result
    });
    
  } catch (error) {
    console.error('Manual test failed:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;


// const express = require('express');
// const crypto = require('crypto');
// const router = express.Router();
// const emailLogger = require('../services/emailLogger');

// // Verify webhook signature
// const verifyWebhookSignature = (payload, signature, secret) => {
//   try {
//     const hmac = crypto.createHmac('sha256', secret);
//     const digest = hmac.update(payload).digest('hex');
//     return crypto.timingSafeEqual(
//       Buffer.from(signature, 'hex'),
//       Buffer.from(digest, 'hex')
//     );
//   } catch (error) {
//     console.error('Webhook signature verification error:', error);
//     return false;
//   }
// };

// // Process Resend webhook events
// router.post('/resend', express.raw({ type: 'application/json' }), async (req, res) => {
//   try {
//     const signature = req.headers['svix-signature'] || req.headers['resend-signature'];
//     const timestamp = req.headers['svix-timestamp'] || req.headers['resend-timestamp'];
    
//     // Verify webhook signature if secret is provided
//     if (process.env.RESEND_WEBHOOK_SIGNING_SECRET && signature) {
//       const payload = `${timestamp}.${JSON.stringify(req.body)}`;
//       const isValid = verifyWebhookSignature(payload, signature, process.env.RESEND_WEBHOOK_SIGNING_SECRET);
      
//       if (!isValid) {
//         console.error('Invalid webhook signature');
//         return res.status(401).send('Invalid signature');
//       }
//     }

//     const event = req.body;
//     console.log('📩 Resend webhook received:', JSON.stringify(event, null, 2));

//     // Extract provider ID from different event formats
//     let providerId = event.data?.email_id || event.email_id;
    
//     if (!providerId) {
//       console.log('⚠️ No provider_id found in webhook event');
//       return res.sendStatus(200);
//     }

//     const eventType = event.type || event.event;
//     console.log(`🔄 Processing ${eventType} event for email: ${providerId}`);

//     // Update email log based on event type
//     const updateData = {
//       last_event_type: eventType,
//       updated_at: new Date().toISOString()
//     };

//     // Map Resend events to our status and timestamps
//     switch (eventType) {
//       case 'email.delivered':
//         updateData.status = 'DELIVERED';
//         updateData.delivered_at = new Date().toISOString();
//         break;
      
//       case 'email.opened':
//         updateData.status = 'OPENED';
//         updateData.opened_at = new Date().toISOString();
//         updateData.opened_count = await getCurrentOpenedCount(providerId) + 1;
//         break;
      
//       case 'email.clicked':
//         updateData.status = 'CLICKED';
//         updateData.clicked_at = new Date().toISOString();
//         updateData.clicked_count = await getCurrentClickedCount(providerId) + 1;
//         break;
      
//       case 'email.bounced':
//         updateData.status = 'BOUNCED';
//         updateData.bounced_at = new Date().toISOString();
//         break;
      
//       case 'email.complained':
//         updateData.status = 'COMPLAINED';
//         updateData.complained_at = new Date().toISOString();
//         break;
      
//       case 'email.failed':
//         updateData.status = 'FAILED';
//         updateData.error = event.data?.error || 'Delivery failed';
//         break;
      
//       default:
//         console.log(`ℹ️ Unhandled event type: ${eventType}`);
//         updateData.last_event_type = eventType;
//     }

//     // Add event to history
//     const eventHistory = {
//       type: eventType,
//       timestamp: new Date().toISOString(),
//       data: event.data || event
//     };
    
//     updateData.events_history = await appendToEventsHistory(providerId, eventHistory);

//     // Update the email log
//     const result = await emailLogger.updateEmailByProviderId(providerId, updateData);
    
//     if (result.success) {
//       console.log(`✅ Updated email ${providerId} with ${eventType} event`);
//     } else {
//       console.error(`❌ Failed to update email ${providerId}:`, result.error);
//     }

//     res.sendStatus(200);
//   } catch (error) {
//     console.error('🔥 Webhook processing error:', error);
//     res.status(500).send('Internal server error');
//   }
// });

// // Helper function to get current opened count
// async function getCurrentOpenedCount(providerId) {
//   try {
//     const email = await emailLogger.getEmailByProviderId(providerId);
//     return email?.opened_count || 0;
//   } catch (error) {
//     console.error('Error getting opened count:', error);
//     return 0;
//   }
// }

// // Helper function to get current clicked count
// async function getCurrentClickedCount(providerId) {
//   try {
//     const email = await emailLogger.getEmailByProviderId(providerId);
//     return email?.clicked_count || 0;
//   } catch (error) {
//     console.error('Error getting clicked count:', error);
//     return 0;
//   }
// }

// // Helper function to append to events history
// async function appendToEventsHistory(providerId, newEvent) {
//   try {
//     const email = await emailLogger.getEmailByProviderId(providerId);
//     const currentHistory = email?.events_history || [];
    
//     // Keep only last 50 events to prevent bloating
//     const updatedHistory = [newEvent, ...currentHistory].slice(0, 50);
    
//     return updatedHistory;
//   } catch (error) {
//     console.error('Error updating events history:', error);
//     return [newEvent];
//   }
// }

// module.exports = router;