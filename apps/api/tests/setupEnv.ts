// Environment for every test worker — set before any module reads config().
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgres://hydra_test:hydra_test_only@localhost:5434/hydra_test';
process.env.BCRYPT_COST = '4';
process.env.LOG_LEVEL = 'silent';
process.env.PAYMENT_PROVIDER = 'simulated';
process.env.STORAGE_PROVIDER = 'local';
process.env.LOCAL_UPLOAD_DIR = './.test-uploads';
process.env.EMAIL_PROVIDER = 'console';
process.env.DISABLE_RATE_LIMIT = 'true';
process.env.DISABLE_SCHEDULER = 'true';
process.env.PUBLIC_API_BASE_URL = 'http://localhost:4000';
process.env.GOOGLE_WEB_CLIENT_ID = 'test-web-client.apps.googleusercontent.com';
