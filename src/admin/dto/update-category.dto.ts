import { PartialType } from '@nestjs/swagger';
import { CreateCategoryDto } from './create-category.dto';

/** Admin-editable category fields. All optional (PATCH semantics). */
export class UpdateCategoryDto extends PartialType(CreateCategoryDto) {}
