import { Module } from '@nestjs/common';
import { PrismaModule } from '../database/prisma.module';
import { CategorySpecificationsController } from './category_specifications.controller';
import { CategorySpecificationsService } from './category_specifications.service';

@Module({
  imports: [PrismaModule],
  controllers: [CategorySpecificationsController],
  providers: [CategorySpecificationsService],
  exports: [CategorySpecificationsService],
})
export class CategorySpecificationsModule {}
