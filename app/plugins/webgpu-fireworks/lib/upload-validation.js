'use strict';

const fs = require('fs');
const path = require('path');

const ACCEPTED_MIME_TYPES = Object.freeze({
  mp3: Object.freeze(['audio/mpeg', 'audio/mp3']),
  wav: Object.freeze(['audio/wav', 'audio/x-wav', 'audio/wave']),
  ogg: Object.freeze(['audio/ogg', 'video/ogg', 'application/ogg']),
  webm: Object.freeze(['audio/webm', 'video/webm']),
  mp4: Object.freeze(['audio/mp4', 'video/mp4']),
  gif: Object.freeze(['image/gif']),
  png: Object.freeze(['image/png']),
  jpg: Object.freeze(['image/jpeg']),
  jpeg: Object.freeze(['image/jpeg'])
});

const SIGNATURES = {
  id3: Buffer.from('ID3', 'ascii'),
  riff: Buffer.from('RIFF', 'ascii'),
  wave: Buffer.from('WAVE', 'ascii'),
  ogg: Buffer.from('OggS', 'ascii'),
  webm: Buffer.from('1a45dfa3', 'hex'),
  ftyp: Buffer.from('ftyp', 'ascii'),
  gif87a: Buffer.from('GIF87a', 'ascii'),
  gif89a: Buffer.from('GIF89a', 'ascii'),
  png: Buffer.from('89504e470d0a1a0a', 'hex'),
  jpeg: Buffer.from('ffd8ff', 'hex')
};

class UploadValidationError extends Error {
  constructor(code, message, status = 415) {
    super(message);
    this.name = 'UploadValidationError';
    this.code = code;
    this.status = status;
  }
}

function validateUploadMetadata(file) {
  const originalname = typeof file?.originalname === 'string' ? file.originalname : '';
  const extension = path.extname(originalname).slice(1).toLowerCase();
  const mimetype = typeof file?.mimetype === 'string' ? file.mimetype : '';
  const acceptedMimes = ACCEPTED_MIME_TYPES[extension];

  if (!acceptedMimes) {
    throw new UploadValidationError(
      'UNSUPPORTED_UPLOAD_EXTENSION',
      `Unsupported upload extension: ${extension || 'none'}`
    );
  }

  if (!acceptedMimes.includes(mimetype)) {
    throw new UploadValidationError(
      'UPLOAD_MIME_MISMATCH',
      `MIME type ${mimetype || 'missing'} does not match .${extension}`
    );
  }

  return { extension, mimetype };
}

function hasBytesAt(header, expected, offset = 0) {
  return Buffer.isBuffer(header) &&
    header.length >= offset + expected.length &&
    header.subarray(offset, offset + expected.length).equals(expected);
}

function validateUploadSignature(extension, header) {
  let valid = false;

  switch (extension) {
  case 'mp3':
    valid = hasBytesAt(header, SIGNATURES.id3) ||
      (Buffer.isBuffer(header) && header.length >= 2 &&
        header[0] === 0xff && (header[1] & 0xe0) === 0xe0);
    break;
  case 'wav':
    valid = hasBytesAt(header, SIGNATURES.riff) && hasBytesAt(header, SIGNATURES.wave, 8);
    break;
  case 'ogg':
    valid = hasBytesAt(header, SIGNATURES.ogg);
    break;
  case 'webm':
    valid = hasBytesAt(header, SIGNATURES.webm);
    break;
  case 'mp4':
    valid = hasBytesAt(header, SIGNATURES.ftyp, 4);
    break;
  case 'gif':
    valid = hasBytesAt(header, SIGNATURES.gif87a) || hasBytesAt(header, SIGNATURES.gif89a);
    break;
  case 'png':
    valid = hasBytesAt(header, SIGNATURES.png);
    break;
  case 'jpg':
  case 'jpeg':
    valid = hasBytesAt(header, SIGNATURES.jpeg);
    break;
  default:
    throw new UploadValidationError(
      'UNSUPPORTED_UPLOAD_EXTENSION',
      `Unsupported upload extension: ${extension || 'none'}`
    );
  }

  if (!valid) {
    throw new UploadValidationError(
      'UPLOAD_SIGNATURE_MISMATCH',
      `File signature does not match .${extension}`
    );
  }

  return true;
}

async function readUploadHeader(filePath, maxBytes = 64) {
  let handle;
  try {
    handle = await fs.promises.open(filePath, 'r');
    const requestedBytes = Number.isInteger(maxBytes) ? maxBytes : 64;
    const readLength = Math.min(64, Math.max(0, requestedBytes));
    const header = Buffer.alloc(readLength);
    const { bytesRead } = await handle.read(header, 0, readLength, 0);
    return header.subarray(0, bytesRead);
  } finally {
    if (handle) {
      await handle.close();
    }
  }
}

async function validateStoredUpload(file) {
  const metadata = validateUploadMetadata(file);
  const header = await readUploadHeader(file.path);
  validateUploadSignature(metadata.extension, header);
  return metadata;
}

module.exports = {
  UploadValidationError,
  validateUploadMetadata,
  validateUploadSignature,
  readUploadHeader,
  validateStoredUpload
};
