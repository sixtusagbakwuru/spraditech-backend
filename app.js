var createError = require('http-errors');
var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');
const bodyParser = require('body-parser');
const cors = require('cors');

require('dotenv').config();

var indexRoute = require('./routes/index');
var addEnquiryRoute = require('./routes/add-enquiry');
var apiEnquiriesRoute = require('./routes/api/enquiries');
// Add these imports
var analyticsRoutes = require('./routes/api/analytics');
var webhookRoutes = require('./webhooks/resendWebhook');
var enrollmentRoutes = require('./routes/api/enrollment');
var authRoutes = require('./routes/api/auth');
var protectedRoutes = require('./routes/api/protected');
var dashboardRoutes = require('./routes/api/dashboard');
var forgotPasswordRoutes = require('./routes/api/forgotPassword');
var assignmentRoutes = require('./routes/api/assignments');

// Import the email worker
require('./workers/emailWorker');

var app = express();
var serverPort = process.env.PORT || 4000;

const corsOptions = {
  origin: '*', // Allow all origins for testing, update as needed
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: false,
  optionsSuccessStatus: 200
};

// Apply CORS middleware to all routes
app.use(cors(corsOptions));

// Use middleware
app.use(logger('dev'));
// app.use(express.json());
// app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));



// Set up routes
app.use('/', indexRoute);
app.use('/add-enquiry', addEnquiryRoute);
app.use('/api/enquiries', apiEnquiriesRoute);
// Add these to your routes
app.use('/api/analytics', analyticsRoutes);
app.use('/webhooks', webhookRoutes);
app.use('/api/enrollment', enrollmentRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/protected', protectedRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/forgot-password', forgotPasswordRoutes);
app.use('/api/assignments', assignmentRoutes);

// catch 404 and forward to error handler
app.use(function(req, res, next) {
  next(createError(404));
});

// Error handler
app.use(function(err, req, res, next) {
  // Set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // Log the error
  console.error('🔥 Error:', err.message);
  console.error('📌 Stack:', err.stack);

  // Send JSON response for API errors
  if (req.originalUrl.startsWith('/api') || req.originalUrl.startsWith('/add-enquiry')) {
    return res.status(err.status || 500).json({
      success: false,
      error: err.message || 'Internal Server Error',
      ...(req.app.get('env') === 'development' && { stack: err.stack })
    });
  }

  // Render the error page
  res.status(err.status || 500);
  res.json({
    success: false,
    error: err.message || 'Internal Server Error'
  });
});

// Start the server
app.listen(serverPort, () => {
  console.log('🚀 App is running on port ' + serverPort);
  console.log('📧 Email worker started and ready to process jobs');
  console.log('🌐 CORS enabled for all origins');
  console.log(`🔗 API Base URL: http://localhost:${serverPort}`);
});

module.exports = app;


// var createError = require('http-errors');
// var express = require('express');
// var path = require('path');
// var cookieParser = require('cookie-parser');
// var logger = require('morgan');
// const bodyParser = require('body-parser');
// const cors = require('cors');

// require('dotenv').config();

// var indexRoute = require('./routes/index');
// var addEnquiryRoute = require('./routes/add-enquiry');

// var app = express();
// var serverPort = 4000
// const corsOptions = {
//   origin: '*', // Allow all origins for testing, update as needed
//   optionsSuccessStatus: 200
// };
// app.use(cors(corsOptions));

// // Use middleware
// app.use(logger('dev'));
// app.use(express.json());
// app.use(express.urlencoded({ extended: false }));
// app.use(cookieParser());
// app.use(express.static(path.join(__dirname, 'public')));


// // Set up routes
// app.use('/', indexRoute);
// app.use('/add-enquiry', addEnquiryRoute);

// // catch 404 and forward to error handler
// app.use(function(req, res, next){
//     next(createError(404));
// });

// // Start the server
// app.listen(serverPort, () => {
//   console.log('App is running on port ' + serverPort);
// });
