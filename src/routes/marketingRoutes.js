const express = require('express');
const {
  listBanners,
  listActiveBanners,
  createBanner,
  updateBanner,
  deleteBanner,
  listCampaigns,
  createCampaign,
  updateCampaign,
  deleteCampaign,
  listEmailCampaigns,
  createEmailCampaign,
  updateEmailCampaign,
  deleteEmailCampaign,
  marketingOverview,
} = require('../controllers/marketingController');
const { protect, requireRoles } = require('../middleware/auth');

const router = express.Router();

router.get('/banners/active', listActiveBanners);

router.use(protect, requireRoles('admin'));

router.get('/overview', marketingOverview);

router.get('/banners', listBanners);
router.post('/banners', createBanner);
router.patch('/banners/:id', updateBanner);
router.delete('/banners/:id', deleteBanner);

router.get('/campaigns', listCampaigns);
router.post('/campaigns', createCampaign);
router.patch('/campaigns/:id', updateCampaign);
router.delete('/campaigns/:id', deleteCampaign);

router.get('/email-campaigns', listEmailCampaigns);
router.post('/email-campaigns', createEmailCampaign);
router.patch('/email-campaigns/:id', updateEmailCampaign);
router.delete('/email-campaigns/:id', deleteEmailCampaign);

module.exports = router;
