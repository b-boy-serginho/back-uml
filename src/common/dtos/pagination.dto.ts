import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsOptional, IsPositive, Min } from 'class-validator';

export class PaginationDto {
 
  @ApiProperty({
    example:'5',
    description:'number of projects to show',
    
  })
  @IsOptional()
  @IsPositive()
  //Transforma a numero lo que llega de la url como string
  @Type(() => Number)
  limit?: number;

  @IsOptional()
  @Min(0)
  @Type(() => Number)
  offset?: number;
}
