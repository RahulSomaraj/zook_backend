import { OmitType, PartialType } from '@nestjs/swagger';
import { CreateCategorySpecificationDto } from './create-category_specification.dto';

/**
 * `categoryId` is omitted on purpose: moving a specification to another
 * category would strand the ProductSpecification values already recorded
 * against it. Archive it here and create it on the target category instead.
 */
export class UpdateCategorySpecificationDto extends PartialType(
  OmitType(CreateCategorySpecificationDto, ['categoryId'] as const),
) {}
