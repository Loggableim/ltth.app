const cheerio = require('cheerio');

const REMOVED_TAGS = [
  'script',
  'style',
  'iframe',
  'object',
  'embed',
  'meta',
  'link'
];

function isSafeUrl(value, attribute) {
  const url = String(value || '').trim();

  if (!url) {
    return true;
  }

  if (url.startsWith('#') || url.startsWith('/') || url.startsWith('./') || url.startsWith('../')) {
    return true;
  }

  if (attribute === 'src' && /^data:image\//i.test(url)) {
    return true;
  }

  return /^(https?:|mailto:)/i.test(url);
}

function sanitizeHtml(html) {
  const $ = cheerio.load(String(html || ''), { decodeEntities: false }, false);

  REMOVED_TAGS.forEach(tag => $(tag).remove());

  $('*').each((_, element) => {
    const attributes = element.attribs || {};

    for (const [name, value] of Object.entries(attributes)) {
      const lowerName = name.toLowerCase();

      if (lowerName.startsWith('on') || lowerName === 'srcdoc') {
        $(element).removeAttr(name);
        continue;
      }

      if ((lowerName === 'href' || lowerName === 'src') && !isSafeUrl(value, lowerName)) {
        $(element).removeAttr(name);
      }
    }
  });

  return $.html();
}

module.exports = {
  sanitizeHtml
};
