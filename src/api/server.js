require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');
const { insertSpecialist, insertBusiness } = require('./database');

const app = express();

// ==========================================
// SECURITY MIDDLEWARE
// ==========================================

// Helmet security headers
app.use(helmet({
  contentSecurityPolicy: false, // CSP handled via meta tags in frontend
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}));

// Rate limiting - 100 requests per 15 minutes per IP
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'الكثير من الطلبات، يرجى المحاولة لاحقاً' // Too many requests
  },
  skip: (req) => req.path === '/health', // Skip rate limiting for health checks
  handler: (req, res, next, options) => {
    // Log rate limit violations for security monitoring
    console.warn(`[SECURITY] Rate limit exceeded: IP=${req.ip}, Path=${req.path}, Time=${new Date().toISOString()}`);
    res.status(options.statusCode).json(options.message);
  }
});
app.use('/api/', limiter);

// Security logging middleware
app.use((req, res, next) => {
  // Log suspicious patterns
  const suspiciousPatterns = [
    /<script/i,
    /javascript:/i,
    /on\w+=/i,
    /SELECT.*FROM/i,
    /UNION.*SELECT/i,
    /INSERT.*INTO/i,
    /DROP.*TABLE/i
  ];

  const body = JSON.stringify(req.body || {});
  const query = JSON.stringify(req.query || {});
  const combined = body + query;

  if (suspiciousPatterns.some(pattern => pattern.test(combined))) {
    console.warn(`[SECURITY] Suspicious request detected: IP=${req.ip}, Path=${req.path}, Time=${new Date().toISOString()}`);
  }

  next();
});

// CORS configuration
app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? ['https://royaraqamia.com', 'https://www.royaraqamia.com']
    : ['http://localhost:3000', 'http://127.0.0.1:3000', 'http://localhost:5173'],
  credentials: true,
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '1mb' })); // Reduced limit for security
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// ==========================================
// VALIDATION HELPERS
// ==========================================

// Common validation rules
const sanitizeString = (value) => {
  if (typeof value !== 'string') return '';
  return value
    .trim()
    .replace(/<[^>]*>/g, '') // Remove HTML tags
    .replace(/[<>"'&]/g, '') // Remove dangerous characters
    .substring(0, 1000); // Limit length
};

// Specialist validation rules
const specialistValidation = [
  body('name').trim().notEmpty().withMessage('الاسم مطلوب').isLength({ max: 200 }).escape(),
  body('email').isEmail().withMessage('البريد الإلكتروني غير صالح').normalizeEmail(),
  body('phone').trim().notEmpty().withMessage('رقم الهاتف مطلوب').isLength({ max: 20 }),
  body('country').optional().trim().isLength({ max: 100 }).escape(),
  body('title').optional().trim().isLength({ max: 200 }).escape(),
  body('experience').optional().trim().isLength({ max: 50 }).escape(),
  body('specialization').optional().trim().isLength({ max: 100 }).escape(),
  body('bio').optional().trim().isLength({ max: 1000 }).escape(),
  body('services').optional().trim().isLength({ max: 500 }).escape(),
  body('certifications').optional().trim().isLength({ max: 500 }).escape(),
  body('portfolio').optional().trim().isURL().withMessage('رابط المعرض غير صالح'),
  body('linkedin').optional().trim().isURL().withMessage('رابط LinkedIn غير صالح'),
  body('availability').optional().trim().isLength({ max: 50 }).escape(),
  body('rate').optional().trim().isLength({ max: 50 }).escape()
];

// Business validation rules
const businessValidation = [
  body('name').trim().notEmpty().withMessage('الاسم مطلوب').isLength({ max: 200 }).escape(),
  body('email').isEmail().withMessage('البريد الإلكتروني غير صالح').normalizeEmail(),
  body('phone').trim().notEmpty().withMessage('رقم الهاتف مطلوب').isLength({ max: 20 }),
  body('position').optional().trim().isLength({ max: 200 }).escape(),
  body('company').optional().trim().isLength({ max: 200 }).escape(),
  body('industry').optional().trim().isLength({ max: 100 }).escape(),
  body('size').optional().trim().isLength({ max: 50 }).escape(),
  body('description').optional().trim().isLength({ max: 1000 }).escape(),
  body('website').optional().trim().isURL().withMessage('رابط الموقع غير صالح'),
  body('needs').optional().trim().isLength({ max: 200 }).escape(),
  body('expertise').optional().trim().isLength({ max: 500 }).escape(),
  body('projectDetails').optional().trim().isLength({ max: 1000 }).escape(),
  body('budget').optional().trim().isLength({ max: 50 }).escape(),
  body('timeline').optional().trim().isLength({ max: 50 }).escape()
];

// Validation error handler middleware
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: 'بيانات غير صالحة', // Invalid data
      details: errors.array().map(e => ({ field: e.path, message: e.msg }))
    });
  }
  next();
};

// ==========================================
// ROUTES
// ==========================================

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Specialist registration endpoint
app.post('/api/specialist', specialistValidation, handleValidationErrors, async (req, res) => {
  try {
    // Sanitize all string fields
    const sanitizedData = {};
    for (const [key, value] of Object.entries(req.body)) {
      if (key !== 'terms') {
        sanitizedData[key] = sanitizeString(value);
      }
    }

    const result = await insertSpecialist(sanitizedData);
    res.json({ success: true, id: result.insertId });
  } catch (error) {
    console.error('Error inserting specialist:', error);
    // Don't expose internal error details in production
    res.status(500).json({
      success: false,
      error: process.env.NODE_ENV === 'production'
        ? 'حدث خطأ في معالجة الطلب' // Error processing request
        : error.message
    });
  }
});

// Business registration endpoint
app.post('/api/business', businessValidation, handleValidationErrors, async (req, res) => {
  try {
    // Sanitize all string fields
    const sanitizedData = {};
    for (const [key, value] of Object.entries(req.body)) {
      if (key !== 'terms') {
        sanitizedData[key] = sanitizeString(value);
      }
    }

    const result = await insertBusiness(sanitizedData);
    res.json({ success: true, id: result.insertId });
  } catch (error) {
    console.error('Error inserting business:', error);
    // Don't expose internal error details in production
    res.status(500).json({
      success: false,
      error: process.env.NODE_ENV === 'production'
        ? 'حدث خطأ في معالجة الطلب' // Error processing request
        : error.message
    });
  }
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ success: false, error: 'المسار غير موجود' }); // Path not found
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    success: false,
    error: process.env.NODE_ENV === 'production'
      ? 'حدث خطأ في الخادم' // Server error
      : err.message
  });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});