import { PartialType } from '@nestjs/swagger';
import { CreateCountryDto } from './create-country.dto';

/** Admin-editable country fields. All optional (PATCH semantics). */
export class UpdateCountryDto extends PartialType(CreateCountryDto) {}
