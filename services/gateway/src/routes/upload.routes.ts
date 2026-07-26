import { Router, Request, Response, NextFunction } from 'express';
import { ValidationError } from '@tournament/shared';
import { logger } from '../logger.js';
import crypto from 'crypto';
import path from 'path';

// For dynamic loading of optional firebase-admin
declare function require(module: string): unknown;

/**
 * File upload routes — handles multipart uploads and stores files.
 *
 * Storage backend is configurable via environment variables:
 *   STORAGE_PROVIDER=firebase|local
 *
 * Firebase Storage (default):
 *   FIREBASE_STORAGE_BUCKET — bucket name (e.g., 'olimpicapp-b1a70.appspot.com')
 *   FIREBASE_SERVICE_ACCOUNT_JSON — path to service account JSON file OR inline JSON
 *
 * Local Storage (development fallback):
 *   LOCAL_UPLOAD_DIR — directory for local file storage (default: ./uploads)
 *   LOCAL_UPLOAD_BASE_URL — base URL for serving files (default: http://localhost:3000/uploads)
 */

const router = Router();

// Config from environment
const STORAGE_PROVIDER = process.env['STORAGE_PROVIDER'] ?? 'local';
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_MIMES = [
  'image/jpeg', 'image/png', 'image/webp', 'image/gif',
  'application/pdf',
];

/**
 * POST /upload
 * Accepts multipart/form-data with a 'file' field.
 * Optional query param: ?folder=profiles (default: 'uploads')
 *
 * Returns: { data: { url, path, fileName }, success: true }
 */
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Express doesn't parse multipart by default — we read the raw body
    // Since we're using express.json() globally, multipart needs special handling.
    // We'll use a simple buffer-based approach for the unified server.

    const contentType = req.headers['content-type'] ?? '';
    if (!contentType.includes('multipart/form-data')) {
      return next(new ValidationError('Content-Type debe ser multipart/form-data'));
    }

    // Parse multipart manually using built-in approach
    const chunks: Buffer[] = [];
    await new Promise<void>((resolve, reject) => {
      req.on('data', (chunk: Buffer) => {
        chunks.push(chunk);
        // Check size limit during upload
        const totalSize = chunks.reduce((sum, c) => sum + c.length, 0);
        if (totalSize > MAX_FILE_SIZE) {
          reject(new Error('File too large'));
        }
      });
      req.on('end', resolve);
      req.on('error', reject);
    });

    const body = Buffer.concat(chunks);
    const boundary = contentType.split('boundary=')[1];
    if (!boundary) {
      return next(new ValidationError('Missing multipart boundary'));
    }

    // Extract file from multipart body
    const file = parseMultipartFile(body, boundary);
    if (!file) {
      return next(new ValidationError('No se encontró el campo "file" en la solicitud'));
    }

    // Validate MIME type
    if (!ALLOWED_MIMES.includes(file.mimeType)) {
      return next(new ValidationError(`Tipo de archivo no permitido: ${file.mimeType}. Use: JPG, PNG, WebP, GIF o PDF.`));
    }

    const folder = (req.query['folder'] as string) ?? 'uploads';
    const ext = path.extname(file.fileName) || mimeToExt(file.mimeType);
    const uniqueName = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}${ext}`;
    const storagePath = `${folder}/${uniqueName}`;

    let url: string;

    if (STORAGE_PROVIDER === 'firebase') {
      url = await uploadToFirebase(file.data, storagePath, file.mimeType);
    } else {
      url = await uploadToLocal(file.data, storagePath);
    }

    logger.info({ storagePath, size: file.data.length, mimeType: file.mimeType }, 'File uploaded');

    res.json({
      data: { url, path: storagePath, fileName: uniqueName },
      success: true,
      message: 'Archivo subido correctamente',
    });
  } catch (err) {
    if (err instanceof Error && err.message === 'File too large') {
      res.status(413).json({ data: null, success: false, message: 'El archivo excede el límite de 10MB' });
      return;
    }
    next(err);
  }
});

// ── Firebase Storage upload ─────────────────────────────────────────────────

async function uploadToFirebase(data: Buffer, storagePath: string, mimeType: string): Promise<string> {
  const bucket = process.env['FIREBASE_STORAGE_BUCKET'];
  if (!bucket) throw new Error('FIREBASE_STORAGE_BUCKET no configurado');

  // Dynamic require — firebase-admin is an optional production dependency
  let admin: {
    apps: unknown[];
    credential: { cert: (sa: unknown) => unknown };
    initializeApp: (config: unknown) => void;
    storage: () => { bucket: () => { file: (p: string) => { save: (d: Buffer, o: unknown) => Promise<void>; makePublic: () => Promise<void> } } };
  };
  try {
    admin = require('firebase-admin') as typeof admin;
  } catch {
    throw new Error('firebase-admin no está instalado. Instálalo con: npm install firebase-admin');
  }

  // Initialize Firebase Admin if not already done
  if (!admin.apps.length) {
    const serviceAccountPath = process.env['FIREBASE_SERVICE_ACCOUNT_JSON'];
    if (serviceAccountPath) {
      let credential;
      if (serviceAccountPath.startsWith('{')) {
        credential = admin.credential.cert(JSON.parse(serviceAccountPath));
      } else {
        const fs = await import('fs');
        const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
        credential = admin.credential.cert(serviceAccount);
      }
      admin.initializeApp({ credential, storageBucket: bucket });
    } else {
      admin.initializeApp({ storageBucket: bucket });
    }
  }

  const storageBucket = admin.storage().bucket();
  const file = storageBucket.file(storagePath);

  await file.save(data, {
    metadata: { contentType: mimeType },
    resumable: false,
    public: true,
  });

  await file.makePublic();
  return `https://storage.googleapis.com/${bucket}/${storagePath}`;
}

