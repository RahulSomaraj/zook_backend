import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { RolesGuard } from '../common/guards/roles.guard';
import { AdminPoliciesService } from './admin-policies.service';
import { CreatePolicyDto } from './dto/create-policy.dto';
import { ListPolicyQueryDto } from './dto/list-policy.dto';
import { UpdatePolicyDto } from './dto/update-policy.dto';

@ApiTags('admin-policies')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('admin/policies')
export class AdminPoliciesController {
  constructor(private readonly policies: AdminPoliciesService) {}

  @Get()
  @ApiOperation({ summary: 'List policies (paginated; filter by isActive)' })
  list(@Query() query: ListPolicyQueryDto) {
    return this.policies.list(query);
  }

  @Post()
  @ApiOperation({ summary: 'Create a policy' })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreatePolicyDto,
  ) {
    return this.policies.create(user.id, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Policy detail' })
  getById(@Param('id', ParseUUIDPipe) id: string) {
    return this.policies.getById(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update policy fields' })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePolicyDto,
  ) {
    return this.policies.update(user.id, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Soft-delete (archive) a policy' })
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.policies.softDelete(user.id, id);
  }

  @Post(':id/restore')
  @ApiOperation({ summary: 'Restore a soft-deleted policy' })
  restore(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.policies.restore(user.id, id);
  }
}
