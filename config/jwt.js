const jwt = require('jsonwebtoken');

class JWTConfig {
  constructor() {
    this.secret = process.env.JWT_SECRET || "a9f7c4e6d82b5a1f9e3c7d4b2a6f8e1c3d5b7a9e2c4f6d8b1a3c5e7f9d2b4a6c8e1f3d5b7a9c2e4f6d8b1a3c5e7f9d2";
    this.refreshSecret = process.env.JWT_REFRESH_SECRET || "6c3e9a4d8f2b7c1e5a9d3f6b8c2e7a1f4d9c6b3e8f2a7d1c5e9b4f6a2d8c3e7f1a5d9c2b6e8f4a7c1d3b5e9f2a6c8d4" || this.secret + 'refresh';
    this.accessTokenExpiry = process.env.JWT_ACCESS_EXPIRY || '50m'; // 50 minutes
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