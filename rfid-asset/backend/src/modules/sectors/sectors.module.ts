import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SectorController } from './presentation/sector.controller';
import { SectorService } from './application/sector.service';
import { SectorOrmEntity } from './infrastructure/sector.orm-entity';

@Module({
  imports: [TypeOrmModule.forFeature([SectorOrmEntity])],
  controllers: [SectorController],
  providers: [SectorService],
  exports: [SectorService],
})
export class SectorsModule {}
