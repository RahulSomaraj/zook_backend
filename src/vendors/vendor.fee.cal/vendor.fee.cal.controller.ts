import { Controller } from '@nestjs/common';
import { VendorFeeCalService } from './vendor.fee.cal.service';

@Controller('vendor.fee.cal')
export class VendorFeeCalController {
  constructor(private readonly vendorFeeCalService: VendorFeeCalService) {}
}
