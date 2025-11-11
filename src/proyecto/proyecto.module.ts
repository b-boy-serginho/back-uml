import { Module } from '@nestjs/common';
import { ProyectoService } from './proyecto.service';
import { ProyectoController } from './proyecto.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Proyecto } from './entities/proyecto.entity';

import { AuthModule } from 'src/auth/auth.module';
import { SpringBootExportService } from './springboot-export.service';
import { SpringbootStructureService } from './srpingboot-structure.service';
import { FlutterExportService } from './flutter-export.service';
import { Diagram } from 'src/diagram/entities/diagram.entity';

@Module({
  controllers: [ProyectoController],
  providers: [ProyectoService, SpringBootExportService, SpringbootStructureService, FlutterExportService],
  imports:[
    TypeOrmModule.forFeature([
      Proyecto,
    ]),AuthModule
  ],
  exports:[
    ProyectoService,
    TypeOrmModule,
    SpringBootExportService,
    FlutterExportService
  ],

})
export class ProyectoModule {}
