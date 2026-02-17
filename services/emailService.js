const { Resend } = require('resend');

// Initialize Resend with API key
const resend = new Resend(process.env.RESEND_API_KEY || "re_g228m86J_Dj82WavMZqUoLq1rswgBkXDN");

exports.send = async ({ to, subject, html, text }) => {
  try {
    console.log(`📤 Attempting to send email to: ${to}`);
    console.log(`📧 Subject: ${subject}`);
    
    const { data, error } = await resend.emails.send({
      from: process.env.EMAIL_FROM || 'Spraditech <info@spraditech.ng>',
      to: Array.isArray(to) ? to : [to],
      subject: subject,
      html: html,
      text: text || html.replace(/<[^>]*>/g, '') // Create plain text version if not provided
    });

    if (error) {
      console.error('❌ Resend API error:', error);
      throw new Error(`Resend API error: ${JSON.stringify(error)}`);
    }

    console.log(`✅ Email sent successfully via Resend. Email ID: ${data.id}`);
    return {
      success: true,
      data: data,
      providerId: data.id,
      provider: 'resend'
    };
  } catch (error) {
    console.error('❌ Email sending failed:', error);
    throw error;
  }
};

// Optional: Method to send to multiple recipients
exports.sendToMultiple = async ({ recipients, subject, html, text }) => {
  try {
    const { data, error } = await resend.emails.send({
      from: process.env.EMAIL_FROM || 'Spraditech <info@spraditech.ng>',
      to: recipients,
      subject: subject,
      html: html,
      text: text || html.replace(/<[^>]*>/g, '')
    });

    if (error) throw error;
    
    return {
      success: true,
      data: data,
      providerId: data.id,
      provider: 'resend'
    };
  } catch (error) {
    console.error('❌ Batch email sending failed:', error);
    throw error;
  }
};


/**
 * Send password reset email
 */