// ── Local Storage upload (development) ──────────────────────────────────────

async function uploadToLocal(data: Buffer, storagePath: string): Promise<string> {
  const fs = await import('fs');
  const uploadDir = process.env['LOCAL_UPLOAD_DIR'] ?? './uploads';
  const baseUrl = process.env['LOCAL_UPLOAD_BASE_URL'] ?? 'http://localhost:3000/uploads';

  const fullPath = path.join(uploadDir, storagePath);
  const dir = path.dirname(fullPath);

  // Create directory if it doesn't exist
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(fullPath, data);

  return `${baseUrl}/${storagePath}`;
}

// ── Multipart parser ────────────────────────────────────────────────────────

interface ParsedFile {
  fileName: string;
  mimeType: string;
  data: Buffer;
}

function parseMultipartFile(body: Buffer, boundary: string): ParsedFile | null {
  const boundaryBuffer = Buffer.from(`--${boundary}`);
  const parts = splitBuffer(body, boundaryBuffer);

  for (const part of parts) {
    const headerEnd = part.indexOf('\r\n\r\n');
    if (headerEnd === -1) continue;

    const headers = part.slice(0, headerEnd).toString('utf8');
    if (!headers.includes('name="file"')) continue;

    // Extract filename
    const filenameMatch = headers.match(/filename="([^"]+)"/);
    const fileName = filenameMatch ? filenameMatch[1] : 'upload.bin';

    // Extract content type
    const ctMatch = headers.match(/Content-Type:\s*(.+)/i);
    const mimeType = ctMatch ? ctMatch[1].trim() : 'application/octet-stream';

    // File data starts after \r\n\r\n and ends before trailing \r\n
    let data = part.slice(headerEnd + 4);
    if (data.length > 2 && data[data.length - 2] === 0x0d && data[data.length - 1] === 0x0a) {
      data = data.slice(0, -2);
    }

    return { fileName, mimeType, data };
  }

  return null;
}

function splitBuffer(buffer: Buffer, delimiter: Buffer): Buffer[] {
  const parts: Buffer[] = [];
  let start = 0;

  while (true) {
    const idx = buffer.indexOf(delimiter, start);
    if (idx === -1) {
      parts.push(buffer.slice(start));
      break;
    }
    if (idx > start) {
      parts.push(buffer.slice(start, idx));
    }
    start = idx + delimiter.length;
  }

  return parts;
}

function mimeToExt(mime: string): string {
  const map: Record<string, string> = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'image/gif': '.gif',
    'application/pdf': '.pdf',
  };
  return map[mime] ?? '.bin';
}

export { router as uploadRouter };
