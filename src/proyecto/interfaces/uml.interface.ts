export interface UMLParameter {
  name: string;
  type: string;
}

export interface UMLAttribute {
  id: string;
  name: string;
  type: string;
  visibility: 'public' | 'private' | 'protected' | 'package';
  isStatic?: boolean;
  isPrimaryKey?: boolean;
  isUnique?: boolean;
  isNullable?: boolean;
  defaultValue?: string;
  columnName?: string;
}

export interface UMLMethod {
  id: string;
  name: string;
  returnType: string;
  parameters: UMLParameter[];
  visibility: 'public' | 'private' | 'protected' | 'package';
  isStatic?: boolean;
  isAbstract?: boolean;
}

export interface UMLClass {
  id: string;
  name: string;
  attributes: UMLAttribute[];
  methods?: UMLMethod[];
  position: { x: number; y: number };
  isAbstract?: boolean;
  isInterface?: boolean;
  stereotype?: string;
}

export type RelationType = 
  | 'association' 
  | 'aggregation' 
  | 'composition' 
  | 'inheritance' 
  | 'realization'
  | 'associationClass';

export interface UMLRelation {
  id: string;
  fromClassId: string;
  toClassId: string;
  type: RelationType;
  label?: string;
  multiplicity?: {
    from?: string;
    to?: string;
  };
  // Para clases de asociación
  associationClassId?: string;
}

export interface UMLDiagram {
  id: string;
  name: string;
  classes: UMLClass[];
  relations: UMLRelation[];
}

export const VISIBILITY_SYMBOLS = {
  public: '+',
  private: '-',
  protected: '#',
  package: '~'
};


export interface RelationMetadata {
    type: string;
    targetClass: string;
    fieldName: string;
    mappedBy?: string;
    isOwner: boolean;
    multiplicity?: { from?: string; to?: string };
}



export interface TransactionalMetadata {
    classId: string;
    className: string;
    masterClassId: string;
    masterClassName: string;
    detailClassId: string;
    detailClassName: string;
    transactionClassId: string;
    transactionClassName: string;
    type: 'ASSOCIATION_CLASS' | 'DETAIL_CLASS';
    isTransactional: boolean;
}