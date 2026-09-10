import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AssetOrmEntity } from '../assets/infrastructure/asset.orm-entity';
import { RfidTagOrmEntity } from '../rfid-tags/infrastructure/rfid-tag.orm-entity';
import { InventoryOrmEntity } from '../inventory/infrastructure/inventory.orm-entity';
import { SectorOrmEntity } from '../sectors/infrastructure/sector.orm-entity';
import { DashboardService } from './application/dashboard.service';
import { DashboardController } from './presentation/dashboard.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      AssetOrmEntity,
      RfidTagOrmEntity,
      InventoryOrmEntity,
      SectorOrmEntity,
    ]),
  ],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
