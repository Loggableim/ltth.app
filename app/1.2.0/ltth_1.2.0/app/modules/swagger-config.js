/**
 * Swagger/OpenAPI Configuration
 */

const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Pup Cid\'s Little TikTok Helper API',
      version: '1.0.0',
      description: 'Professional TikTok LIVE streaming tool API',
      license: {
        name: 'MIT',
        url: 'https://opensource.org/licenses/MIT',
      },
    },
    servers: [
      {
        url: 'http://localhost:3000',
        description: 'Development server',
      },
    ],
    components: {
      schemas: {
        Error: {
          type: 'object',
          properties: {
            error: { type: 'string' }
          }
        }
      }
    }
  },
  apis: ['./server.js', './modules/*.js'],
};

const swaggerSpec = swaggerJsdoc(options);

/**
 * Setup Swagger UI for Express app
 */
function setupSwagger(app) {
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
}

module.exports = { setupSwagger, swaggerSpec };
