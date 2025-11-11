import { tipo } from "../entities/diagram.entity";


import { IsOptional, IsString, IsEnum, IsUUID } from 'class-validator';

export class DiagramDto {
  @IsOptional()
  @IsUUID()
  id?: string;

  @IsString()
  name: string;

  @IsString()
  description: string;

  @IsEnum(tipo)
  tipo: tipo;

  @IsUUID()
  proyectoid: string;
}