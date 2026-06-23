import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PresignDownloadDto } from './dto/presign-download.dto';
import { PresignUploadDto } from './dto/presign-upload.dto';
import { StorageService } from './storage.service';

/**
 * Signed-URL endpoints. Any authenticated user may request a URL; the bucket
 * is constrained to the `StorageBucket` enum by DTO validation, so callers
 * cannot target arbitrary buckets. Add `@Roles(...)` here if a category should
 * be restricted to specific roles.
 */
@ApiTags('storage')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('storage')
export class StorageController {
  constructor(private readonly storage: StorageService) {}

  @Post('uploads/sign')
  @ApiOperation({
    summary: 'Create a single-use signed upload URL for a bucket',
  })
  signUpload(@Body() dto: PresignUploadDto) {
    return this.storage.createSignedUploadUrl(dto.bucket, dto.filename, {
      folder: dto.folder,
      upsert: dto.upsert,
    });
  }

  @Post('downloads/sign')
  @ApiOperation({
    summary: 'Create a time-limited signed download URL for a private object',
  })
  signDownload(@Body() dto: PresignDownloadDto) {
    return this.storage.createSignedDownloadUrl(dto.bucket, dto.key, {
      expiresIn: dto.expiresIn,
    });
  }
}
