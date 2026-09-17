// Loads .env.test before Jest runs any test suite.
// Must be a .cjs file because jest.config.cjs runs in CommonJS context.
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env.test') });
