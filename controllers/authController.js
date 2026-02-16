const { supabase } = require('../config/supabaseClient');
const enrollmentService = require('../services/enrollmentService');
const jwtConfig = require('../config/jwt');
const emailService = require('../services/emailService');

class AuthController {
  /**
   * Login user and return JWT tokens
   */
  async login(req, res) {
    try {
      const { email, password } = req.body;

      console.log('📝 Login attempt for email:', email);

      // Validate required fields
      if (!email || !password) {
        return res.status(400).json({
          success: false,
          error: 'Email and password are required'
        });
      }

      // 1. Get user from database with hashed password
      const { data: user, error: userError } = await supabase
        .from('users')
        .select(`
          id, 
          email, 
          password, 
          first_name, 
          last_name, 
          phone,
          role,
          created_at,
          updated_at
        `)
        .eq('email', email.toLowerCase().trim())
        .single();

      if (userError || !user) {
        console.error('❌ User not found:', email);
        return res.status(401).json({
          success: false,
          error: 'Invalid email or password'
        });
      }

      // 2. Verify password using bcrypt
      const isValidPassword = await enrollmentService.verifyPassword(password, user.password);

      if (!isValidPassword) {
        console.error('❌ Invalid password for user:', email);
        return res.status(401).json({
          success: false,
          error: 'Invalid email or password'
        });
      }

      console.log('✅ Password verified for user:', user.id);

      // 3. Generate JWT tokens
      const tokens = jwtConfig.generateTokens(user);

      // 4. Remove password from user object
      delete user.password;

      // 5. Get user profile data
      const { data: studentProfile } = await supabase
        .from('student_profiles')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      // 6. Get user's enrollments
      const { data: enrollments } = await supabase
        .from('enrollments')
        .select(`
          *,
          course:course_id (
            id,
            title,
            description,
            duration
          )
        `)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      // 7. Prepare user data for frontend
      const userData = {
        id: user.id,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        phone: user.phone,
        role: user.role,
        created_at: user.created_at,
        profile: studentProfile || null,
        enrollments: enrollments || []
      };

      // 8. Log successful login
      console.log('✅ Login successful for user:', user.email);

      // 9. Return response with tokens and user data
      return res.status(200).json({
        success: true,
        data: {
          user: userData,
          tokens
        },
        message: 'Login successful'
      });

    } catch (error) {
      console.error('🔥 Login error:', error);
      return res.status(500).json({
        success: false,
        error: error.message || 'Login failed'
      });
    }
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshToken(req, res) {
    try {
      const { refreshToken } = req.body;

      if (!refreshToken) {
        return res.status(400).json({
          success: false,
          error: 'Refresh token required'
        });
      }

      // Verify refresh token
      const result = jwtConfig.verifyRefreshToken(refreshToken);

      if (!result.valid) {
        return res.status(403).json({
          success: false,
          error: result.error
        });
      }

      // Get user from database
      const { data: user, error } = await supabase
        .from('users')
        .select('id, email, first_name, last_name, role')
        .eq('id', result.decoded.sub)
        .single();

      if (error || !user) {
        return res.status(403).json({
          success: false,
          error: 'User not found'
        });
      }

      // Generate new tokens
      const tokens = jwtConfig.generateTokens(user);

      return res.status(200).json({
        success: true,
        data: { tokens },
        message: 'Token refreshed successfully'
      });

    } catch (error) {
      console.error('🔥 Token refresh error:', error);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * Logout user (client should discard tokens)
   */
  async logout(req, res) {
    try {
      // With JWT, logout is handled client-side by discarding tokens
      // But we can optionally blacklist the token if you implement that
      
      return res.status(200).json({
        success: true,
        message: 'Logout successful'
      });
    } catch (error) {
      console.error('🔥 Logout error:', error);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * Get current user profile
   */
  async getCurrentUser(req, res) {
    try {
      const userId = req.user.id;

      // Get user data
      const { data: user, error: userError } = await supabase
        .from('users')
        .select(`
          id,
          email,
          first_name,
          last_name,
          phone,
          role,
          created_at,
          updated_at
        `)
        .eq('id', userId)
        .single();

      if (userError || !user) {
        return res.status(404).json({
          success: false,
          error: 'User not found'
        });
      }

      // Get student profile
      const { data: studentProfile } = await supabase
        .from('student_profiles')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

      // Get enrollments
      const { data: enrollments } = await supabase
        .from('enrollments')
        .select(`
          *,
          course:course_id (
            id,
            title,
            description,
            duration
          )
        `)
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      const userData = {
        ...user,
        profile: studentProfile || null,
        enrollments: enrollments || []
      };

      return res.status(200).json({
        success: true,
        data: userData
      });

    } catch (error) {
      console.error('🔥 Get current user error:', error);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * Change password
   */
  async changePassword(req, res) {
    try {
      const { currentPassword, newPassword } = req.body;
      const userId = req.user.id;

      if (!currentPassword || !newPassword) {
        return res.status(400).json({
          success: false,
          error: 'Current password and new password are required'
        });
      }

      // Get user with current password
      const { data: user, error: userError } = await supabase
        .from('users')
        .select('id, email, password')
        .eq('id', userId)
        .single();

      if (userError || !user) {
        return res.status(404).json({
          success: false,
          error: 'User not found'
        });
      }

      // Verify current password
      const isValidPassword = await enrollmentService.verifyPassword(currentPassword, user.password);

      if (!isValidPassword) {
        return res.status(401).json({
          success: false,
          error: 'Current password is incorrect'
        });
      }

      // Hash new password
      const hashedNewPassword = await enrollmentService.hashPassword(newPassword);

      // Update password in users table
      const { error: updateError } = await supabase
        .from('users')
        .update({
          password: hashedNewPassword,
          updated_at: new Date().toISOString()
        })
        .eq('id', userId);

      if (updateError) {
        console.error('❌ Password update error:', updateError);
        return res.status(500).json({
          success: false,
          error: 'Failed to update password'
        });
      }

      // Also update password in Supabase Auth (optional)
      try {
        await supabase.auth.admin.updateUserById(
          userId,
          { password: newPassword }
        );
      } catch (authError) {
        console.error('⚠️ Supabase Auth password update failed:', authError.message);
        // Continue even if Auth update fails
      }

      return res.status(200).json({
        success: true,
        message: 'Password changed successfully'
      });

    } catch (error) {
      console.error('🔥 Change password error:', error);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * Request password reset
   */
  async requestPasswordReset(req, res) {
    try {
      const { email } = req.body;

      if (!email) {
        return res.status(400).json({
          success: false,
          error: 'Email is required'
        });
      }

      // Check if user exists
      const { data: user, error: userError } = await supabase
        .from('users')
        .select('id, email, first_name')
        .eq('email', email.toLowerCase().trim())
        .single();

      if (userError || !user) {
        // Don't reveal that user doesn't exist for security
        return res.status(200).json({
          success: true,
          message: 'If your email exists in our system, you will receive a password reset link'
        });
      }

      // Generate reset token
      const resetToken = jwt.sign(
        { sub: user.id, type: 'password-reset' },
        process.env.JWT_SECRET,
        { expiresIn: '1h' }
      );

      // Store reset token in database (optional - for tracking)
      // You might want to create a password_resets table

      // Send password reset email
      const resetLink = `${process.env.APP_URL}/reset-password?token=${resetToken}`;
      
      await emailService.sendEmail({
        to: user.email,
        subject: 'Password Reset Request - Spraditech',
        html: this.generatePasswordResetEmail(user.first_name, resetLink),
        text: `Click the following link to reset your password: ${resetLink}`
      });

      console.log(`📧 Password reset email sent to ${email}`);

      return res.status(200).json({
        success: true,
        message: 'If your email exists in our system, you will receive a password reset link'
      });

    } catch (error) {
      console.error('🔥 Password reset request error:', error);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * Reset password with token
   */
  async resetPassword(req, res) {
    try {
      const { token, newPassword } = req.body;

      if (!token || !newPassword) {
        return res.status(400).json({
          success: false,
          error: 'Token and new password are required'
        });
      }

      // Verify reset token
      let decoded;
      try {
        decoded = jwt.verify(token, process.env.JWT_SECRET);
      } catch (error) {
        return res.status(400).json({
          success: false,
          error: error.name === 'TokenExpiredError' 
            ? 'Password reset link has expired' 
            : 'Invalid password reset link'
        });
      }

      if (decoded.type !== 'password-reset') {
        return res.status(400).json({
          success: false,
          error: 'Invalid reset token'
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
        .eq('id', decoded.sub);

      if (updateError) {
        console.error('❌ Password reset error:', updateError);
        return res.status(500).json({
          success: false,
          error: 'Failed to reset password'
        });
      }

      // Also update in Supabase Auth
      try {
        await supabase.auth.admin.updateUserById(
          decoded.sub,
          { password: newPassword }
        );
      } catch (authError) {
        console.error('⚠️ Supabase Auth password update failed:', authError.message);
      }

      return res.status(200).json({
        success: true,
        message: 'Password reset successful'
      });

    } catch (error) {
      console.error('🔥 Password reset error:', error);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * Generate password reset email HTML
   */
  generatePasswordResetEmail(firstName, resetLink) {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { padding: 30px; background: #f9f9f9; border-radius: 0 0 10px 10px; }
          .button { background: #667eea; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block; margin-top: 20px; }
          .footer { padding: 20px; text-align: center; font-size: 12px; color: #666; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Password Reset Request</h1>
          </div>
          <div class="content">
            <h2>Hello ${firstName},</h2>
            <p>We received a request to reset your password for your Spraditech account.</p>
            <p>Click the button below to reset your password. This link will expire in 1 hour.</p>
            <div style="text-align: center;">
              <a href="${resetLink}" class="button">Reset Password</a>
            </div>
            <p style="margin-top: 30px;">If you didn't request this, please ignore this email or contact support if you have concerns.</p>
          </div>
          <div class="footer">
            <p>&copy; ${new Date().getFullYear()} Spraditech Digital Solutions. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }
}

module.exports = new AuthController();