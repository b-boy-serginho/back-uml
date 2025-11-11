import { Module } from '@nestjs/common';
import { DiagramController } from './diagram.controller';
import { Diagram } from './entities/diagram.entity';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DiagramService } from './diagram.service';


@Module({
  controllers: [DiagramController],
  providers: [DiagramService],
  imports:[
    TypeOrmModule.forFeature([
      Diagram,
    ])
  ],
  exports:[
    TypeOrmModule,
    DiagramService
  ],

})
export class DiagramModule {}
