import { IsNotEmpty, IsString, IsObject } from 'class-validator';
import { UMLDiagram } from '../interfaces/uml.interface';

export class ExportSpringBootDto {
  @IsNotEmpty()
  @IsObject()
  diagram: UMLDiagram;

  @IsNotEmpty()
  @IsString()
  projectName: string;

  @IsNotEmpty()
  @IsString()
  basePackage: string;
}
