import { PartialType } from '@nestjs/swagger';
import { CreateProductSpecificationDto } from './create-product-specification.dto';

/** Admin-editable specification fields. All optional (PATCH semantics). */
export class UpdateProductSpecificationDto extends PartialType(
  CreateProductSpecificationDto,
) {}
