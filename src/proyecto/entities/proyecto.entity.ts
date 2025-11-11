import { User } from "src/auth/entities/user.entity";
import { Diagram } from "src/diagram/entities/diagram.entity";
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn
} from "typeorm";


export enum visibility {
  private = 'private',
  public = 'public',

  shared = 'shared',

}

@Entity()
export class Proyecto {

  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('text')
  name: string;

  @Column('text')
  description: string;

  @CreateDateColumn({ type: 'timestamp', name: 'created_at', nullable: true })
  created: Date;

  @UpdateDateColumn({ type: 'timestamp', name: 'updated_at', nullable: true })
  updated: Date;

  @Column({
    type: 'enum',
    nullable: true,
    enum: visibility,
    default: visibility.private,
  })

  visibility: visibility

  @Column('text', { name: 'userid' })
  userId: string;

  @ManyToOne(() => User, (user) => user.proyects,
    { onDelete: 'CASCADE' }
  )
  @JoinColumn({ name: 'userid' })
  user: User;


  
  @OneToMany(()=>Diagram,(diagrams)=>diagrams.proyectoid,
   {cascade:true,eager:false}
  ) 
   diagrams?:Diagram[]

}
