import { Controller, Get, Post, Body, Patch, Param, Delete, UploadedFile, UseInterceptors, BadRequestException, Res } from '@nestjs/common';
import { FilesService } from './files.service';
import { CreateFileDto } from './dto/create-file.dto';
import { UpdateFileDto } from './dto/update-file.dto';
import { FileInterceptor } from '@nestjs/platform-express';
import { filFilter,fileName } from './helpers/index';
import {Response } from 'express';




import { diskStorage } from 'multer';
import { ConfigService } from '@nestjs/config';
import { ApiTags } from '@nestjs/swagger';


@ApiTags('Files')
@Controller('files')
export class FilesController {
  constructor(private readonly filesService: FilesService
    ,private readonly configService:ConfigService) {}


  @Post('proyect')
  @UseInterceptors(FileInterceptor('file',{
    fileFilter: filFilter,
    //limits:{fileSize}
    storage:diskStorage({
      destination:'./static/products',
      filename:fileName, 
    })
  })) //file es el nombre del body en postman
  
  uploadproductImage(@UploadedFile() file:Express.Multer.File,){
    
     if(!file){
      throw new BadRequestException('asegurate de que el archivo sea una json')
     }
     const secureUrl= `${this.configService.get('HOST_API')}/files/product/${file.filename}`;
    //console.log('ale')
    return {secureUrl};
  
  
  }
  

  @Get('proyect/:jsonName')
   FindProductimage(
    @Res() res:Response,
    @Param('jsonName') imageName:string
   ){
    const path= this.filesService.getStaticProductImage(imageName)
      res.sendFile(path)
      //return path;
   }



  @Get()
  findAll() {
    return this.filesService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.filesService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateFileDto: UpdateFileDto) {
    return this.filesService.update(+id, updateFileDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.filesService.remove(+id);
  }
}
