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
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiExtraModels,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { RolesGuard } from '../common/guards/roles.guard';
import { CategorySpecificationsService } from './category_specifications.service';
import {
  ApiEnvelopeDto,
  ArchiveResultDto,
  CategorySpecificationListDto,
  CategorySpecificationResponseDto,
  RestoreResultDto,
  envelope,
} from './dto/category_specification-response.dto';
import { CreateCategorySpecificationDto } from './dto/create-category_specification.dto';
import { ListCategorySpecificationQueryDto } from './dto/list-category_specification.dto';
import { UpdateCategorySpecificationDto } from './dto/update-category_specification.dto';

const ID_PARAM = {
  name: 'id',
  format: 'uuid',
  description: 'Category specification id.',
} as const;

@ApiTags('admin-category-specifications')
@ApiBearerAuth('access-token')
@ApiExtraModels(
  ApiEnvelopeDto,
  ArchiveResultDto,
  CategorySpecificationListDto,
  CategorySpecificationResponseDto,
  RestoreResultDto,
)
@ApiUnauthorizedResponse({ description: 'Missing or expired access token.' })
@ApiForbiddenResponse({ description: 'Caller is not an admin.' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('admin/category-specifications')
export class CategorySpecificationsController {
  constructor(private readonly specs: CategorySpecificationsService) {}

  @Get()
  @ApiOperation({
    summary:
      'List category specifications (paginated; filter by categoryId, isActive, search)',
    description:
      'Pass `categoryId` to get the field definitions a product form should render for that category, ordered by `sortOrder` then `label`. Archived rows are hidden unless `includeDeleted=true`.',
  })
  @ApiOkResponse({
    description:
      'A page of specifications, each with its recorded-value count.',
    schema: envelope(CategorySpecificationListDto),
  })
  @ApiBadRequestResponse({ description: 'Invalid query parameters.' })
  list(@Query() query: ListCategorySpecificationQueryDto) {
    return this.specs.list(query);
  }

  @Post()
  @ApiOperation({
    summary: 'Define a specification field for a category',
    description:
      'Labels are unique per category. The uniqueness check spans archived rows, so re-adding a previously archived label returns 409 pointing at the restore endpoint rather than creating a duplicate. A category is capped at 6 live fields; archived ones do not count towards it.',
  })
  @ApiCreatedResponse({
    description: 'The created specification.',
    schema: envelope(CategorySpecificationResponseDto),
  })
  @ApiBadRequestResponse({ description: 'Validation failed on the body.' })
  @ApiNotFoundResponse({ description: 'Category not found.' })
  @ApiConflictResponse({
    description:
      'Category is archived, already has 6 specifications, or a specification with this label already exists for it (possibly archived).',
  })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateCategorySpecificationDto,
  ) {
    return this.specs.create(user.id, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Specification detail (with recorded-value count)' })
  @ApiParam(ID_PARAM)
  @ApiOkResponse({
    description: 'The specification, including how many products use it.',
    schema: envelope(CategorySpecificationResponseDto),
  })
  @ApiNotFoundResponse({ description: 'Category specification not found.' })
  getById(@Param('id', ParseUUIDPipe) id: string) {
    return this.specs.getById(id);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update specification label, order or active flag',
    description:
      '`categoryId` cannot be changed: moving a specification between categories would strand the values already recorded against it. Set `isActive: false` to hide the field from the product form without archiving it.',
  })
  @ApiParam(ID_PARAM)
  @ApiOkResponse({
    description: 'The updated specification.',
    schema: envelope(CategorySpecificationResponseDto),
  })
  @ApiBadRequestResponse({ description: 'Validation failed on the body.' })
  @ApiNotFoundResponse({ description: 'Category specification not found.' })
  @ApiConflictResponse({
    description:
      'Specification is archived, or the new label is taken within the category.',
  })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCategorySpecificationDto,
  ) {
    return this.specs.update(user.id, id, dto);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Soft-delete (archive) a specification',
    description:
      'The row is retained so already-recorded product values are never orphaned. The label stays reserved within the category until the row is restored.',
  })
  @ApiParam(ID_PARAM)
  @ApiOkResponse({
    description: 'The specification was archived.',
    schema: envelope(ArchiveResultDto),
  })
  @ApiNotFoundResponse({ description: 'Category specification not found.' })
  @ApiConflictResponse({ description: 'Specification is already archived.' })
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.specs.softDelete(user.id, id);
  }

  @Post(':id/restore')
  @ApiOperation({ summary: 'Restore a soft-deleted specification' })
  @ApiParam(ID_PARAM)
  // 201, not 200: Nest's default status for POST, left as-is to match the
  // restore endpoints on the other admin resources.
  @ApiResponse({
    status: 201,
    description: 'The specification was restored.',
    schema: envelope(RestoreResultDto),
  })
  @ApiNotFoundResponse({ description: 'Category specification not found.' })
  @ApiConflictResponse({ description: 'Specification is not archived.' })
  restore(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.specs.restore(user.id, id);
  }
}
