import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { mkdir, readFile, readdir, rm, writeFile } from 'fs/promises';
import { isAbsolute, join, relative, resolve } from 'path';
import { Types } from 'mongoose';

const IMAGE_TYPES = {
  'image/jpeg': { extension: 'jpg', signature: (data: Buffer) => data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff },
  'image/png': { extension: 'png', signature: (data: Buffer) => data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) },
  'image/webp': { extension: 'webp', signature: (data: Buffer) => data.toString('ascii', 0, 4) === 'RIFF' && data.toString('ascii', 8, 12) === 'WEBP' },
} as const;
const FILE_NAME = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(?:jpg|png|webp)$/i;
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

export type PersistedMedia = {
  imageUrls: string[];
  sketchUrl?: string | null;
  createdFiles: string[];
};

@Injectable()
export class OrderMediaStorage {
  private readonly root = resolve(process.env.UPLOADS_DIR ?? join(process.cwd(), 'uploads'));

  async persistOrderMedia(
    orderId: string,
    imageUrls: string[],
    sketchUrl?: string | null,
  ): Promise<PersistedMedia> {
    const createdFiles: string[] = [];
    try {
      const persistedImages: string[] = [];
      for (const image of imageUrls) {
        const result = await this.persistDataUrl(orderId, image);
        persistedImages.push(result.path);
        if (result.createdFile) createdFiles.push(result.createdFile);
      }

      let persistedSketch = sketchUrl;
      if (typeof sketchUrl === 'string') {
        const result = await this.persistDataUrl(orderId, sketchUrl);
        persistedSketch = result.path;
        if (result.createdFile) createdFiles.push(result.createdFile);
      }

      return { imageUrls: persistedImages, sketchUrl: persistedSketch, createdFiles };
    } catch (error) {
      await this.removeFiles(createdFiles);
      throw error;
    }
  }

  async readMedia(orderId: string, fileName: string) {
    if (!Types.ObjectId.isValid(orderId) || !FILE_NAME.test(fileName)) {
      throw new NotFoundException('Media not found');
    }

    const directory = this.orderDirectory(orderId);
    const path = resolve(directory, fileName);
    const pathFromDirectory = relative(directory, path);
    if (pathFromDirectory.startsWith('..') || isAbsolute(pathFromDirectory)) {
      throw new NotFoundException('Media not found');
    }

    const data = await readFile(path).catch(() => {
      throw new NotFoundException('Media file not found');
    });
    const extension = fileName.split('.').pop();
    const contentType = extension === 'jpg' ? 'image/jpeg' : extension === 'png' ? 'image/png' : 'image/webp';
    return { data, contentType };
  }

  async removeFiles(files: string[]) {
    await Promise.all(files.map((file) => rm(file, { force: true })));
  }

  async removeUnreferencedFiles(orderId: string, references: string[]) {
    const directory = this.orderDirectory(orderId);
    const names = await readdir(directory).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return [];
      throw error;
    });
    const referenced = new Set(
      references.map((reference) => reference.split('/').pop()),
    );
    const obsolete = names
      .filter((name) => FILE_NAME.test(name) && !referenced.has(name))
      .map((name) => join(directory, name));
    await this.removeFiles(obsolete);
  }

  async removeOrderFiles(orderId: string) {
    if (!/^[a-f\d]{24}$/i.test(orderId)) {
      throw new NotFoundException('Order media not found');
    }
    await rm(this.orderDirectory(orderId), { recursive: true, force: true });
  }

  private async persistDataUrl(orderId: string, value: string) {
    const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
    if (!match) {
      const savedPath = /^\/api\/orders\/([a-f\d]{24})\/media\/([^/]+)$/i.exec(value);
      if (savedPath?.[1] === orderId && FILE_NAME.test(savedPath[2])) {
        return { path: value, createdFile: undefined };
      }
      throw new BadRequestException('Order media must be a supported image or a saved media path');
    }

    const contentType = match[1] as keyof typeof IMAGE_TYPES;
    const definition = IMAGE_TYPES[contentType];
    const data = Buffer.from(match[2], 'base64');
    if (
      !data.length ||
      data.length > MAX_IMAGE_BYTES ||
      !definition.signature(data)
    ) {
      throw new BadRequestException('Order image is invalid or exceeds the 2 MB limit');
    }

    const fileName = `${randomUUID()}.${definition.extension}`;
    const directory = this.orderDirectory(orderId);
    await mkdir(directory, { recursive: true });
    const filePath = join(directory, fileName);
    await writeFile(filePath, data, { flag: 'wx' });
    return {
      path: `/api/orders/${orderId}/media/${fileName}`,
      createdFile: filePath,
    };
  }

  private orderDirectory(orderId: string) {
    return resolve(this.root, orderId);
  }

}
