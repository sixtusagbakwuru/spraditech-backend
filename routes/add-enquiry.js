require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const nodemailer = require('nodemailer');
const { createClient } = require('@supabase/supabase-js');
const authenticateApiKey = require('../middlewares/apiKeyMiddleware');
const router = express.Router();

// Initialize Supabase client
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// Nodemailer setup
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST || 'mail.spraditech.ng',
  port: process.env.EMAIL_PORT || 587,
  auth: {
    user: process.env.EMAIL_USER || 'info@spraditech.ng',
    pass: process.env.EMAIL_PASS || '@Pijaya2026'
  }
});


// Sign up endpoint with API key authentication
router.post('/', async (req, res) => {
  try {
    const {
      name,
      phoneNumber,
      emailAddress,
      enquiry,
      howDidYouHear,
      addedBy,
      emailMessage
    } = req.body;

    // Validate required fields
    if (!name || !emailAddress || !enquiry || !addedBy) {
      return res.status(400).json({
        success: false,
        error: 'Required fields are missing'
      });
    }

    // Insert into Supabase
    const { data, error } = await supabase
      .from('enquiries')
      .insert([
        {
          name,
          phone_number: phoneNumber,
          email_address: emailAddress,
          enquiry,
          how_did_you_hear: howDidYouHear,
          added_by: addedBy,
          email_message: emailMessage,
          date: new Date().toISOString(),
          status: 'prospect'
        }
      ])
      .select()
      .single();

    if (error) throw error;

    // Send email to prospect with Nodemailer
    const emailSent = await sendProspectEmail({
      name,
      email: emailAddress,
      enquiry,
      emailMessage
    });

    // Send admin notification
    await sendAdminNotification({
      name,
      email: emailAddress,
      enquiry,
      addedBy,
      emailMessage,
      phoneNumber
    });

    res.status(201).json({
      success: true,
      data,
      emailSent,
      message: 'Enquiry submitted successfully'
    });
  } catch (error) {
    console.error('Error creating enquiry:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to submit enquiry'
    });
  }
});


// Nodemailer email service for HTML emails
async function sendProspectEmail({ name, email, enquiry, emailMessage }) {
  try {
    //const transporter = createTransporter();
    
    // Process template variables in the HTML
    const processedHtml = emailMessage
      .replace(/{{customer_name}}/g, name)
      .replace(/{{customer_email}}/g, email)
      .replace(/{{customer_enquiry}}/g, enquiry)
      .replace(/{{date}}/g, new Date().toLocaleDateString())
      .replace(/{{time}}/g, new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));

    // Create email template with proper HTML structure
    const fullHtml = `
      <!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Enquiry Confirmation</title>

    <!-- Preheader (hidden preview text for inboxes) -->
    <style>
      .preheader {
        display: none !important;
        visibility: hidden;
        opacity: 0;
        color: transparent;
        height: 0;
        width: 0;
        overflow: hidden;
        mso-hide: all;
      }
    </style>

    <style>
      body {
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
          Helvetica, Arial, sans-serif;
        line-height: 1.6;
        color: #333333;
        background-color: #f9f9f9;
        margin: 0;
        padding: 20px;
      }

      .email-container {
        max-width: 600px;
        margin: 0 auto;
        background-color: #ffffff;
        border-radius: 8px;
        padding: 30px;
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.08);
      }

      .header {
        border-bottom: 3px solid #4f46e5;
        padding-bottom: 16px;
        margin-bottom: 24px;
      }

      h2 {
        margin: 0;
        color: #4f46e5;
      }

      .content {
        color: #374151;
        font-size: 16px;
      }

      .footer {
        margin-top: 32px;
        padding-top: 20px;
        border-top: 1px solid #e5e7eb;
        color: #6b7280;
        font-size: 14px;
      }

      a {
        color: #4f46e5;
        text-decoration: none;
      }
    </style>
  </head>

  <body>
    <!-- Preheader text -->
    <span class="preheader">
      We’ve received your enquiry and will get back to you shortly.
    </span>

    <div class="email-container">
      <div class="header">
        <h2>Thank You for Your Enquiry</h2>
      </div>

      <div class="content">
        ${processedHtml}
      </div>

      <div class="footer">
        <p>
          This is an automated message. Replies to this email are not monitored.
        </p>

        <p>
          If you have further questions, please contact our support team at
          <a href="mailto:info@spraditech.ng">info@spraditech.ng</a>.
        </p>

        <p>
          <strong>Spraditech Digital Solutions</strong><br />
          7, St. Finbarr's College Road, Pako Bus-Stop, Akoka, Lagos<br />
          <a href="https://spraditech.ng">https://spraditech.ng</a>
        </p>

        <p style="margin-top: 12px;">
          © 2026 Spraditech Digital Solutions. All rights reserved.
        </p>
      </div>
    </div>
  </body>
</html>

    `;

    const mailOptions = {
      from: `"Spraditech" <${process.env.EMAIL_USER || process.env.SMTP_USER}>`,
      to: email,
      subject: 'Thank You for Your Enquiry',
      html: fullHtml,
      text: processedHtml.replace(/<[^>]*>/g, ''), // Plain text fallback
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('Email sent to prospect:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('Error sending prospect email:', error);
    return { success: false, error: error.message };
  }
}

async function sendAdminNotification({ name, email, enquiry, addedBy, emailMessage, phoneNumber }) {
  try {
    //const transporter = createTransporter();
    
    const adminEmail = process.env.ADMIN_EMAIL || process.env.SMTP_USER;
    if (!adminEmail) return;

    const mailOptions = {
      from: `"Spraditech" <${process.env.SMTP_FROM || process.env.EMAIL_USER}>`,
      to: adminEmail,
      subject: `New Enquiry Received: ${name}`,
      html: `
        <h3>New Enquiry Received</h3>
        <p><strong>Name:</strong> ${name}</p>
        <p><strong>Email:</strong> ${email}</p>
        <p><strong>Phone:</strong> ${phoneNumber || 'Not provided'}</p>
        <p><strong>Added By:</strong> ${addedBy}</p>
        <p><strong>How they heard:</strong> ${howDidYouHear || 'Not specified'}</p>
        <p><strong>Enquiry:</strong> ${enquiry}</p>
        <p><strong>Email Content:</strong></p>
        <div style="border: 1px solid #e5e7eb; padding: 15px; margin: 10px 0; background: #f9fafb;">
          ${emailMessage}
        </div>
        <p><strong>Received:</strong> ${new Date().toLocaleString()}</p>
      `,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('Admin notification sent:', info.messageId);
  } catch (error) {
    console.error('Error sending admin notification:', error);
  }
}


module.exports = router;