exports.sendPasswordResetEmail = async ({ to, firstName, resetLink }) => {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #1a202c; margin: 0; padding: 0; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 40px 30px; text-align: center; border-radius: 12px 12px 0 0; }
        .header h1 { margin: 0; font-size: 28px; }
        .content { padding: 40px 30px; background: #ffffff; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 12px 12px; }
        .reset-box { background: #f7fafc; padding: 24px; border-radius: 8px; margin: 24px 0; border-left: 4px solid #667eea; }
        .button { background: #667eea; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; display: inline-block; margin-top: 20px; font-weight: 500; }
        .button:hover { background: #5a67d8; }
        .footer { padding: 30px; text-align: center; font-size: 14px; color: #718096; background: #f7fafc; border-radius: 12px; margin-top: 20px; }
        .warning { color: #e53e3e; font-size: 14px; margin-top: 16px; }
        .link-box { background: #edf2f7; padding: 12px; border-radius: 6px; font-family: monospace; font-size: 14px; word-break: break-all; margin: 16px 0; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>🔐 Password Reset Request</h1>
          <p style="font-size: 18px; margin-top: 10px; opacity: 0.95;">Reset your Spraditech password</p>
        </div>
        <div class="content">
          <h2 style="margin-top: 0; color: #2d3748;">Hello ${firstName},</h2>
          <p style="font-size: 16px;">We received a request to reset your password for your Spraditech account.</p>
          
          <div class="reset-box">
            <p style="margin-bottom: 16px;">Click the button below to reset your password. This link will expire in <strong>1 hour</strong>.</p>
            
            <div style="text-align: center;">
              <a href="${resetLink}" class="button">🔐 Reset Your Password</a>
            </div>
            
            <p style="margin-top: 24px; margin-bottom: 8px; font-size: 14px; color: #666;">If the button doesn't work, copy and paste this link into your browser:</p>
            <div class="link-box">${resetLink}</div>
          </div>
          
          <p class="warning">⚠️ If you didn't request this password reset, please ignore this email or contact support if you have concerns.</p>
          
          <div style="margin-top: 32px; padding-top: 24px; border-top: 1px solid #e2e8f0;">
            <p style="margin: 0; color: #4a5568;">For security reasons, this link will expire in 1 hour.</p>
          </div>
        </div>
        <div class="footer">
          <p style="margin: 0 0 8px 0;">&copy; ${new Date().getFullYear()} Spraditech Digital Solutions. All rights reserved.</p>
          <p style="margin: 0;">Need help? Contact <a href="mailto:support@spraditech.ng" style="color: #667eea;">support@spraditech.ng</a></p>
        </div>
      </div>
    </body>
    </html>
  `;

  const text = `
    Password Reset Request - Spraditech
    
    Hello ${firstName},
    
    We received a request to reset your password for your Spraditech account.
    
    Click the link below to reset your password. This link will expire in 1 hour:
    ${resetLink}
    
    If you didn't request this password reset, please ignore this email or contact support if you have concerns.
    
    For security reasons, this link will expire in 1 hour.
    
    Need help? Contact support@spraditech.ng
    
    © ${new Date().getFullYear()} Spraditech Digital Solutions. All rights reserved.
  `;

  return await this.send({
    to,
    subject: 'Reset Your Spraditech Password',
    html,
    text
  });
};

/**
 * Send password reset confirmation email
 */
exports.sendPasswordResetConfirmationEmail = async ({ to, firstName }) => {
  const appUrl = process.env.APP_URL || "https://spraditech.ng"
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #1a202c; margin: 0; padding: 0; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #48bb78 0%, #38a169 100%); color: white; padding: 40px 30px; text-align: center; border-radius: 12px 12px 0 0; }
        .header h1 { margin: 0; font-size: 28px; }
        .content { padding: 40px 30px; background: #ffffff; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 12px 12px; }
        .button { background: #48bb78; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; display: inline-block; margin-top: 20px; font-weight: 500; }
        .button:hover { background: #38a169; }
        .footer { padding: 30px; text-align: center; font-size: 14px; color: #718096; background: #f7fafc; border-radius: 12px; margin-top: 20px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>✅ Password Reset Successful</h1>
          <p style="font-size: 18px; margin-top: 10px; opacity: 0.95;">Your password has been changed</p>
        </div>
        <div class="content">
          <h2 style="margin-top: 0; color: #2d3748;">Hello ${firstName},</h2>
          <p style="font-size: 16px;">Your Spraditech account password has been successfully reset.</p>
          
          <div style="background: #f0fff4; padding: 24px; border-radius: 8px; margin: 24px 0; border-left: 4px solid #48bb78;">
            <p style="margin: 0; color: #22543d;">You can now log in to your account using your new password.</p>
          </div>
          
          <div style="text-align: center;">
            <a href="${appUrl}/auth/login" class="button">🔑 Go to Login</a>
          </div>
          
          <p style="margin-top: 32px; color: #4a5568;">If you didn't make this change, please contact our support team immediately.</p>
        </div>
        <div class="footer">
          <p style="margin: 0 0 8px 0;">&copy; ${new Date().getFullYear()} Spraditech Digital Solutions. All rights reserved.</p>
          <p style="margin: 0;">Need help? Contact <a href="mailto:support@spraditech.ng" style="color: #48bb78;">support@spraditech.ng</a></p>
        </div>
      </div>
    </body>
    </html>
  `;

  const text = `
    Password Reset Successful - Spraditech
    
    Hello ${firstName},
    
    Your Spraditech account password has been successfully reset.
    
    You can now log in to your account using your new password.
    
    Login here: ${appUrl}/auth/login
    
    If you didn't make this change, please contact our support team immediately.
    
    Need help? Contact support@spraditech.ng
    
    © ${new Date().getFullYear()} Spraditech Digital Solutions. All rights reserved.
  `;

  return await this.send({
    to,
    subject: 'Your Spraditech Password Has Been Reset',
    html,
    text
  });
};