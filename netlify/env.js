// Imported first by each function, before the server's settings are read.
// /tmp is the only writable folder on Netlify; it holds the short-lived download cache.
process.env.APP_HOST = 'netlify';
process.env.DATA_DIR = '/tmp/industry-intelligence';
