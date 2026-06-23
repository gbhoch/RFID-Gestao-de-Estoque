import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AssetController } from './presentation/asset.controller';
import { AssetService } from './application/asset.service';
import { AssetRepository } from './infrastructure/asset.repository';
import { AssetOrmEntity } from './infrastructure/asset.orm-entity';
import { ASSET_REPOSITORY } from './domain/asset';

@Module({
  imports: [TypeOrmModule.forFeature([AssetOrmEntity])],
  controllers: [AssetController],
  providers: [
    AssetService,
    { provide: ASSET_REPOSITORY, useClass: AssetRepository },
  ],
  exports: [ASSET_REPOSITORY],
})
export class AssetsModule {}
