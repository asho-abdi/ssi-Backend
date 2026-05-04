const PlatformSettings = require('../models/PlatformSettings');

async function getSettingsDoc() {
  let settings = await PlatformSettings.findOne({ key: 'default' });
  if (!settings) settings = await PlatformSettings.create({ key: 'default' });
  return settings;
}

async function getInstructorPercentage() {
  const settings = await getSettingsDoc();
  return Math.max(0, Math.min(100, Number(settings?.payment?.instructor_commission_percent ?? 70)));
}

function calculateEarnings(totalAmount, instructorPercentage) {
  const amount = Math.max(0, Number(totalAmount || 0));
  const pct = Math.max(0, Math.min(100, Number(instructorPercentage || 0)));
  const instructor = Number(((amount * pct) / 100).toFixed(2));
  const admin = Number((amount - instructor).toFixed(2));
  return {
    instructor_percentage: pct,
    instructor_earning: instructor,
    admin_earning: admin,
  };
}

module.exports = {
  getInstructorPercentage,
  calculateEarnings,
};
