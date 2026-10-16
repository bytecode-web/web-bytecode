import crypto from 'node:crypto';
import { v2 as cloudinary, type UploadApiResponse } from 'cloudinary';
import { env } from '../config/env.js';
import { CLOUDINARY_UPLOAD_FOLDER } from '../config/constants.js';
import { getCloudinaryConfig } from '../services/settings.js';

const CLOUDINARY_UPLOAD_TIMEOUT_MS = Number(process.env.CLOUDINARY_UPLOAD_TIMEOUT_MS ?? 30000);

export type CloudinaryResourceType = 'image' | 'raw' | 'auto';

export type CloudinaryStoredAsset = {
  publicId: string;
  secureUrl: string;
  bytes: number;
  resourceType: CloudinaryResourceType;
};

const configureCloudinary = async () => {
  const config = await getCloudinaryConfig();

  if (!config.cloudName || !config.apiKey || !config.apiSecret) {
    throw new Error('Cloudinary is not configured.');
  }

  cloudinary.config({
    cloud_name: config.cloudName,
    api_key: config.apiKey,
    api_secret: config.apiSecret,
    secure: true,
  });
};

const resourceTypeForMime = (_mimeType: string): CloudinaryResourceType => (
  'auto'
);

const createPublicId = (prefix: string) => {
  const normalizedPrefix = prefix.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-|-$/g, '');
  return `${normalizedPrefix || 'evidence'}-${crypto.randomUUID()}`;
};

export async function uploadComplaintEvidenceToCloudinary(input: {
  buffer: Buffer;
  complaintCode: string;
  originalName: string;
  mimeType: string;
}): Promise<CloudinaryStoredAsset> {
  await configureCloudinary();
  const resourceType = resourceTypeForMime(input.mimeType);

  return new Promise((resolve, reject) => {
    let isSettled = false;
    const fail = (error: unknown) => {
      if (isSettled) return;
      isSettled = true;
      clearTimeout(timeout);
      reject(error);
    };
    const timeout = setTimeout(() => {
      stream.destroy(new Error('Cloudinary upload timed out.'));
      fail(new Error('Cloudinary upload timed out.'));
    }, CLOUDINARY_UPLOAD_TIMEOUT_MS);

    const stream = cloudinary.uploader.upload_stream(
      {
        folder: CLOUDINARY_UPLOAD_FOLDER,
        public_id: createPublicId(input.complaintCode),
        resource_type: resourceType,
        overwrite: false,
        use_filename: false,
        unique_filename: false,
        filename_override: input.originalName,
      },
      (error, result?: UploadApiResponse) => {
        if (error || !result) {
          fail(error ?? new Error('Cloudinary upload did not return a result.'));
          return;
        }

        if (isSettled) return;
        isSettled = true;
        clearTimeout(timeout);
        resolve({
          publicId: result.public_id,
          secureUrl: result.secure_url,
          bytes: result.bytes,
          resourceType: (result.resource_type as CloudinaryResourceType) || 'image',
        });
      },
    );

    stream.end(input.buffer);
  });
}

export async function uploadPortfolioImageToCloudinary(input: {
  buffer: Buffer;
  itemCode: string;
  originalName: string;
  mimeType: string;
}): Promise<CloudinaryStoredAsset> {
  await configureCloudinary();

  return new Promise((resolve, reject) => {
    let isSettled = false;
    const fail = (error: unknown) => {
      if (isSettled) return;
      isSettled = true;
      clearTimeout(timeout);
      reject(error);
    };
    const timeout = setTimeout(() => {
      stream.destroy(new Error('Cloudinary upload timed out.'));
      fail(new Error('Cloudinary upload timed out.'));
    }, CLOUDINARY_UPLOAD_TIMEOUT_MS);

    const stream = cloudinary.uploader.upload_stream(
      {
        folder: 'bytecode/portfolio',
        public_id: createPublicId(input.itemCode),
        resource_type: 'image',
        overwrite: false,
        use_filename: false,
        unique_filename: false,
        filename_override: input.originalName,
      },
      (error, result?: UploadApiResponse) => {
        if (error || !result) {
          fail(error ?? new Error('Cloudinary upload did not return a result.'));
          return;
        }

        if (isSettled) return;
        isSettled = true;
        clearTimeout(timeout);
        resolve({
          publicId: result.public_id,
          secureUrl: result.secure_url,
          bytes: result.bytes,
          resourceType: 'image',
        });
      },
    );

    stream.end(input.buffer);
  });
}

export async function uploadPaymentReceiptToCloudinary(input: {
  buffer: Buffer;
  projectCode: string;
  originalName: string;
  mimeType: string;
}): Promise<CloudinaryStoredAsset> {
  await configureCloudinary();
  const resourceType = resourceTypeForMime(input.mimeType);

  return new Promise((resolve, reject) => {
    let isSettled = false;
    const fail = (error: unknown) => {
      if (isSettled) return;
      isSettled = true;
      clearTimeout(timeout);
      reject(error);
    };
    const timeout = setTimeout(() => {
      stream.destroy(new Error('Cloudinary upload timed out.'));
      fail(new Error('Cloudinary upload timed out.'));
    }, CLOUDINARY_UPLOAD_TIMEOUT_MS);

    const stream = cloudinary.uploader.upload_stream(
      {
        folder: 'bytecode/payments',
        public_id: createPublicId(input.projectCode),
        resource_type: resourceType,
        overwrite: false,
        use_filename: false,
        unique_filename: false,
        filename_override: input.originalName,
      },
      (error, result?: UploadApiResponse) => {
        if (error || !result) {
          fail(error ?? new Error('Cloudinary upload did not return a result.'));
          return;
        }

        if (isSettled) return;
        isSettled = true;
        clearTimeout(timeout);
        resolve({
          publicId: result.public_id,
          secureUrl: result.secure_url,
          bytes: result.bytes,
          resourceType,
        });
      },
    );

    stream.end(input.buffer);
  });
}

export async function deleteCloudinaryAsset(publicId: string, resourceType: CloudinaryResourceType) {
  await configureCloudinary();
  await cloudinary.uploader.destroy(publicId, {
    resource_type: resourceType,
    invalidate: true,
  });
}
