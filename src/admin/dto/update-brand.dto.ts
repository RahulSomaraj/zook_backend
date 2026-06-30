import { PartialType } from '@nestjs/swagger';
import { CreateBrandDto } from './create-brand.dto';

/** Admin-editable brand fields. All optional (PATCH semantics). */
export class UpdateBrandDto extends PartialType(CreateBrandDto) {}
