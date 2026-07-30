import { PartialType } from '@nestjs/swagger';
import { CreatePolicyDto } from './create-policy.dto';

/** Admin-editable policy fields. All optional (PATCH semantics). */
export class UpdatePolicyDto extends PartialType(CreatePolicyDto) {}
