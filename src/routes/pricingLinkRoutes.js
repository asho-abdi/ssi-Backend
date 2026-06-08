const express = require('express');
const {
  publicResolve,
  listPricingLinks,
  createPricingLink,
  updatePricingLink,
  deletePricingLink,
} = require('../controllers/pricingLinkController');
const { protect, requireRoles } = require('../middleware/auth');

const router = express.Router();

router.get('/resolve/:token', publicResolve);

router.use(protect, requireRoles('admin'));

router.get('/', listPricingLinks);
router.post('/', createPricingLink);
router.patch('/:id', updatePricingLink);
router.delete('/:id', deletePricingLink);

module.exports = router;
