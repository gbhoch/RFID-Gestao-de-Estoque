import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InventoryController } from './presentation/inventory.controller';
import { InventoryService } from './application/inventory.service';
import {
  InventoryOrmEntity, InventorySectorVisitOrmEntity,
  InventoryReadOrmEntity, InventoryDiscrepancyOrmEntity,
} from './infrastructure/inventory.orm-entity';
import { AssetOrmEntity } from '../assets/infrastructure/asset.orm-entity';
import { RfidTagOrmEntity } from '../rfid-tags/infrastructure/rfid-tag.orm-entity';
import {
  AssetMovementOrmEntity, AssetLocationHistoryOrmEntity,
} from '../movements/infrastructure/movement.orm-entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      InventoryOrmEntity, InventorySectorVisitOrmEntity,
      InventoryReadOrmEntity, InventoryDiscrepancyOrmEntity,
      AssetOrmEntity, RfidTagOrmEntity,
      AssetMovementOrmEntity, AssetLocationHistoryOrmEntity,
    ]),
  ],
  controllers: [InventoryController],
  providers: [InventoryService],
  exports: [InventoryService],
})
export class InventoryModule {}
