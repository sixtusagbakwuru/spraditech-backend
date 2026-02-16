const jwt = require('jsonwebtoken');

class JWTConfig {
  constructor() {
    this.secret = process.env.JWT_SECRET;
    this.refreshSecret = process.env.JWT_REFRESH_SECRET || this.secret + 'refresh';
    this.accessTokenExpiry = process.env.JWT_ACCESS_EXPIRY || '15m'; // 15 minutes
    this.refreshTokenExpiry = process.env.JWT_REFRESH_EXPIRY || '7d'; // 7 days
  }

  /**
   * Generate access token
   */
  generateAccessToken(user) {
    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      type: 'access'
    };

    return jwt.sign(payload, this.secret, {
      expiresIn: this.accessTokenExpiry
    });
  }

  /**
   * Generate refresh token
   */
  generateRefreshToken(user) {
    const payload = {
      sub: user.id,
      type: 'refresh'
    };

    return jwt.sign(payload, this.refreshSecret, {
      expiresIn: this.refreshTokenExpiry
    });
  }

  /**
   * Verify access token
   */
  verifyAccessToken(token) {
    try {
      const decoded = jwt.verify(token, this.secret);
      return { valid: true, decoded };
    } catch (error) {
      return { 
        valid: false, 
        error: error.name === 'TokenExpiredError' ? 'Token expired' : 'Invalid token' 
      };
    }
  }

  /**
   * Verify refresh token
   */
  verifyRefreshToken(token) {
    try {
      const decoded = jwt.verify(token, this.refreshSecret);
      return { valid: true, decoded };
    } catch (error) {
      return { 
        valid: false, 
        error: error.name === 'TokenExpiredError' ? 'Refresh token expired' : 'Invalid refresh token' 
      };
    }
  }

  /**
   * Generate both tokens
   */
  generateTokens(user) {
    return {
      accessToken: this.generateAccessToken(user),
      refreshToken: this.generateRefreshToken(user)
    };
  }
}

module.exports = new JWTConfig();