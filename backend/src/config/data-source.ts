import 'dotenv/config';
import { DataSource, DataSourceOptions } from 'typeorm';

export const dataSourceOptions: DataSourceOptions = {
  type: 'postgres',
  host: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT ?? 5432),
  username: process.env.DB_USER ?? 'rfid',
  password: process.env.DB_PASS ?? 'rfid_secret',
  database: process.env.DB_NAME ?? 'rfid_assets',
  entities: [__dirname + '/../**/*.orm-entity{.ts,.js}'],
  migrations: [__dirname + '/../migrations/*{.ts,.js}'],
  synchronize: false,
  logging: process.env.NODE_ENV === 'development',
};

export default new DataSource(dataSourceOptions);
