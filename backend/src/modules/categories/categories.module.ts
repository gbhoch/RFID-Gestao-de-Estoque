import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CategoryController } from './presentation/category.controller';
import { CategoryService } from './application/category.service';
import { CategoryOrmEntity } from './infrastructure/category.orm-entity';

@Module({
  imports: [TypeOrmModule.forFeature([CategoryOrmEntity])],
  controllers: [CategoryController],
  providers: [CategoryService],
  exports: [CategoryService],
})
export class CategoriesModule {}
