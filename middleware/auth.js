const jwtConfig = require('../config/jwt');
const { supabase } = require('../config/supabaseClient');

/**
 * Middleware to authenticate JWT token
 */
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'Access token required'
      });
    }

    // Verify token
    const result = jwtConfig.verifyAccessToken(token);

    if (!result.valid) {
      return res.status(403).json({
        success: false,
        error: result.error
      });
    }

    // Get user from database to ensure they still exist
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

    // Attach user to request
    req.user = user;
    next();
  } catch (error) {
    console.error('❌ Auth middleware error:', error);
    return res.status(500).json({
      success: false,
      error: 'Authentication failed'
    });
  }
};

/**
 * Middleware to check if user has required role
 */
const authorize = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'User not authenticated'
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: 'Insufficient permissions'
      });
    }

    next();
  };
};

/**
 * Optional authentication (doesn't fail if no token)
 */
const optionalAuthenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      req.user = null;
      return next();
    }

    const result = jwtConfig.verifyAccessToken(token);

    if (result.valid) {
      const { data: user } = await supabase
        .from('users')
        .select('id, email, first_name, last_name, role')
        .eq('id', result.decoded.sub)
        .single();

      req.user = user || null;
    } else {
      req.user = null;
    }

    next();
  } catch (error) {
    req.user = null;
    next();
  }
};

module.exports = {
  authenticate,
  authorize,
  optionalAuthenticate
};