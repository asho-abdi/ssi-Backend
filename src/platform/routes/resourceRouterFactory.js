const express = require('express');
const { createResourceController } = require('../controllers/resourceController');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/rbac');
const { validateObjectId } = require('../middleware/validateObjectId');

function createResourceRouter(Model, config = {}) {
  const router = express.Router();
  const ctrl = createResourceController(Model, config);
  const readRoles = config.readRoles || ['admin', 'teacher', 'editor', 'student'];
  const writeRoles = config.writeRoles || ['admin', 'teacher', 'editor'];

  router.get('/', authenticate, authorize(...readRoles), ctrl.list);
  router.get('/:id', authenticate, authorize(...readRoles), validateObjectId('id'), ctrl.getById);
  router.post('/', authenticate, authorize(...writeRoles), ctrl.create);
  router.patch('/:id', authenticate, authorize(...writeRoles), validateObjectId('id'), ctrl.update);
  router.delete('/:id', authenticate, authorize(...writeRoles), validateObjectId('id'), ctrl.remove);

  return router;
}

module.exports = { createResourceRouter };
