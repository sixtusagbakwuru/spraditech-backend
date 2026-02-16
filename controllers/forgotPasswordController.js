const { supabase } = require('../config/supabaseClient');
const crypto = require('crypto');
const emailService = require('../services/emailService');
const enrollmentService = require('../services/enrollmentService');
const emailQueue = require('../queues/emailQueue'); // Fix: Import the queue directly
const emailLogger = require('../services/emailLogger');

class ForgotPasswordController {
  constructor() {
    // Bind methods to ensure 'this' context
    this.requestReset = this.requestReset.bind(this);
    this.verifyToken = this.verifyToken.bind(this);
    this.resetPassword = this.resetPassword.bind(this);
    this.queuePasswordResetEmail = this.queuePasswordResetEmail.bind(this);
    this.queuePasswordResetConfirmationEmail = this.queuePasswordResetConfirmationEmail.bind(this);
  }

  /**
   * Request password reset (send email with reset link)
   */
  async requestReset(req, res) {
    try {
      const { email } = req.body;

      console.log('📧 Password reset requested for email:', email);

      if (!email) {
        return res.status(400).json({
          success: false,
          error: 'Email is required'
        });
      }

      // Check if user exists
      const { data: user, error: userError } = await supabase
        .from('users')
        .select('id, email, first_name, last_name')
        .eq('email', email.toLowerCase().trim())
        .single();

      // Don't reveal if user exists or not (security best practice)
      if (userError || !user) {
        console.log('ℹ️ Password reset requested for non-existent email:', email);
        return res.status(200).json({
          success: true,
          message: 'If your email exists in our system, you will receive a password reset link'
        });
      }

      // Generate secure reset token
      const resetToken = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 1); // Token expires in 1 hour

      // Store token in database
      const { error: tokenError } = await supabase
        .from('password_reset_tokens')
        .insert({
          user_id: user.id,
          token: resetToken,
          expires_at: expiresAt.toISOString(),
          used: false
        });

      if (tokenError) {
        console.error('❌ Error storing reset token:', tokenError);
        throw new Error('Failed to generate reset token');
      }

      // Create reset link
      const resetLink = `${process.env.APP_URL}/auth/reset-password?token=${resetToken}`;

      // Queue password reset email - use await to ensure it completes
      await this.queuePasswordResetEmail(user, resetLink);

      console.log('✅ Password reset email queued for:', user.email);

      return res.status(200).json({
        success: true,
        message: 'If your email exists in our system, you will receive a password reset link'
      });

    } catch (error) {
      console.error('🔥 Password reset request error:', error);
      return res.status(500).json({
        success: false,
        error: 'An error occurred while processing your request'
      });
    }
  }

  /**
   * Queue password reset email
   */
  async queuePasswordResetEmail(user, resetLink) {
    try {
      console.log(`📧 Queueing password reset email for ${user.email}`);

      // Create email log entry
      const logEntry = await emailLogger.logEmail({
        enquiry_id: null,
        to_email: user.email,
        subject: 'Reset Your Spraditech Password',
        status: 'PENDING',
        provider: 'resend',
        attempts: 0,
        events_history: JSON.stringify([{
          type: 'password_reset_email_queued',
          userId: user.id,
          firstName: user.first_name,
          email: user.email,
          timestamp: new Date().toISOString()
        }])
      });

      if (!logEntry || !logEntry.id) {
        console.error('❌ Failed to create email log entry');
        throw new Error('Failed to create email log entry');
      }

      // Generate email content
      const emailContent = {
        to: user.email,
        firstName: user.first_name || 'Student',
        resetLink: resetLink
      };

      // Check if emailQueue is properly imported
      if (!emailQueue) {
        console.error('❌ emailQueue is undefined');
        throw new Error('Email queue not initialized');
      }

      // Add job to queue
      const job = await emailQueue.add('send-password-reset', {
        logId: logEntry.id,
        email: emailContent
      }, {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000
        },
        removeOnComplete: true,
        removeOnFail: false
      });

      console.log(`📧 Password reset email queued for ${user.email} - Job ID: ${job.id}, Log ID: ${logEntry.id}`);
      return { jobId: job.id, logId: logEntry.id };

    } catch (error) {
      console.error('❌ Error queueing password reset email:', error);
      throw error;
    }
  }

  /**
   * Verify reset token
   */
  async verifyToken(req, res) {
    try {
      const { token } = req.params;

      console.log('🔍 Verifying reset token:', token?.substring(0, 10) + '...');

      if (!token) {
        return res.status(400).json({
          success: false,
          error: 'Token is required'
        });
      }

      // Find valid token
      const { data: resetToken, error: tokenError } = await supabase
        .from('password_reset_tokens')
        .select(`
          *,
          users (id, email, first_name, last_name)
        `)
        .eq('token', token)
        .eq('used', false)
        .gte('expires_at', new Date().toISOString())
        .single();

      if (tokenError || !resetToken) {
        console.log('❌ Invalid or expired token');
        return res.status(400).json({
          success: false,
          error: 'Invalid or expired reset token'
        });
      }

      console.log('✅ Token is valid for user:', resetToken.users.email);

      return res.status(200).json({
        success: true,
        data: {
          valid: true,
          email: resetToken.users.email,
          firstName: resetToken.users.first_name
        },
        message: 'Token is valid'
      });

    } catch (error) {
      console.error('🔥 Token verification error:', error);
      return res.status(500).json({
        success: false,
        error: 'An error occurred while verifying token'
      });
    }
  }

  /**
   * Reset password with token
   */
  async resetPassword(req, res) {
    try {
      const { token, newPassword, confirmPassword } = req.body;

      console.log('🔐 Password reset attempt with token:', token?.substring(0, 10) + '...');

      // Validate input
      if (!token || !newPassword || !confirmPassword) {
        return res.status(400).json({
          success: false,
          error: 'Token, new password, and confirm password are required'
        });
      }

      if (newPassword !== confirmPassword) {
        return res.status(400).json({
          success: false,
          error: 'Passwords do not match'
        });
      }

      // Validate password strength
      if (newPassword.length < 8) {
        return res.status(400).json({
          success: false,
          error: 'Password must be at least 8 characters long'
        });
      }

      // Find valid token
      const { data: resetToken, error: tokenError } = await supabase
        .from('password_reset_tokens')
        .select('*')
        .eq('token', token)
        .eq('used', false)
        .gte('expires_at', new Date().toISOString())
        .single();

      if (tokenError || !resetToken) {
        console.log('❌ Invalid or expired token');
        return res.status(400).json({
          success: false,
          error: 'Invalid or expired reset token'
        });
      }

      // Hash new password
      const hashedPassword = await enrollmentService.hashPassword(newPassword);

      // Update password in users table
      const { error: updateError } = await supabase
        .from('users')
        .update({
          password: hashedPassword,
          updated_at: new Date().toISOString()
        })
        .eq('id', resetToken.user_id);

      if (updateError) {
        console.error('❌ Error updating password:', updateError);
        throw new Error('Failed to update password');
      }

      // Mark token as used
      const { error: useTokenError } = await supabase
        .from('password_reset_tokens')
        .update({
          used: true,
          updated_at: new Date().toISOString()
        })
        .eq('id', resetToken.id);

      if (useTokenError) {
        console.error('❌ Error marking token as used:', useTokenError);
        // Continue anyway - this is not critical
      }

      // Also update password in Supabase Auth
      try {
        await supabase.auth.admin.updateUserById(
          resetToken.user_id,
          { password: newPassword }
        );
      } catch (authError) {
        console.error('⚠️ Supabase Auth password update failed:', authError.message);
        // Continue even if Auth update fails
      }

      // Get user details for confirmation email
      const { data: user, error: userError } = await supabase
        .from('users')
        .select('email, first_name')
        .eq('id', resetToken.user_id)
        .single();

      if (userError || !user) {
        console.error('❌ Error fetching user for confirmation email:', userError);
      } else {
        // Queue password reset confirmation email
        await this.queuePasswordResetConfirmationEmail(user);
      }

      console.log('✅ Password reset successful for user:', resetToken.user_id);

      return res.status(200).json({
        success: true,
        message: 'Password reset successful. You can now log in with your new password.'
      });

    } catch (error) {
      console.error('🔥 Password reset error:', error);
      return res.status(500).json({
        success: false,
        error: 'An error occurred while resetting your password'
      });
    }
  }

  /**
   * Queue password reset confirmation email
   */
  async queuePasswordResetConfirmationEmail(user) {
    try {
      console.log(`📧 Queueing password reset confirmation email for ${user.email}`);

      const logEntry = await emailLogger.logEmail({
        enquiry_id: null,
        to_email: user.email,
        subject: 'Your Spraditech Password Has Been Reset',
        status: 'PENDING',
        provider: 'resend',
        attempts: 0,
        events_history: JSON.stringify([{
          type: 'password_reset_confirmation_queued',
          userId: user.id,
          firstName: user.first_name,
          email: user.email,
          timestamp: new Date().toISOString()
        }])
      });

      if (!logEntry || !logEntry.id) {
        console.error('❌ Failed to create email log entry');
        throw new Error('Failed to create email log entry');
      }

      // Check if emailQueue is properly imported
      if (!emailQueue) {
        console.error('❌ emailQueue is undefined');
        throw new Error('Email queue not initialized');
      }

      const job = await emailQueue.add('send-password-reset-confirmation', {
        logId: logEntry.id,
        email: {
          to: user.email,
          firstName: user.first_name || 'Student'
        }
      }, {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000
        },
        removeOnComplete: true,
        removeOnFail: false
      });

      console.log(`📧 Password reset confirmation email queued for ${user.email} - Job ID: ${job.id}`);
      return { jobId: job.id, logId: logEntry.id };

    } catch (error) {
      console.error('❌ Error queueing password reset confirmation email:', error);
      throw error;
    }
  }
}

// Export a single instance with methods properly bound
module.exports = new ForgotPasswordController();