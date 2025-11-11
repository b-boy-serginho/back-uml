import { Injectable } from '@nestjs/common';
import { CreateProyectoDto } from './dto/create-proyecto.dto';
import { Proyecto } from './entities/proyecto.entity';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';

import { JwtService } from '@nestjs/jwt';
import { DateTime } from 'luxon';

@Injectable()
export class ProyectoService {


  constructor(

    @InjectRepository(Proyecto)
    private readonly proyectoRepository: Repository<Proyecto>,
    private jwtService: JwtService
  ) { }


  async findAllByUser(userid: string) {
    const proyectos = await this.proyectoRepository.findBy({ userId: userid })
    return proyectos
  }

  async findAll() {
    return await this.proyectoRepository.find()
  }

  async create(CreateProyectoDto:CreateProyectoDto) {
    return this.proyectoRepository.save(CreateProyectoDto);
  }

  async findOneP(id: string) {
    const product = await this.proyectoRepository.findOneBy({ id });
    return product;
  }  

  async delete(id: string) {
    const result = await this.proyectoRepository.delete(id);
    return result;
  }



}
