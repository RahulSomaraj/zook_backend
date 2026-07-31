import { Controller, Get, Param, ParseEnumPipe } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PolicyType } from '@prisma/client';
import { PoliciesService } from './policies.service';

/**
 * Public policy endpoints — NO auth. The apps fetch the active Terms &
 * Conditions / Privacy Policy to display to users.
 */
@ApiTags('policies')
@Controller('policies')
export class PoliciesController {
  constructor(private readonly policies: PoliciesService) {}

  @Get()
  @ApiOperation({ summary: 'List active policies (public)' })
  list() {
    return this.policies.listActive();
  }

  @Get(':type')
  @ApiOperation({
    summary:
      'Get the active policy of a type: terms_and_conditions or privacy_policy (public)',
  })
  getByType(@Param('type', new ParseEnumPipe(PolicyType)) type: PolicyType) {
    return this.policies.getByType(type);
  }
}
