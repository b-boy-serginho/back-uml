import { Body, Controller, Delete, Get, Param, Patch, Post } from "@nestjs/common";
import { DiagramService } from "./diagram.service";
import { DiagramDto } from "./dto/diagram.dto";



@Controller('diagram')
export class DiagramController {


    constructor(
        private readonly diagramService: DiagramService
    ) {

    }


    @Post()
    async create(@Body() body: DiagramDto) {
        return await this.diagramService.create(body);
    }

    @Get()
    async findAll() {
        return await this.diagramService.findAll();
    }


    @Get('project/:proyectoId')
    async findAllByProject(@Param('proyectoId') proyectoId: string) {
        console.log("llega por aca al controller", proyectoId);
        return await this.diagramService.findAllByProject(proyectoId);
    }

    @Post(':id')
    async edit(@Param('id') id: string, @Body() diagramData: DiagramDto) {
        return await this.diagramService.edit(id, diagramData);
    }

    @Patch(':id')
    async update(@Param('id') id: string, @Body() diagramData: DiagramDto) {
        return await this.diagramService.edit(id, diagramData);
    }

    @Get(':id')
    async findOne(@Param('id') id: string) {
        return await this.diagramService.findOne(id);
    }

    @Delete(':id')
    async delete(@Param('id') id: string) {
        return await this.diagramService.delete(id);
    }
}