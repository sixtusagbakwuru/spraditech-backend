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

var app = express();
var serverPort = 4000
const corsOptions = {
  origin: '*', // Allow all origins for testing, update as needed
  optionsSuccessStatus: 200
};
app.use(cors(corsOptions));

// Use middleware
app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));


// Set up routes
app.use('/', indexRoute);
app.use('/add-enquiry', addEnquiryRoute);

// catch 404 and forward to error handler
app.use(function(req, res, next){
    next(createError(404));
});

// Start the server
app.listen(serverPort, () => {
  console.log('App is running on port ' + serverPort);
});
