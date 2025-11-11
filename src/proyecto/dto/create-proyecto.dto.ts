import { IsDate, IsEnum, IsJSON, IsPositive, IsString, IsUUID, MinLength, isUUID } from "class-validator";
import { UUID } from "crypto";
import { visibility } from "../entities/proyecto.entity";

export class CreateProyectoDto {

 @IsString()
 @MinLength(7)
 name:string;

 @IsString()
 description:string;


 @IsString()
 userId:string;

 @IsEnum(visibility)
 visibility:visibility ;
}
