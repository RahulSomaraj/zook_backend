import { PartialType } from '@nestjs/swagger';
import { CreateCatalogProductDto } from './create-catalog-product.dto';

/**
 * Admin-editable catalog fields. All optional — only provided keys are updated
 * (PATCH semantics). `status` doubles as publish/unpublish. Supplying `specs`
 * replaces the stored variant/spec lists wholesale.
 */
export class UpdateCatalogProductDto extends PartialType(
  CreateCatalogProductDto,
) {}
