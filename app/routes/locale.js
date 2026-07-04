const express = require('express');
const i18n = require('../modules/i18n');
const logger = require('../modules/logger');

const router = express.Router();

router.get('/:locale', (req, res) => {
  try {
    const locale = String(req.params.locale || '').trim().toLowerCase();
    const availableLocales = i18n.getAvailableLocales();

    if (!availableLocales.includes(locale)) {
      return res.status(404).json({ error: 'Locale not found' });
    }

    const translations = i18n.getAllTranslations(locale);
    if (!translations || Object.keys(translations).length === 0) {
      return res.status(404).json({ error: 'Locale not found' });
    }

    res.json(translations);
  } catch (error) {
    logger.error('Error getting locale translations:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
