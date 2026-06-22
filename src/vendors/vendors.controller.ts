import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { RolesGuard } from '../common/guards/roles.guard';
import { SubmitKycDto } from './dto/submit-kyc.dto';
import { UploadDocumentQueryDto } from './dto/upload-document.dto';
import { VendorsService } from './vendors.service';

interface UploadedDocument {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
}

@ApiTags('vendors')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.VENDOR)
@Controller('vendors')
export class VendorsController {
  constructor(private readonly vendors: VendorsService) {}

  @Get('me')
  @ApiOperation({ summary: 'Authenticated vendor profile + KYC summary' })
  getMe(@CurrentUser() user: AuthenticatedUser) {
    return this.vendors.getMe(user.id);
  }

  @Get('me/onboarding-status')
  @ApiOperation({ summary: 'KYC onboarding tracker (4 steps)' })
  onboardingStatus(@CurrentUser() user: AuthenticatedUser) {
    return this.vendors.onboardingStatus(user.id);
  }

  @Post('me/kyc/documents')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload one KYC document, returns its stored URL' })
  @UseInterceptors(FileInterceptor('file'))
  uploadDocument(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: UploadDocumentQueryDto,
    @UploadedFile() file: UploadedDocument,
  ) {
    return this.vendors.uploadDocument(user.id, query.kind, file);
  }

  @Post('me/kyc')
  @ApiOperation({ summary: 'Submit KYC documents for review (KYC step 2)' })
  submitKyc(@CurrentUser() user: AuthenticatedUser, @Body() dto: SubmitKycDto) {
    return this.vendors.submitKyc(user.id, dto);
  }
}
