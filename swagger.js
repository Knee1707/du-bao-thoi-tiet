const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Weather Forecast API',
      version: '1.0.0',
      description: 'Weather forecast backend with authentication and analytics.'
    },
    servers: [{ url: 'http://localhost:3000' }]
  },
  apis: ['./routes/*.js', './controllers/*.js']
};

module.exports = swaggerJsdoc(options);
