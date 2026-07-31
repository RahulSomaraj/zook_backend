import { OmitType, PartialType } from '@nestjs/swagger';
import { CreateProductSpecificationDto } from './create-product-specification.dto';

/**
 * Admin-editable specification fields. All optional (PATCH semantics).
 *
 * `specId` is omitted: repointing a row at a different definition is really a
 * delete plus a create, and allowing it here would let the stored `label`
 * snapshot drift away from the definition it claims to answer.
 */
export class UpdateProductSpecificationDto extends PartialType(
  OmitType(CreateProductSpecificationDto, ['specId'] as const),
) {}
