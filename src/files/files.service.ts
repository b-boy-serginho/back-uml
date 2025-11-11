import { BadRequestException, Injectable } from '@nestjs/common';
import { CreateFileDto } from './dto/create-file.dto';
import { UpdateFileDto } from './dto/update-file.dto';
import { join } from 'path';
import { existsSync } from 'fs';

@Injectable()
export class FilesService {
  
  getStaticProductImage(imageName:string)

  {
    const path= join(__dirname,'../../static/proyects',imageName)

    if(!existsSync(path)){
      throw new BadRequestException(`No product found whith image ${imageName}`);
    }
    return path

  }  
  
  
  create(createFileDto: CreateFileDto) {
    return 'This action adds a new file';
  }

  findAll() {
    return `This action returns all files`;
  }

  findOne(id: number) {
    return `This action returns a #${id} file`;
  }

  update(id: number, updateFileDto: UpdateFileDto) {
    return `This action updates a #${id} file`;
  }

  remove(id: number) {
    return `This action removes a #${id} file`;
  }
}
