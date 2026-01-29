const { Resend } = require('resend');

// Initialize Resend with API key
const resend = new Resend(process.env.RESEND_API_KEY);

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
