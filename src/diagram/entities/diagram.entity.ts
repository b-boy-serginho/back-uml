import { Proyecto } from "src/proyecto/entities/proyecto.entity";
import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";


export enum tipo {
  class = 'class',
  activity = 'activity',
  use_case = 'use_case',
  sequence = 'sequence',
}


@Entity()
export class Diagram {

  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('text')
  name: string

  @Column('text')
  description: string
  @Column({
    type: 'enum',
    nullable: true,
    enum: tipo,
    default: tipo.class,
  })
  tipo: tipo

  @CreateDateColumn({ type: 'timestamp', name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp', name: 'updated_at' })
  updatedAt: Date;



  @Column('text')
  proyectoid: string;

  @ManyToOne(() => Proyecto, (proyecto) => proyecto.diagrams,
    { onDelete: 'CASCADE' }
  )
  @JoinColumn({ name: 'proyectoid' })
  proyecto: Proyecto;


}