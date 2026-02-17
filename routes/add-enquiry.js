const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const emailQueue = require('../queues/emailQueue');
const emailLogger = require('../services/emailLogger');

const router = express.Router();

const supabase = createClient(
  process.env.SUPABASE_URL || "https://uyeevhfdfzqupnwrtjqk.supabase.co",
  process.env.SUPABASE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV5ZWV2aGZkZnpxdXBud3J0anFrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzgyODQzNjIsImV4cCI6MjA1Mzg2MDM2Mn0.4htFgWEprmsKTO40bgLsNZ1dkZCyShmgDguMu1CXjdE"
);

router.post('/', async (req, res) => {
  console.log('📨 Received new enquiry request');
  console.log('📝 Request body:', JSON.stringify(req.body, null, 2));
  
  try {
    // 1. Validate input (matching frontend validation)
    const { 
      name, 
      phoneNumber, 
      emailAddress, 
      enquiry, 
      emailMessage, 
      howDidYouHear, 
      addedBy 
    } = req.body;
    
    // Check all required fields from frontend
    const requiredFields = { 
      name, 
      phoneNumber, 
      emailAddress, 
      enquiry, 
      emailMessage, 
      howDidYouHear, 
      addedBy 
    };
    
    const missingFields = Object.keys(requiredFields).filter(field => {
      const value = requiredFields[field];
      return value === undefined || value === null || value === '';
    });
    
    if (missingFields.length > 0) {
      console.error('❌ Validation failed: Missing required fields:', missingFields);
      return res.status(400).json({
        success: false,
        error: `Missing required fields: ${missingFields.join(', ')}`
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(emailAddress)) {
      console.error('❌ Invalid email format:', emailAddress);
      return res.status(400).json({
        success: false,
        error: 'Invalid email address format'
      });
    }

    console.log(`✅ Input validated for: ${name} <${emailAddress}>`);

    // 2. Insert into enquiries table with ALL fields from frontend
    console.log('💾 Inserting into enquiries table...');
    const enquiryData = { 
      name, 
      phone_number: phoneNumber,
      email_address: emailAddress, 
      enquiry,
      email_message: emailMessage,
      how_did_you_hear: howDidYouHear,
      added_by: addedBy,
      status: 'prospect',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    
    console.log('📊 Enquiry data to insert:', enquiryData);

    // SELECT SPECIFIC COLUMNS THAT EXIST - DO NOT USE *
    const { data: enquiryResult, error: insertError } = await supabase
      .from('enquiries')
      .insert([enquiryData])
      .select('id, name, phone_number, email_address, enquiry, email_message, how_did_you_hear, added_by, status, created_at, updated_at')
      .single();

    if (insertError) {
      console.error('❌ Supabase insert error:', insertError);
      return res.status(500).json({ 
        success: false, 
        error: 'Failed to save enquiry to database',
        details: insertError.message
      });
    }

    if (!enquiryResult) {
      console.error('❌ No data returned from insert');
      return res.status(500).json({
        success: false,
        error: 'Failed to retrieve saved enquiry'
      });
    }

    console.log(`✅ Enquiry saved with ID: ${enquiryResult.id}`);

    // 3. Process email template variables
    const processedEmailMessage = emailMessage
      .replace(/{{customer_name}}/g, name)
      .replace(/{{customer_email}}/g, emailAddress)
      .replace(/{{customer_enquiry}}/g, enquiry)
      .replace(/{{date}}/g, new Date().toLocaleDateString())
      .replace(/{{time}}/g, new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));

    // 4. Log email in email_logs table
    let emailLog = null;
    
    try {
      console.log('📝 Logging email in email_logs table...');
      const logPayload = {
        enquiry_id: enquiryResult.id,
        to_email: emailAddress,
        subject: 'Thank you for your enquiry - Spraditech',
        status: 'QUEUED',
        provider: 'pending',
        attempts: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      console.log('📧 Email log payload:', logPayload);
      emailLog = await emailLogger.logEmail(logPayload);

      if (!emailLog) {
        console.warn('⚠️ Email logging returned null');
      } else {
        console.log(`✅ Email logged with ID: ${emailLog.id}`);
      }
    } catch (logError) {
      console.error('❌ Email logging error:', logError.message);
      // Continue without email log
      console.log('⚠️ Continuing without email logging...');
    }

    // 5. Create email content using the processed template
    console.log('📧 Creating email content...');
    const emailHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Thank You for Your Enquiry</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
          .footer { text-align: center; margin-top: 30px; color: #666; font-size: 12px; }
          .button { display: inline-block; background: #667eea; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; margin: 10px 0; }
          .enquiry-details { background: white; padding: 15px; border-left: 4px solid #667eea; margin: 20px 0; }
          .contact-info { background: #e8f4fc; padding: 15px; border-radius: 5px; margin: 20px 0; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>Thank You, ${name}!</h1>
          <p>We've received your enquiry</p>
        </div>
        <div class="content">
          ${processedEmailMessage}
          
          <div class="enquiry-details">
            <h3>Your Contact Information:</h3>
            <p><strong>Name:</strong> ${name}</p>
            <p><strong>Email:</strong> ${emailAddress}</p>
            <p><strong>Phone:</strong> ${phoneNumber}</p>
            <p><strong>How you heard about us:</strong> ${howDidYouHear}</p>
          </div>
          
          <div class="contact-info">
            <p><strong>Our Contact Information:</strong></p>
            <p>📧 ${process.env.ADMIN_EMAIL || 'info@spraditech.ng'}</p>
            <p>📞 Customer Support</p>
          </div>
          
          <div class="footer">
            <p>This is an automated message. Please do not reply to this email.</p>
            <p>© ${new Date().getFullYear()} Spraditech. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    // Create plain text version
    const emailText = `
Thank you for your enquiry!

${processedEmailMessage.replace(/<[^>]*>/g, '')}

Your Contact Information:
Name: ${name}
Email: ${emailAddress}
Phone: ${phoneNumber}
How you heard about us: ${howDidYouHear}

Our Contact Information:
Email: ${process.env.ADMIN_EMAIL || 'info@spraditech.ng'}
Phone: Customer Support

This is an automated message. Please do not reply to this email.

© ${new Date().getFullYear()} Spraditech. All rights reserved.
    `.trim();

    // 6. Add email to queue for sending (only if logging succeeded)
    if (emailLog && emailLog.id) {
      try {
        console.log('📬 Adding email to queue...');
        
        const jobData = {
          logId: emailLog.id,
          email: {
            to: emailAddress,
            subject: 'Thank you for your enquiry - Spraditech',
            html: emailHtml,
            text: emailText
          }
        };
        
        console.log('📦 Job data:', JSON.stringify(jobData, null, 2));
        
        const job = await emailQueue.add('send-email', jobData, {
          jobId: `email-${enquiryResult.id}-${Date.now()}`,
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 2000
          },
          removeOnComplete: false,
          removeOnFail: false
        });
        
        console.log('✅ Email added to queue successfully. Job ID:', job.id);
        console.log('⏰ Job will be processed by the worker shortly...');
        
      } catch (queueError) {
        console.error('❌ Failed to add email to queue:', queueError.message);
        console.error('Queue error details:', queueError);
        
        // Update log status to indicate queue failure
        if (emailLog && emailLog.id) {
          try {
            await emailLogger.updateEmail(emailLog.id, {
              status: 'QUEUE_FAILED',
              error: queueError.message.substring(0, 255)
            });
          } catch (updateError) {
            console.error('❌ Failed to update email log status:', updateError.message);
          }
        }
      }
    } else {
      console.log('⚠️ Skipping email queue - email log was not created');
      console.log('📋 Email log result:', emailLog);
    }

    // 7. Return success response
    console.log('✅ Enquiry processed successfully');
    
    const response = { 
      success: true,
      message: 'Enquiry submitted successfully',
      enquiryId: enquiryResult.id,
      logId: emailLog ? emailLog.id : null,
      emailQueued: !!(emailLog && emailLog.id),
      timestamp: new Date().toISOString(),
      data: {
        id: enquiryResult.id.toString(),
        name: enquiryResult.name,
        phoneNumber: enquiryResult.phone_number,
        emailAddress: enquiryResult.email_address,
        enquiry: enquiryResult.enquiry,
        emailMessage: enquiryResult.email_message,
        howDidYouHear: enquiryResult.how_did_you_hear,
        addedBy: enquiryResult.added_by,
        status: enquiryResult.status || 'prospect',
        date: enquiryResult.created_at
      }
    };

    console.log('📤 Sending response to client...');
    console.log('📋 Response:', JSON.stringify(response, null, 2));
    res.json(response);

  } catch (error) {
    console.error('🔥 Unexpected error in add-enquiry route:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: process.env.NODE_ENV === 'development' ? error.message : 'Please try again later',
      ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
    });
  }
});

// GET endpoint to fetch enquiries
router.get('/', async (req, res) => {
  try {
    // DO NOT USE * - SELECT SPECIFIC COLUMNS
    const { data, error } = await supabase
      .from('enquiries')
      .select('id, name, phone_number, email_address, enquiry, email_message, how_did_you_hear, added_by, status, created_at, updated_at')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('❌ Error fetching enquiries:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch enquiries'
      });
    }

    // Transform data to match frontend interface
    const transformedData = data.map(item => ({
      id: item.id.toString(),
      name: item.name,
      phoneNumber: item.phone_number,
      emailAddress: item.email_address,
      enquiry: item.enquiry,
      emailMessage: item.email_message,
      howDidYouHear: item.how_did_you_hear,
      addedBy: item.added_by,
      status: item.status || 'prospect',
      date: item.created_at
    }));

    res.json({
      success: true,
      data: transformedData,
      count: transformedData.length
    });
  } catch (error) {
    console.error('❌ Error in GET /add-enquiry:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

module.exports = router;


// const express = require('express');
// const { createClient } = require('@supabase/supabase-js');
// const emailQueue = require('../queues/emailQueue');
// const emailLogger = require('../services/emailLogger');

// const router = express.Router();

// const supabase = createClient(
//   process.env.SUPABASE_URL,
//   process.env.SUPABASE_KEY
// );

// router.post('/', async (req, res) => {
//   console.log('📨 Received new enquiry request');
  
//   try {
//     // 1. Validate input (matching frontend validation)
//     const { 
//       name, 
//       phoneNumber, 
//       emailAddress, 
//       enquiry, 
//       emailMessage, 
//       howDidYouHear, 
//       addedBy 
//     } = req.body;
    
//     // Check all required fields from frontend
//     const requiredFields = { name, phoneNumber, emailAddress, enquiry, emailMessage, howDidYouHear, addedBy };
//     const missingFields = Object.keys(requiredFields).filter(field => !requiredFields[field]);
    
//     if (missingFields.length > 0) {
//       console.error('❌ Validation failed: Missing required fields:', missingFields);
//       return res.status(400).json({
//         success: false,
//         error: `Missing required fields: ${missingFields.join(', ')}`
//       });
//     }

//     // Validate email format
//     const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
//     if (!emailRegex.test(emailAddress)) {
//       return res.status(400).json({
//         success: false,
//         error: 'Invalid email address format'
//       });
//     }

//     console.log(`✅ Input validated for: ${name} <${emailAddress}>`);

//     // 2. Insert into enquiries table with ALL fields from frontend
//     console.log('💾 Inserting into enquiries table...');
//     const enquiryData = { 
//       name, 
//       phone_number: phoneNumber,
//       email_address: emailAddress, 
//       enquiry,
//       email_message: emailMessage,
//       how_did_you_hear: howDidYouHear,
//       added_by: addedBy,
//       status: 'prospect',
//       created_at: new Date().toISOString(),
//       updated_at: new Date().toISOString()
//     };
    
//     // SELECT SPECIFIC COLUMNS THAT EXIST - DO NOT USE *
//     const { data, error: insertError } = await supabase
//       .from('enquiries')
//       .insert([enquiryData])
//       .select('id, name, phone_number, email_address, enquiry, email_message, how_did_you_hear, added_by, status, created_at, updated_at')
//       .single();

//     if (insertError) {
//       console.error('❌ Supabase insert error:', insertError);
//       return res.status(500).json({ 
//         success: false, 
//         error: 'Failed to save enquiry to database',
//         details: insertError.message
//       });
//     }

//     console.log(`✅ Enquiry saved with ID: ${data.id}`);

//     // 3. Process email template variables
//     const processedEmailMessage = emailMessage
//       .replace(/{{customer_name}}/g, name)
//       .replace(/{{customer_email}}/g, emailAddress)
//       .replace(/{{customer_enquiry}}/g, enquiry)
//       .replace(/{{date}}/g, new Date().toLocaleDateString())
//       .replace(/{{time}}/g, new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));

//     // 4. Log email in email_logs table (optional - continue even if it fails)
//     let log = null;
//     try {
//       console.log('📝 Logging email in email_logs table...');
//       const logPayload = {
//         enquiry_id: data.id,
//         to_email: emailAddress,
//         subject: 'Thank you for your enquiry - Spraditech',
//         status: 'QUEUED',
//         provider: 'pending',
//         attempts: 0,
//         created_at: new Date().toISOString(),
//         updated_at: new Date().toISOString()
//       };

//       log = await emailLogger.logEmail(logPayload);
//       if (log) {
//         console.log(`✅ Email logged with ID: ${log.id}`);
//       }
//     } catch (logError) {
//       console.warn('⚠️ Email logging failed (continuing):', logError.message);
//     }

//     // 5. Create email content
//     const emailHtml = `
//       <!DOCTYPE html>
//       <html>
//       <head>
//         <meta charset="utf-8">
//         <meta name="viewport" content="width=device-width, initial-scale=1.0">
//         <title>Thank You for Your Enquiry</title>
//         <style>
//           body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
//           .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
//           .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
//           .footer { text-align: center; margin-top: 30px; color: #666; font-size: 12px; }
//           .button { display: inline-block; background: #667eea; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; margin: 10px 0; }
//           .enquiry-details { background: white; padding: 15px; border-left: 4px solid #667eea; margin: 20px 0; }
//           .contact-info { background: #e8f4fc; padding: 15px; border-radius: 5px; margin: 20px 0; }
//         </style>
//       </head>
//       <body>
//         <div class="header">
//           <h1>Thank You, ${name}!</h1>
//           <p>We've received your enquiry</p>
//         </div>
//         <div class="content">
//           ${processedEmailMessage}
          
//           <div class="enquiry-details">
//             <h3>Your Contact Information:</h3>
//             <p><strong>Name:</strong> ${name}</p>
//             <p><strong>Email:</strong> ${emailAddress}</p>
//             <p><strong>Phone:</strong> ${phoneNumber}</p>
//             <p><strong>How you heard about us:</strong> ${howDidYouHear}</p>
//           </div>
          
//           <div class="contact-info">
//             <p><strong>Our Contact Information:</strong></p>
//             <p>📧 ${process.env.ADMIN_EMAIL || 'info@spraditech.ng'}</p>
//             <p>📞 Customer Support</p>
//           </div>
          
//           <div class="footer">
//             <p>This is an automated message. Please do not reply to this email.</p>
//             <p>© ${new Date().getFullYear()} Spraditech. All rights reserved.</p>
//           </div>
//         </div>
//       </body>
//       </html>
//     `;

//     const emailText = `
// Thank you for your enquiry!

// ${processedEmailMessage.replace(/<[^>]*>/g, '')}

// Your Contact Information:
// Name: ${name}
// Email: ${emailAddress}
// Phone: ${phoneNumber}
// How you heard about us: ${howDidYouHear}

// Our Contact Information:
// Email: ${process.env.ADMIN_EMAIL || 'info@spraditech.ng'}
// Phone: Customer Support

// This is an automated message. Please do not reply to this email.

// © ${new Date().getFullYear()} Spraditech. All rights reserved.
//     `.trim();

//     // 6. Add email to queue for sending (only if logging succeeded)
//     if (log && log.id) {
//       try {
//         console.log('📬 Adding email to queue...');
//         await emailQueue.add('send-email', {
//           logId: log.id,
//           email: {
//             to: emailAddress,
//             subject: 'Thank you for your enquiry - Spraditech',
//             html: emailHtml,
//             text: emailText
//           }
//         }, {
//           jobId: `email-${data.id}-${Date.now()}`,
//           attempts: 3,
//           backoff: {
//             type: 'exponential',
//             delay: 2000
//           }
//         });
        
//         console.log('✅ Email added to queue successfully');
//       } catch (queueError) {
//         console.error('❌ Failed to add email to queue:', queueError.message);
//       }
//     }

//     // 7. Return success response matching frontend expectations
//     console.log('✅ Enquiry processed successfully');
//     res.json({ 
//       success: true,
//       message: 'Enquiry submitted successfully',
//       enquiryId: data.id,
//       logId: log ? log.id : null,
//       timestamp: new Date().toISOString(),
//       data: {
//         id: data.id.toString(),
//         name: data.name,
//         phoneNumber: data.phone_number,
//         emailAddress: data.email_address,
//         enquiry: data.enquiry,
//         emailMessage: data.email_message,
//         howDidYouHear: data.how_did_you_hear,
//         addedBy: data.added_by,
//         status: data.status || 'prospect',
//         date: data.created_at
//       }
//     });

//   } catch (error) {
//     console.error('🔥 Unexpected error in add-enquiry route:', error);
//     res.status(500).json({
//       success: false,
//       error: 'Internal server error',
//       message: process.env.NODE_ENV === 'development' ? error.message : 'Please try again later'
//     });
//   }
// });

// // GET endpoint to fetch enquiries - FIXED: Remove this endpoint or fix it
// router.get('/', async (req, res) => {
//   try {
//     // DO NOT USE * - SELECT SPECIFIC COLUMNS
//     const { data, error } = await supabase
//       .from('enquiries')
//       .select('id, name, phone_number, email_address, enquiry, email_message, how_did_you_hear, added_by, status, created_at, updated_at')
//       .order('created_at', { ascending: false });

//     if (error) {
//       console.error('❌ Error fetching enquiries:', error);
//       return res.status(500).json({
//         success: false,
//         error: 'Failed to fetch enquiries'
//       });
//     }

//     // Transform data to match frontend interface
//     const transformedData = data.map(item => ({
//       id: item.id.toString(),
//       name: item.name,
//       phoneNumber: item.phone_number,
//       emailAddress: item.email_address,
//       enquiry: item.enquiry,
//       emailMessage: item.email_message,
//       howDidYouHear: item.how_did_you_hear,
//       addedBy: item.added_by,
//       status: item.status || 'prospect',
//       date: item.created_at
//     }));

//     res.json({
//       success: true,
//       data: transformedData,
//       count: transformedData.length
//     });
//   } catch (error) {
//     console.error('❌ Error in GET /add-enquiry:', error);
//     res.status(500).json({
//       success: false,
//       error: 'Internal server error'
//     });
//   }
// });

// module.exports = router;



// require('dotenv').config();
// const express = require('express');
// const bodyParser = require('body-parser');
// const { createClient } = require('@supabase/supabase-js');
// const authenticateApiKey = require('../middlewares/apiKeyMiddleware');
// const router = express.Router();

// const { Resend } = require('resend');

// const resend = new Resend(process.env.RESEND_API_KEY);

// // Initialize Supabase client
// const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// async function sendWithRetry(sendFn, maxRetries = 3) {
//   let attempt = 0;

//   while (attempt < maxRetries) {
//     try {
//       return await sendFn();
//     } catch (err) {
//       attempt++;
//       if (attempt >= maxRetries) throw err;
//       await new Promise(r => setTimeout(r, attempt * 2000));
//     }
//   }
// }




// // Sign up endpoint with API key authentication
// router.post('/', async (req, res) => {
//   try {
//     const {
//       name,
//       phoneNumber,
//       emailAddress,
//       enquiry,
//       howDidYouHear,
//       addedBy,
//       emailMessage
//     } = req.body;

//     // Validate required fields
//     if (!name || !emailAddress || !enquiry || !addedBy) {
//       return res.status(400).json({
//         success: false,
//         error: 'Required fields are missing'
//       });
//     }

//     // Insert into Supabase
//     const { data, error } = await supabase
//       .from('enquiries')
//       .insert([
//         {
//           name,
//           phone_number: phoneNumber,
//           email_address: emailAddress,
//           enquiry,
//           how_did_you_hear: howDidYouHear,
//           added_by: addedBy,
//           email_message: emailMessage,
//           date: new Date().toISOString(),
//           status: 'prospect'
//         }
//       ])
//       .select()
//       .single();

//     if (error) throw error;

//     // Send email to prospect with Nodemailer
//     const emailSent = await sendProspectEmail({
//       name,
//       email: emailAddress,
//       enquiry,
//       emailMessage
//     });

//     // Send admin notification
//     await sendAdminNotification({
//       name,
//       email: emailAddress,
//       enquiry,
//       addedBy,
//       emailMessage,
//       phoneNumber
//     });

//     res.status(201).json({
//       success: true,
//       data,
//       emailSent,
//       message: 'Enquiry submitted successfully'
//     });
//   } catch (error) {
//     console.error('Error creating enquiry:', error);
//     res.status(500).json({
//       success: false,
//       error: error.message || 'Failed to submit enquiry'
//     });
//   }
// });


// // Nodemailer email service for HTML emails
// // async function sendProspectEmail({ name, email, enquiry, emailMessage }) {
// //   try {
//     //const transporter = createTransporter();
    
//     // Process template variables in the HTML
// //     const processedHtml = emailMessage
// //       .replace(/{{customer_name}}/g, name)
// //       .replace(/{{customer_email}}/g, email)
// //       .replace(/{{customer_enquiry}}/g, enquiry)
// //       .replace(/{{date}}/g, new Date().toLocaleDateString())
// //       .replace(/{{time}}/g, new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));

// //     // Create email template with proper HTML structure
// //     const fullHtml = `
// //       <!DOCTYPE html>
// // <html lang="en">
// //   <head>
// //     <meta charset="UTF-8" />
// //     <meta name="viewport" content="width=device-width, initial-scale=1.0" />
// //     <title>Enquiry Confirmation</title>

// //     <!-- Preheader (hidden preview text for inboxes) -->
// //     <style>
// //       .preheader {
// //         display: none !important;
// //         visibility: hidden;
// //         opacity: 0;
// //         color: transparent;
// //         height: 0;
// //         width: 0;
// //         overflow: hidden;
// //         mso-hide: all;
// //       }
// //     </style>

// //     <style>
// //       body {
// //         font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
// //           Helvetica, Arial, sans-serif;
// //         line-height: 1.6;
// //         color: #333333;
// //         background-color: #f9f9f9;
// //         margin: 0;
// //         padding: 20px;
// //       }

// //       .email-container {
// //         max-width: 600px;
// //         margin: 0 auto;
// //         background-color: #ffffff;
// //         border-radius: 8px;
// //         padding: 30px;
// //         box-shadow: 0 2px 4px rgba(0, 0, 0, 0.08);
// //       }

// //       .header {
// //         border-bottom: 3px solid #4f46e5;
// //         padding-bottom: 16px;
// //         margin-bottom: 24px;
// //       }

// //       h2 {
// //         margin: 0;
// //         color: #4f46e5;
// //       }

// //       .content {
// //         color: #374151;
// //         font-size: 16px;
// //       }

// //       .footer {
// //         margin-top: 32px;
// //         padding-top: 20px;
// //         border-top: 1px solid #e5e7eb;
// //         color: #6b7280;
// //         font-size: 14px;
// //       }

// //       a {
// //         color: #4f46e5;
// //         text-decoration: none;
// //       }
// //     </style>
// //   </head>

// //   <body>
// //     <!-- Preheader text -->
// //     <span class="preheader">
// //       We’ve received your enquiry and will get back to you shortly.
// //     </span>

// //     <div class="email-container">
// //       <div class="header">
// //         <h2>Thank You for Your Enquiry</h2>
// //       </div>

// //       <div class="content">
// //         ${processedHtml}
// //       </div>

// //       <div class="footer">
// //         <p>
// //           This is an automated message. Replies to this email are not monitored.
// //         </p>

// //         <p>
// //           If you have further questions, please contact our support team at
// //           <a href="mailto:info@spraditech.ng">info@spraditech.ng</a>.
// //         </p>

// //         <p>
// //           <strong>Spraditech Digital Solutions</strong><br />
// //           7, St. Finbarr's College Road, Pako Bus-Stop, Akoka, Lagos<br />
// //           <a href="https://spraditech.ng">https://spraditech.ng</a>
// //         </p>

// //         <p style="margin-top: 12px;">
// //           © 2026 Spraditech Digital Solutions. All rights reserved.
// //         </p>
// //       </div>
// //     </div>
// //   </body>
// // </html>

// //     `;

// //     const mailOptions = {
// //       from: `"Spraditech" <${process.env.EMAIL_USER || process.env.SMTP_USER}>`,
// //       to: email,
// //       subject: 'Thank You for Your Enquiry',
// //       html: fullHtml,
// //       text: processedHtml.replace(/<[^>]*>/g, ''), // Plain text fallback
// //     };

// //     const info = await transporter.sendMail(mailOptions);
// //     console.log('Email sent to prospect:', info.messageId);
// //     return { success: true, messageId: info.messageId };
// //   } catch (error) {
// //     console.error('Error sending prospect email:', error);
// //     return { success: false, error: error.message };
// //   }
// // }



// async function sendProspectEmail({ enquiryId, name, email, enquiry, emailMessage }) {

//   const processedHtml = emailMessage
//     .replace(/{{customer_name}}/g, name)
//     .replace(/{{customer_email}}/g, email)
//     .replace(/{{customer_enquiry}}/g, enquiry)
//     .replace(/{{date}}/g, new Date().toLocaleDateString());

//   // create log
//   const { data: log } = await supabase
//     .from('email_logs')
//     .insert([{
//       enquiry_id: enquiryId,
//       to_email: email,
//       subject: 'Thank you for your enquiry',
//       status: 'PENDING',
//       provider: 'resend'
//     }])
//     .select()
//     .single();

//   try {
//     const result = await sendWithRetry(() =>
//       resend.emails.send({
//         from: process.env.EMAIL_FROM,
//         to: email,
//         subject: 'Thank you for your enquiry',
//         html: processedHtml,
//         tags: [
//           { name: 'type', value: 'enquiry-confirmation' }
//         ]
//       })
//     );

//     await supabase
//       .from('email_logs')
//       .update({
//         status: 'SENT',
//         provider_message_id: result.id,
//         attempts: 1
//       })
//       .eq('id', log.id);

//     return { success: true };

//   } catch (error) {

//     await supabase
//       .from('email_logs')
//       .update({
//         status: 'FAILED',
//         error: error.message,
//         attempts: 1
//       })
//       .eq('id', log.id);

//     return { success: false };
//   }
// }



// async function sendAdminNotification({ name, email, enquiry, addedBy, emailMessage, phoneNumber }) {
//   try {
//     //const transporter = createTransporter();
    
//     const adminEmail = process.env.ADMIN_EMAIL || process.env.SMTP_USER;
//     if (!adminEmail) return;

//     const mailOptions = {
//       from: `"Spraditech" <${process.env.SMTP_FROM || process.env.EMAIL_USER}>`,
//       to: adminEmail,
//       subject: `New Enquiry Received: ${name}`,
//       html: `
//         <h3>New Enquiry Received</h3>
//         <p><strong>Name:</strong> ${name}</p>
//         <p><strong>Email:</strong> ${email}</p>
//         <p><strong>Phone:</strong> ${phoneNumber || 'Not provided'}</p>
//         <p><strong>Added By:</strong> ${addedBy}</p>
//         <p><strong>How they heard:</strong> ${howDidYouHear || 'Not specified'}</p>
//         <p><strong>Enquiry:</strong> ${enquiry}</p>
//         <p><strong>Email Content:</strong></p>
//         <div style="border: 1px solid #e5e7eb; padding: 15px; margin: 10px 0; background: #f9fafb;">
//           ${emailMessage}
//         </div>
//         <p><strong>Received:</strong> ${new Date().toLocaleString()}</p>
//       `,
//     };

//     const info = await transporter.sendMail(mailOptions);
//     console.log('Admin notification sent:', info.messageId);
//   } catch (error) {
//     console.error('Error sending admin notification:', error);
//   }
// }


// module.exports = router;
