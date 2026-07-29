const fs = require('fs');
const yauzl = require('yauzl');
const zlib = require('zlib');

function openZip(zipPath) {
  return new Promise((resolve, reject) => {
    yauzl.open(zipPath, { lazyEntries: true }, (error, zipFile) => {
      if (error) {
        reject(error);
      } else {
        resolve(zipFile);
      }
    });
  });
}

async function listZipFileEntries(zipPath) {
  const zipFile = await openZip(zipPath);
  const entries = [];

  return new Promise((resolve, reject) => {
    zipFile.readEntry();
    zipFile.on('entry', (entry) => {
      entries.push(entry);
      zipFile.readEntry();
    });
    zipFile.on('end', () => resolve(entries));
    zipFile.on('error', reject);
  });
}

function readZipEntryBytes(descriptor, entry) {
  const localHeader = Buffer.alloc(30);
  const headerBytesRead = fs.readSync(
    descriptor,
    localHeader,
    0,
    localHeader.length,
    entry.relativeOffsetOfLocalHeader
  );
  if (headerBytesRead !== localHeader.length) {
    throw new Error(`${entry.fileName} has an incomplete local ZIP header`);
  }
  if (localHeader.readUInt32LE(0) !== 0x04034b50) {
    throw new Error(`${entry.fileName} has an invalid local ZIP header`);
  }

  const fileNameLength = localHeader.readUInt16LE(26);
  const extraFieldLength = localHeader.readUInt16LE(28);
  const dataStart = entry.relativeOffsetOfLocalHeader + localHeader.length + fileNameLength + extraFieldLength;
  const compressedBytes = Buffer.alloc(entry.compressedSize);
  const bytesRead = fs.readSync(descriptor, compressedBytes, 0, compressedBytes.length, dataStart);
  if (bytesRead !== compressedBytes.length) {
    throw new Error(`${entry.fileName} has incomplete ZIP entry data`);
  }

  let bytes;
  if (entry.compressionMethod === 0) {
    bytes = compressedBytes;
  } else if (entry.compressionMethod === 8) {
    bytes = zlib.inflateRawSync(compressedBytes);
  } else {
    throw new Error(`${entry.fileName} uses unsupported ZIP compression method ${entry.compressionMethod}`);
  }

  if (bytes.length !== entry.uncompressedSize) {
    throw new Error(`${entry.fileName} does not match its declared ZIP size`);
  }
  return bytes;
}

async function readZipEntries(zipPath) {
  const entries = await listZipFileEntries(zipPath);
  const descriptor = fs.openSync(zipPath, 'r');
  try {
    return new Map(entries
      .filter((entry) => !entry.fileName.endsWith('/'))
      .map((entry) => [
        entry.fileName.replace(/\\/g, '/'),
        readZipEntryBytes(descriptor, entry)
      ]));
  } finally {
    fs.closeSync(descriptor);
  }
}

module.exports = {
  readZipEntries
};
