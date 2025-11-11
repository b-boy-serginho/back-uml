import { Injectable } from "@nestjs/common";
import { Diagram } from "./entities/diagram.entity";
import { Repository } from "typeorm";
import { DiagramDto } from "./dto/diagram.dto";
import { InjectRepository } from "@nestjs/typeorm";



@Injectable()
export class DiagramService {

    constructor(

        @InjectRepository(Diagram)
        private readonly diagramRepository: Repository<Diagram>
    ) { }


    async create(diagramData: DiagramDto) {
        
        return this.diagramRepository.save(diagramData);
    }

    async findAll() {
        return await this.diagramRepository.find();
    }

    async findAllByProject(proyectoId: string) {
        const diagrams = await this.diagramRepository.findBy({ proyectoid: proyectoId });
        return diagrams;
    }

    async edit(id: string, diagramData: DiagramDto) {
        await this.diagramRepository.update(id, diagramData);
        const updatedDiagram = await this.diagramRepository.findOneBy({ id });
        return updatedDiagram;
    }

    async findOne(id: string) {
        const diagram = await this.diagramRepository.findOneBy({ id });
        return diagram;
    }

    async delete(id: string) {
        const result = await this.diagramRepository.delete(id);
        return result;
    }






}